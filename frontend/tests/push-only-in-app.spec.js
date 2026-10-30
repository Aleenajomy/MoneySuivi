import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';

test('a browser tab never asks for notification permission or registers for push', async ({ page }) => {
  await page.addInitScript(() => {
    window.__permissionRequests = 0;
    if (window.Notification) {
      // Headless Chromium reports a decided permission; a first real visit is undecided.
      Object.defineProperty(window.Notification, 'permission', { get: () => 'default' });
      window.Notification.requestPermission = async () => { window.__permissionRequests += 1; return 'default'; };
    }
  });
  await setupApiMocks(page, { loggedIn: true });
  const pushCalls = [];
  await page.route((url) => /\/api\/notifications\/(subscribe|fcm-token)$/.test(url.pathname), (route) => {
    pushCalls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });

  await page.goto('/#/');
  await expect(page.locator('text=Total Balance').first()).toBeVisible();
  await page.waitForTimeout(1500);

  expect(pushCalls).toEqual([]);
  expect(await page.evaluate(() => window.__permissionRequests)).toBe(0);
});
