import { createHmac } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { authorize, AppError, type Actor } from "../security";
import { readLimited } from "../http";
import { audit, transaction } from "./ledger";
import type { LeadSearch, LeadStatus } from "../integration-types";

export const leadConfigured = () =>
  Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());
const scope = (a: Actor) => ({
  organizationId: a.organizationId,
  entityType: "INTEGRATION",
  entityId: "brave-search",
});
const dayStart = () => {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return day;
};
export function leadDailyLimit() {
  const value = Number(process.env.LEAD_SEARCH_DAILY_LIMIT || 100);
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : 100;
}
function fingerprint() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret)
    throw new AppError(
      "Application authentication secret is not configured.",
      503,
    );
  return createHmac("sha256", secret)
    .update(process.env.BRAVE_SEARCH_API_KEY?.trim() || "")
    .digest("hex");
}
export async function leadStatus(a: Actor): Promise<LeadStatus> {
  const [last, usedToday] = await Promise.all([
    db.auditEvent.findFirst({
      where: {
        ...scope(a),
        action: { in: ["SEARCH_PASSED", "SEARCH_FAILED"] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    db.auditEvent.count({
      where: {
        ...scope(a),
        action: "SEARCH_STARTED",
        createdAt: { gte: dayStart() },
      },
    }),
  ]);
  const base = {
    configured: leadConfigured(),
    lastSearchAt: null,
    usedToday,
    dailyLimit: leadDailyLimit(),
  };
  if (!base.configured)
    return {
      ...base,
      state: "SETUP_REQUIRED",
      detail:
        "Lead search is implemented. Set BRAVE_SEARCH_API_KEY on the server to search for businesses.",
    };
  const metadata = last?.after as { configHash?: string } | null;
  if (!last || metadata?.configHash !== fingerprint())
    return {
      ...base,
      state: "VERIFICATION_REQUIRED",
      detail:
        "Brave Search is configured. Run a search in Prospecting to verify the connection.",
    };
  if (Date.now() - last.createdAt.getTime() > 86400000)
    return {
      ...base,
      lastSearchAt: last.createdAt.toISOString(),
      state: "VERIFICATION_REQUIRED",
      detail:
        "The last provider request is over 24 hours old. Run a search to check the connection.",
    };
  return {
    ...base,
    lastSearchAt: last.createdAt.toISOString(),
    state: last.action === "SEARCH_PASSED" ? "CONNECTION_VERIFIED" : "ERROR",
    detail: last.summary,
  };
}
const inputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(2)
      .max(400)
      .refine(
        (value) => value.split(/\s+/).length <= 60,
        "Use 60 words or fewer.",
      ),
    location: z.string().trim().max(100).default(""),
    page: z.number().int().min(0).max(9).default(0),
  })
  .refine(
    (input) =>
      `${input.query} ${input.location}`.trim().split(/\s+/).length <= 75,
    "Use 75 words or fewer including the location.",
  );
const responseSchema = z.object({
  type: z.literal("search"),
  query: z
    .object({ more_results_available: z.boolean().optional() })
    .optional(),
  web: z
    .object({
      results: z
        .array(
          z.object({
            title: z.string().max(5000),
            url: z.string().max(10000),
            description: z.string().max(20000).optional(),
          }),
        )
        .max(100),
    })
    .optional(),
});
function publicUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hostname === "localhost" ||
      !url.hostname.includes(".") ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(":")
    )
      return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
function domain(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function searchLeads(a: Actor, raw: unknown): Promise<LeadSearch> {
  authorize(a, "write");
  const input = inputSchema.parse(raw);
  if (!leadConfigured())
    throw new AppError(
      "Lead search setup required. Configure Brave Search in Settings → Integrations.",
      409,
    );
  const configHash = fingerprint();
  const dailyLimit = leadDailyLimit();
  const used = await transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${a.organizationId} FOR UPDATE`;
    const attempts = await tx.auditEvent.findMany({
      where: {
        ...scope(a),
        action: "SEARCH_STARTED",
        createdAt: { gte: dayStart() },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    if (attempts.length >= dailyLimit)
      throw new AppError(
        "Today's lead-search limit has been reached. It resets at midnight UTC.",
        429,
      );
    if (
      attempts.filter((event) => Date.now() - event.createdAt.getTime() < 60000)
        .length >= 10 ||
      (attempts[0] && Date.now() - attempts[0].createdAt.getTime() < 1000)
    )
      throw new AppError(
        "Lead search is busy. Wait a moment before trying again; at most 10 searches per minute are allowed.",
        429,
      );
    await audit(
      tx,
      a,
      "SEARCH_STARTED",
      "INTEGRATION",
      "brave-search",
      "Requested a Brave Search page. No prospects saved.",
      undefined,
      undefined,
      { configHash },
    );
    return attempts.length + 1;
  });
  const query = [input.query, input.location].filter(Boolean).join(" ");
  let parsed: z.infer<typeof responseSchema>;
  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    for (const [key, value] of Object.entries({
      q: query,
      count: "10",
      offset: String(input.page),
      result_filter: "web",
      text_decorations: "false",
      safesearch: "moderate",
      spellcheck: "false",
    }))
      url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!.trim(),
      },
      signal: AbortSignal.timeout(12000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status))
        throw new AppError(
          "Brave Search rejected the credentials. Ask an owner to check the API key and provider access.",
          502,
        );
      if (response.status === 429)
        throw new AppError(
          "Brave Search has reached its request or quota limit. Wait before retrying and check your provider quota.",
          429,
        );
      throw new AppError("Brave Search is unavailable. Try again later.", 502);
    }
    parsed = responseSchema.parse(
      JSON.parse(
        new TextDecoder().decode(await readLimited(response, 1000000)),
      ),
    );
  } catch (error) {
    const safe =
      error instanceof AppError && error.status !== 413
        ? error
        : new AppError(
            "Lead search could not complete. The provider timed out or returned an invalid response. Try again later.",
            502,
          );
    await transaction((tx) =>
      audit(
        tx,
        a,
        "SEARCH_FAILED",
        "INTEGRATION",
        "brave-search",
        safe.message,
        undefined,
        undefined,
        { configHash },
      ),
    );
    throw safe;
  }
  const prospects = await db.prospect.findMany({
    where: { organizationId: a.organizationId },
    select: { id: true, website: true, sourceUrl: true },
  });
  const seen = new Set<string>();
  const results = (parsed.web?.results || [])
    .flatMap((result) => {
      const url = publicUrl(result.url);
      if (!url || seen.has(url)) return [];
      seen.add(url);
      return [
        {
          title: result.title.slice(0, 500),
          url,
          description: (result.description || "").slice(0, 2000),
          existingProspectId:
            prospects.find(
              (prospect) =>
                prospect.sourceUrl === url ||
                (prospect.website && domain(prospect.website) === domain(url)),
            )?.id || null,
        },
      ];
    })
    .slice(0, 10);
  const searchedAt = new Date().toISOString();
  await transaction((tx) =>
    audit(
      tx,
      a,
      "SEARCH_PASSED",
      "INTEGRATION",
      "brave-search",
      `Brave Search returned ${results.length} source results. Excerpts are unverified; no prospects were saved automatically.`,
      undefined,
      undefined,
      { configHash },
    ),
  );
  return {
    query,
    page: input.page,
    more:
      Boolean(parsed.query?.more_results_available) &&
      input.page < 9 &&
      results.length > 0,
    searchedAt,
    results,
    remainingToday: Math.max(0, dailyLimit - used),
  };
}
