import { defineConfig, devices } from '@playwright/test';

const LIVE_URL = 'http://localhost:5174';
const STUB_URL = 'http://localhost:5175';

// Not a real host. admin-editors.spec.js intercepts every request to it, so
// nothing is ever sent — the address only has to be one the app will accept.
export const CONTENT_STUB = 'https://content.stub.invalid/exec';
export const FUNDS_STUB = 'https://funds.stub.invalid/exec';

export default defineConfig({
  testDir: './tests',
  // These hit the live Auth and Gallery Web Apps and the real Drive folder, so
  // they must not run concurrently — two uploads at once would race on the
  // same year's photo count.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 180000,
  use: {
    baseURL: LIVE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    // The editor screens stub the Content Web App and mint their own session,
    // so they need neither the live sign-in nor its rate limit. They run against
    // the second server below, the one told an endpoint exists.
    {
      name: 'stubbed',
      testMatch: /admin-(editors|modals|funds|idle|txn)\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: STUB_URL,
        viewport: { width: 1280, height: 900 },
      },
    },
    // The status report is a static page — no sign-in, no services.
    {
      name: 'docs',
      testMatch: /status-page\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: /(admin-editors|admin-modals|admin-funds|admin-idle|admin-txn|status-page)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  // Two servers, because the editor specs need the app to believe the Content
  // Web App exists while the real config still says it does not. The stub URL
  // never resolves — every request to it is answered by the test itself.
  webServer: [
    {
      command: 'npm run dev',
      url: LIVE_URL,
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'npm run dev -- --port 5175',
      url: STUB_URL,
      env: { VITE_CONTENT_API: CONTENT_STUB, VITE_FUNDS_API: FUNDS_STUB },
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
