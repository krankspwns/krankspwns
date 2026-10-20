const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    browserName: 'chromium',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: { command: 'node tools/serve.js', url: 'http://127.0.0.1:3000', reuseExistingServer: false },
});
