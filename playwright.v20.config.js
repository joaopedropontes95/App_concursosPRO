const { defineConfig, devices } = require('@playwright/test');

module.exports=defineConfig({
  testDir:'./tests',
  testMatch:'v20-regression.spec.js',
  timeout:50000,
  expect:{timeout:12000},
  fullyParallel:false,
  retries:0,
  workers:1,
  reporter:[['list']],
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',serviceWorkers:'allow'},
  projects:[
    {name:'android-chromium',use:{...devices['Galaxy S9+']}},
    {name:'ipad-webkit',use:{...devices['iPad Pro 11'],browserName:'webkit'}}
  ],
  webServer:{
    command:'python3 -m http.server 4173 --bind 127.0.0.1',
    url:'http://127.0.0.1:4173/index.html',
    reuseExistingServer:true,
    timeout:20000
  }
});
