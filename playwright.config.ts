import { defineConfig, devices } from '@playwright/test';
import { appEnv, E2E_BASE_URL, E2E_OWNER, E2E_PORT } from './e2e/env';

/**
 * Browser smoke journeys (WI-052): the production build (`next start`) against a fresh
 * database and the loopback fakes for Google and OpenRouter. Run `pnpm build` first, then
 * `pnpm test:e2e`. One worker: the journeys share one owner and run in order.
 */
const CI = !!process.env.CI;
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  // The journeys share one workspace in order, so a retry would start from a used one.
  retries: 0,
  forbidOnly: CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    // Entrance motion fades text in; axe must judge settled colours, as most people see them.
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'sign-in', testMatch: /auth\.setup\.ts/ },
    {
      name: 'journeys',
      dependencies: ['sign-in'],
      testMatch: /\.spec\.ts/,
      use: {
        // E2E_BROWSER=webkit runs the same journeys in Safari's engine (WI-057).
        ...devices[
          process.env.E2E_BROWSER === 'webkit'
            ? 'Desktop Safari'
            : 'Desktop Chrome'
        ],
        viewport: { width: 1440, height: 900 },
        storageState: 'e2e/.auth/owner.json',
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm exec tsx tests/support/fake-google-server.ts',
      port: 4455,
      env: { FAKE_LOGIN_EMAIL: E2E_OWNER },
      reuseExistingServer: !CI,
    },
    {
      command: 'pnpm exec tsx tests/support/fake-openrouter-server.ts',
      port: 4466,
      reuseExistingServer: !CI,
    },
    {
      command: `pnpm exec next start --port ${E2E_PORT}`,
      url: `${E2E_BASE_URL}/api/health`,
      env: appEnv,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
