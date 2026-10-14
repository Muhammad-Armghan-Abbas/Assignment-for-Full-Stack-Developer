import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  use: {
    // Optional: point at a preinstalled Chromium instead of downloading one.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
    baseURL: process.env.E2E_BASE_URL || `http://localhost:${PORT}`, viewport: { width: 1280, height: 860 } },
  // Starts the production build against a throwaway database unless E2E_BASE_URL points elsewhere.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `rm -f data/e2e.db* && next start -p ${PORT}`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: true,
        env: { DATABASE_URL: "file:./data/e2e.db" },
      },
});
