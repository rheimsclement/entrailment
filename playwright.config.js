// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright configuration for the En Trailment SPA.
 *
 * The app is a single HTML file with no build step.
 * We serve it with Python's built-in HTTP server on port 3000
 * so all relative paths, fonts and scripts resolve correctly.
 *
 * Test projects:
 *   - chromium  : standard desktop viewport (1280×720)
 *   - mobile-chrome : iPhone 13 viewport (390×844) — used by mobile.spec.js only
 *
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests',

  /* Run all tests in parallel inside a file */
  fullyParallel: true,

  /* Fail the build on CI if test.only is accidentally left in */
  forbidOnly: !!process.env.CI,

  /* No retries locally — 2 retries on CI to handle flakiness */
  retries: process.env.CI ? 2 : 0,

  /* Single worker — Python's http.server is single-threaded.
   * Parallel workers would cause ERR_CONNECTION_REFUSED under concurrent load. */
  workers: 1,

  /* HTML report written to playwright-report/ (never auto-opens in CI) */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:3000',

    /* Capture traces on first retry so failures are diagnosable */
    trace: 'on-first-retry',

    /* Screenshot on failure for visual debugging */
    screenshot: 'only-on-failure',

    /* Keep tests snappy — abort actions after 10 s */
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      /* Exclude the mobile-only spec — its viewport assertions only make sense
       * on a narrow screen and are covered exclusively by the mobile-chrome project. */
      testIgnore: ['**/mobile.spec.js'],
    },
    {
      /* Mobile viewport tests — deliberately restricted to mobile.spec.js.
       * We explicitly set browserName: 'chromium' because devices['iPhone 13']
       * defaults to WebKit, which may not be installed in all environments. */
      name: 'mobile-chrome',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
      },
      testMatch: '**/mobile.spec.js',
    },
  ],

  /* Start a lightweight HTTP server before running tests */
  webServer: {
    command: 'python3 -m http.server 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    /* Give Python 5 s to start */
    timeout: 5_000,
  },
});
