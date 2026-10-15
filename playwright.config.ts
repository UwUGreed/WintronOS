import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:43817",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1448, height: 1086 },
  },
  globalSetup: "./tests/e2e/setup.ts",
  webServer: {
    command: "npx tsx scripts/test-server.ts",
    url: "http://localhost:43817/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
