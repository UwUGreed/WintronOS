const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret.length < 32)
  throw new Error(
    "BETTER_AUTH_SECRET must be a securely generated value of at least 32 characters.",
  );
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const origin = new URL(process.env.APP_URL || "");
if (
  origin.protocol !== "https:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
)
  throw new Error("Non-loopback APP_URL must use HTTPS.");
if (
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
)
  throw new Error(
    "APP_URL must be a canonical origin without credentials or a path.",
  );
