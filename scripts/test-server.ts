import "./env";
import { spawn } from "node:child_process";
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/wintron_test";
const child = spawn("node", [".next/standalone/server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: url.toString(),
    APP_URL: "http://localhost:43817",
    HOSTNAME: "127.0.0.1",
    PORT: "43817",
    REQUIRE_MFA: "false",
    DOCUMENT_STORAGE_PATH: process.cwd() + "/.data/test-documents",
  },
});
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code || 0));
