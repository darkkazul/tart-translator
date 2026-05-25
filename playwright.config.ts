import { defineConfig, devices } from "@playwright/test";

const host = process.env.VITE_PREVIEW_HOST ?? "127.0.0.1";
const port = Number(process.env.VITE_PREVIEW_PORT ?? 4173);
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: "./tests/frontend",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `npm run build && npm run preview -- --host ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
