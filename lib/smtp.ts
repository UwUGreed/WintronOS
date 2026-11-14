import nodemailer from "nodemailer";
import { z } from "zod";
import { AppError } from "./security";

export function smtpConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const issues: string[] = [];
  const host = env.SMTP_HOST?.trim() || "";
  const from = env.SMTP_FROM?.trim() || "";
  const secure = env.SMTP_SECURE === "true";
  const port = Number(env.SMTP_PORT || (secure ? 465 : 587));
  const user = env.SMTP_USER || "";
  const pass = env.SMTP_PASSWORD || "";
  if (!host) issues.push("Set SMTP_HOST.");
  else if (/[\s/:]/.test(host))
    issues.push(
      "SMTP_HOST must be a hostname or IPv4 address, without a URL scheme or port.",
    );
  const address = from.match(/<([^<>]+)>$/)?.[1] || from;
  if (!from) issues.push("Set SMTP_FROM.");
  else if (/[\r\n]/.test(from) || !z.email().safeParse(address).success)
    issues.push("SMTP_FROM must contain a valid sender email address.");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    issues.push("SMTP_PORT must be between 1 and 65535.");
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE))
    issues.push("SMTP_SECURE must be true or false.");
  if (Boolean(user) !== Boolean(pass))
    issues.push(
      "Set both SMTP_USER and SMTP_PASSWORD, or leave both empty for an authenticated network relay.",
    );
  return {
    configured: issues.length === 0,
    issues,
    host,
    from,
    port,
    secure,
    user,
    pass,
  };
}

export function createSmtpTransport(config = smtpConfiguration()) {
  if (!config.configured)
    throw new AppError(
      "Invoice email setup required. " + config.issues.join(" "),
      409,
    );
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    dnsTimeout: 10000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
