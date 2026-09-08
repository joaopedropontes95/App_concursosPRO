const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './qa',
  timeout: 45000,
  expect: { timeout: 8000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 15000
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G975F) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
      }
    },
    {
      name: 'webkit-ipad',
      use: {
        browserName: 'webkit',
        viewport: { width: 834, height: 1112 },
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
      }
    }
  ]
});
