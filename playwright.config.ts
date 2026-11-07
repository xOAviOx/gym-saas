import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/sign-in',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
