/**
 * playwright.config.ts — GiftHint
 *
 * Playwright e2e test configuration.
 * Run: npx playwright test
 * UI mode: npx playwright test --ui
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // ── Discovery ───────────────────────────────────────────────────────────────
  testDir:   './tests',
  testMatch: '**/*.spec.ts',

  // ── Execution ───────────────────────────────────────────────────────────────
  fullyParallel: true,
  forbidOnly:    !!process.env.CI,   // prevent .only commits reaching CI
  retries:       process.env.CI ? 1 : 0,
  timeout:       30_000,

  // ── Reporters ───────────────────────────────────────────────────────────────
  reporter: [['html'], ['list']],

  // ── Shared settings ─────────────────────────────────────────────────────────
  use: {
    baseURL:    process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // ── Browser projects ────────────────────────────────────────────────────────
  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use:  { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use:  { ...devices['Desktop Safari'] },
    },
    {
      // T15 — mobile viewport (iPhone SE)
      name: 'mobile-chrome',
      use:  {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
      },
    },
  ],

  // ── Dev server ──────────────────────────────────────────────────────────────
  // Spun up automatically for local runs; skipped in CI where the server
  // is already running (reuseExistingServer: !CI).
  webServer: {
    command:             'npm run dev',
    port:                3000,
    reuseExistingServer: !process.env.CI,
    timeout:             120_000,
  },
})
