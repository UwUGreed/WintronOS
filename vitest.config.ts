import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/wintron_test";
process.env.DATABASE_URL = url.toString();
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
