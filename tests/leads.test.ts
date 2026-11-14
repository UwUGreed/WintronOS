import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { provisionOrganization } from "../lib/bootstrap";
import { leadStatus, searchLeads } from "../lib/services/leads";
import { saveProspect } from "../lib/services/workspace";
import type { Actor } from "../lib/security";

const provider = vi.fn();
let owner: Actor;
const response = (
  results: { title: string; url: string; description?: string }[] = [],
  more = false,
) =>
  new Response(
    JSON.stringify({
      type: "search",
      query: { more_results_available: more },
      web: { results },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
beforeEach(async () => {
  if (new URL(process.env.DATABASE_URL!).pathname !== "/wintron_test")
    throw new Error("Isolated database required");
  const org = await provisionOrganization(
    "Lead search fixture " + randomUUID(),
  );
  owner = {
    organizationId: org.id,
    userId: "leads-test",
    role: "OWNER",
    name: "Test owner",
  };
  vi.stubEnv("BRAVE_SEARCH_API_KEY", "fictional-provider-secret");
  vi.stubEnv("LEAD_SEARCH_DAILY_LIMIT", "100");
  provider.mockReset().mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal("fetch", provider);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());

describe.sequential(
  "lead discovery provider, evidence and access boundaries",
  () => {
    it("requires configuration and denies accountant searches before any provider request", async () => {
      expect((await leadStatus(owner)).state).toBe("VERIFICATION_REQUIRED");
      await expect(
        searchLeads({ ...owner, role: "ACCOUNTANT" }, { query: "dentists" }),
      ).rejects.toMatchObject({ status: 403 });
      vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
      expect((await leadStatus(owner)).state).toBe("SETUP_REQUIRED");
      await expect(
        searchLeads(owner, { query: "dentists" }),
      ).rejects.toMatchObject({ status: 409 });
      expect(provider).not.toHaveBeenCalled();
    });
    it("searches a fixed provider endpoint and returns sourced previews without saving prospects", async () => {
      provider.mockResolvedValue(
        response(
          [
            {
              title: "Example Dental",
              url: "https://dentist.example.invalid/about",
              description: "A search excerpt, not verified evidence.",
            },
          ],
          true,
        ),
      );
      const result = await searchLeads(
        { ...owner, role: "STAFF" },
        { query: "independent dentists", location: "Charleston", page: 1 },
      );
      const [url, options] = provider.mock.calls[0];
      expect(url.origin).toBe("https://api.search.brave.com");
      expect(url.pathname).toBe("/res/v1/web/search");
      expect(url.searchParams.get("q")).toBe("independent dentists Charleston");
      expect(url.searchParams.get("offset")).toBe("1");
      expect(options).toMatchObject({
        headers: { "X-Subscription-Token": "fictional-provider-secret" },
        redirect: "error",
        cache: "no-store",
      });
      expect(result).toMatchObject({
        query: "independent dentists Charleston",
        page: 1,
        more: true,
        remainingToday: 99,
      });
      expect(result.results[0]).toMatchObject({
        title: "Example Dental",
        existingProspectId: null,
      });
      expect(
        await db.prospect.count({
          where: { organizationId: owner.organizationId },
        }),
      ).toBe(0);
      expect((await leadStatus(owner)).state).toBe("CONNECTION_VERIFIED");
      const logs = await db.auditEvent.findMany({
        where: { organizationId: owner.organizationId },
      });
      expect(JSON.stringify([result, logs])).not.toContain(
        "fictional-provider-secret",
      );
    });
    it("filters unsafe and duplicate source URLs and finds duplicates only in the current organization", async () => {
      const existing = await saveProspect(owner, {
        name: "Saved dentist",
        website: "https://www.saved.example.invalid",
      });
      const other = await provisionOrganization("Other lead org");
      await saveProspect(
        { ...owner, organizationId: other.id },
        {
          name: "Private prospect",
          website: "https://private.example.invalid",
        },
      );
      provider.mockResolvedValue(
        response([
          {
            title: "Already saved",
            url: "https://saved.example.invalid/about",
          },
          {
            title: "Duplicate URL",
            url: "https://saved.example.invalid/about#top",
          },
          { title: "Not in this org", url: "https://private.example.invalid" },
          { title: "Unsafe", url: "javascript:alert(1)" },
          {
            title: "Embedded credentials",
            url: "https://user:pass@example.invalid",
          },
          { title: "Local address", url: "http://127.0.0.1/private" },
        ]),
      );
      const result = await searchLeads(owner, { query: "dentists" });
      expect(result.results).toHaveLength(2);
      expect(result.results[0].existingProspectId).toBe(existing.id);
      expect(result.results[1].existingProspectId).toBeNull();
    });
    it("validates query length and pagination without consuming provider quota", async () => {
      for (const raw of [
        { query: "a" },
        { query: "x".repeat(401) },
        { query: "dentists", page: 10 },
        { query: "word ".repeat(61) },
        { query: "dentists", location: "x".repeat(101) },
      ])
        await expect(searchLeads(owner, raw)).rejects.toThrow();
      expect(provider).not.toHaveBeenCalled();
      expect((await leadStatus(owner)).usedToday).toBe(0);
    });
    it("represents a valid empty result without inventing leads or further pages", async () => {
      provider.mockResolvedValue(response([], true));
      const result = await searchLeads(owner, {
        query: "no matching businesses",
      });
      expect(result.results).toEqual([]);
      expect(result.more).toBe(false);
    });
    it.each([401, 403, 429, 500])(
      "reports provider HTTP %i without leaking its response or credentials",
      async (status) => {
        provider.mockResolvedValue(
          new Response("fictional-provider-secret provider traceback", {
            status,
          }),
        );
        await expect(
          searchLeads(owner, { query: "dentists" }),
        ).rejects.toMatchObject({ status: status === 429 ? 429 : 502 });
        const health = await leadStatus(owner);
        expect(health.state).toBe("ERROR");
        expect(health.usedToday).toBe(1);
        const logs = await db.auditEvent.findMany({
          where: { organizationId: owner.organizationId },
        });
        expect(JSON.stringify([health, logs])).not.toContain(
          "fictional-provider-secret",
        );
      },
    );
    it("rejects malformed, oversized, and timed-out responses rather than claiming an empty success", async () => {
      provider.mockResolvedValue(
        new Response("not-json fictional-provider-secret"),
      );
      await expect(
        searchLeads(owner, { query: "dentists" }),
      ).rejects.toMatchObject({ status: 502 });
      expect((await leadStatus(owner)).state).toBe("ERROR");
      for (const mode of ["large", "timeout"]) {
        const org = await provisionOrganization("Lead provider error fixture");
        const actor = { ...owner, organizationId: org.id };
        if (mode === "large")
          provider.mockResolvedValue(new Response("x".repeat(1000001)));
        else
          provider.mockRejectedValue(
            new Error("fictional-provider-secret network error"),
          );
        await expect(
          searchLeads(actor, { query: "dentists" }),
        ).rejects.toMatchObject({ status: 502 });
        expect((await leadStatus(actor)).state).toBe("ERROR");
      }
    });
    it("enforces daily limits and concurrent-request protection before making requests", async () => {
      vi.stubEnv("LEAD_SEARCH_DAILY_LIMIT", "1");
      const attempts = await Promise.allSettled([
        searchLeads(owner, { query: "dentists" }),
        searchLeads(owner, { query: "dentists" }),
      ]);
      expect(
        attempts.filter((attempt) => attempt.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        (
          attempts.find(
            (attempt) => attempt.status === "rejected",
          ) as PromiseRejectedResult
        ).reason.status,
      ).toBe(429);
      expect(provider).toHaveBeenCalledOnce();
      expect((await leadStatus(owner)).usedToday).toBe(1);
      await expect(
        searchLeads(owner, { query: "dentists" }),
      ).rejects.toMatchObject({ status: 429 });
    });
    it("invalidates provider health when the API key changes", async () => {
      await searchLeads(owner, { query: "dentists" });
      vi.stubEnv("BRAVE_SEARCH_API_KEY", "changed-fictional-key");
      expect((await leadStatus(owner)).state).toBe("VERIFICATION_REQUIRED");
    });
  },
);
