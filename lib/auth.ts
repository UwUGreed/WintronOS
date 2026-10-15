import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import { db } from "./db";
export const auth = betterAuth({
  appName: "Wintron OS",
  baseURL: process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: process.env.APP_URL ? [process.env.APP_URL] : [],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 14,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/two-factor/*": { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: process.env.APP_URL?.startsWith("https:") ?? false,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  plugins: [twoFactor({ issuer: "Wintron OS" })],
});
