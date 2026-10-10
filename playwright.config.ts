import { defineConfig, devices } from '@playwright/test'

// PW_PORT lets several checkouts run their e2e suites side by side.
const port = Number(process.env.PW_PORT ?? 4173)
// Optional: reuse a preinstalled Chromium (e.g. cloud containers) instead of `playwright install`.
const executablePath = process.env.PW_CHROMIUM_PATH
const launchOptions = executablePath ? { executablePath } : {}

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
    // Compatibility only (SPEC §6), outside `verify`: `npm run e2e:firefox`, or
    // `npx playwright test --project=webkit` (best effort: Playwright's WebKit refuses Blobs in
    // IndexedDB, docs/06 §4), after `npx playwright install firefox webkit`. Several of their
    // instances side by side stall now and then for seconds: longer waits, same assertions.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, expect: { timeout: 15_000 } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, expect: { timeout: 15_000 } },
  ],
  // `npm run e2e` builds first; the preview server serves dist/ exactly as deployed.
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
})
