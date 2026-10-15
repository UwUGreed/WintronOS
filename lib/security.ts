import { auth } from "./auth";
import { db } from "./db";
import type { Role } from "@prisma/client";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type Actor = {
  userId: string;
  organizationId: string;
  role: Role;
  name: string;
};
export async function actor(headers: Headers): Promise<Actor> {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new AppError("Please sign in.", 401);
  const membership = await db.membership.findFirst({
    where: { userId: session.user.id, active: true },
  });
  if (!membership)
    throw new AppError(
      "This account has no active organization membership.",
      403,
    );
  if (process.env.REQUIRE_MFA === "true" && !session.user.twoFactorEnabled)
    throw new AppError(
      "Enable two-factor authentication in account security to continue.",
      403,
    );
  return {
    userId: session.user.id,
    organizationId: membership.organizationId,
    role: membership.role,
    name: session.user.name,
  };
}
export function authorize(a: Actor, permission: "write" | "owner") {
  if (a.role === "ACCOUNTANT" || (permission === "owner" && a.role !== "OWNER"))
    throw new AppError(
      "You do not have permission to perform this action.",
      403,
    );
}
export function checkOrigin(request: Request) {
  if (
    !process.env.APP_URL ||
    request.headers.get("origin") !== new URL(process.env.APP_URL).origin
  )
    throw new AppError("Request origin is not trusted.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("Cross-site request rejected.", 403);
}
