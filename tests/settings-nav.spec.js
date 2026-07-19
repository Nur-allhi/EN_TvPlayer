import { test, expect } from '@playwright/test';

test.describe('Settings Page Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5080/enplayer/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const list = document.getElementById('channel-list');
      return list && list.children.length > 0;
    }, { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test('up/down arrows navigate between settings sections', async ({ page }) => {
    await page.evaluate(() => {
      const btn = document.getElementById('settings-btn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    const settingsPage = page.locator('#settings-page');
    await expect(settingsPage).not.toHaveClass(/hidden/);

    const playlistInput = page.locator('#settings-playlist-url');
    await page.keyboard.press('ArrowDown');
    await expect(playlistInput).toBeFocused();

    const fetchBtn = page.locator('#settings-fetch-btn');
    await page.keyboard.press('ArrowDown');
    await expect(fetchBtn).toBeFocused();

    const refreshBtn = page.locator('#settings-refresh-btn');
    await page.keyboard.press('ArrowDown');
    await expect(refreshBtn).toBeFocused();

    const proxyInput = page.locator('#settings-proxy-url');
    await page.keyboard.press('ArrowDown');
    await expect(proxyInput).toBeFocused();

    const singleUrl = page.locator('#settings-single-url');
    await page.keyboard.press('ArrowDown');
    await expect(singleUrl).toBeFocused();

    const singleProxy = page.locator('#settings-single-proxy');
    await page.keyboard.press('ArrowDown');
    await expect(singleProxy).toBeFocused();

    const playBtn = page.locator('#settings-play-single-btn');
    await page.keyboard.press('ArrowDown');
    await expect(playBtn).toBeFocused();

    const closeBtn = page.locator('#settings-close-btn');
    await page.keyboard.press('ArrowDown');
    await expect(closeBtn).toBeFocused();

    // Wrap to first element
    await page.keyboard.press('ArrowDown');
    await expect(playlistInput).toBeFocused();

    // ArrowUp should go backwards
    await page.keyboard.press('ArrowUp');
    await expect(closeBtn).toBeFocused();

    // Back/Escape should close settings
    await page.keyboard.press('Escape');
    await expect(settingsPage).toHaveClass(/hidden/);
  });

  test('settings input fields still allow typing', async ({ page }) => {
    await page.evaluate(() => {
      const btn = document.getElementById('settings-btn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    const playlistInput = page.locator('#settings-playlist-url');
    await playlistInput.focus();
    await page.keyboard.type('http://example.com/playlist.m3u');

    await expect(playlistInput).toHaveValue('http://example.com/playlist.m3u');
  });
});
