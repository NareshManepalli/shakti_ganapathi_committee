import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // These hit the live Auth Web App and the live sheets, so they must not run
  // concurrently — parallel sign-ins would trip the server's own resend
  // throttle and fail each other.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20000,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
