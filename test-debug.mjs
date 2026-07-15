import { chromium } from 'playwright';

const browser = await chromium.launch({ ignoreHTTPSErrors: true });
const page = await browser.newPage();

const logs = [];
const requests = [];
const errors = [];

page.on('console', msg => {
  const text = msg.type() + ': ' + msg.text();
  logs.push(text);
  console.log('CONSOLE:', text);
});

page.on('request', req => {
  const url = req.url();
  requests.push(url);
  if (url.includes('proxy') || url.includes('m3u8') || url.includes('mpd') || url.includes('.ts')) {
    console.log('REQUEST:', url.substring(0, 150));
  }
});

page.on('requestfailed', req => {
  const info = req.failure()?.errorText || 'unknown';
  errors.push(info);
  console.log('FAILED:', req.url().substring(0, 150), info);
});

page.on('response', res => {
  if (res.status() >= 400) {
    console.log('HTTP ERROR:', res.status(), res.url().substring(0, 150));
  }
});

console.log('Navigating to https://localhost:5000 ...');
await page.goto('https://localhost:5000', { waitUntil: 'domcontentloaded', timeout: 15000 });
console.log('Page loaded, waiting for channels...');
await page.waitForTimeout(3000);

const channelCount = await page.locator('.channel-item').count();
console.log('Channel items rendered:', channelCount);

const errorEl = page.locator('#error');
const errorVisible = await errorEl.isVisible().catch(() => false);
if (errorVisible) {
  const errorText = await errorEl.textContent();
  console.log('ERROR displayed:', errorText);
}

const loadingEl = page.locator('#loading');
const loadingVisible = await loadingEl.isVisible().catch(() => false);
console.log('Loading spinner visible:', loadingVisible);

const videoSrc = await page.locator('#video').getAttribute('src').catch(() => 'none');
console.log('Video src:', videoSrc);

await page.waitForTimeout(5000);

console.log('\n--- Summary ---');
console.log('Total console logs:', logs.length);
console.log('Total requests:', requests.length);
console.log('Failed requests:', errors.length);

await browser.close();
