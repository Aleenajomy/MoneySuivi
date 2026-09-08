import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';

test.describe('Mobile Bottom Navigation UI', () => {
  test.beforeEach(async ({ page }) => {
    // Set a mobile viewport by default
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
    await page.goto('/#/');
    await page.waitForLoadState('networkidle');
  });

  test('should display exactly 5 navigation items in the correct order', async ({ page }) => {
    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    await expect(bottomNav).toBeVisible();

    const buttons = bottomNav.locator('button');
    await expect(buttons).toHaveCount(5);

    const labels = await buttons.evaluateAll((btns) =>
      btns.map((b) => b.querySelector('span')?.textContent?.trim())
    );

    expect(labels).toEqual(['Home', 'History', 'EMI', 'Ledger', 'Net Worth']);
  });

  test('should NOT include Add, Alerts, or Profile in the mobile bottom navigation', async ({ page }) => {
    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    await expect(bottomNav.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
    await expect(bottomNav.getByRole('button', { name: 'Alerts', exact: true })).toHaveCount(0);
    await expect(bottomNav.getByRole('button', { name: 'Profile', exact: true })).toHaveCount(0);
  });

  test('should keep existing floating + Add Transaction button separate from navbar', async ({ page }) => {
    const fab = page.getByRole('button', { name: 'Add Transaction' });
    await expect(fab).toBeVisible();

    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    const fabBox = await fab.boundingBox();
    const navBox = await bottomNav.boundingBox();

    expect(fabBox).not.toBeNull();
    expect(navBox).not.toBeNull();

    // FAB bottom should be above or at the top border of the bottom nav (not overlapping inside the nav)
    expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(navBox.y + 1);
  });

  test('should highlight active route correctly for all 5 destinations and update on navigation', async ({ page }) => {
    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');

    // 1. Initially on Home (/)
    const homeBtn = bottomNav.getByRole('button', { name: 'Home' });
    await expect(homeBtn).toHaveAttribute('aria-current', 'page');
    await expect(homeBtn.locator('span')).toHaveClass(/text-sky-600|text-sky-400/);

    // 2. Navigate to History
    const historyBtn = bottomNav.getByRole('button', { name: 'History' });
    await historyBtn.click();
    await expect(page).toHaveURL(/#\/history/);
    await expect(historyBtn).toHaveAttribute('aria-current', 'page');
    await expect(homeBtn).not.toHaveAttribute('aria-current', 'page');

    // 3. Navigate to EMI
    const emiBtn = bottomNav.getByRole('button', { name: 'EMI' });
    await emiBtn.click();
    await expect(page).toHaveURL(/#\/emis/);
    await expect(emiBtn).toHaveAttribute('aria-current', 'page');
    await expect(historyBtn).not.toHaveAttribute('aria-current', 'page');

    // 4. Navigate to Ledger
    const ledgerBtn = bottomNav.getByRole('button', { name: 'Ledger' });
    await ledgerBtn.click();
    await expect(page).toHaveURL(/#\/ledger/);
    await expect(ledgerBtn).toHaveAttribute('aria-current', 'page');
    await expect(emiBtn).not.toHaveAttribute('aria-current', 'page');

    // 5. Navigate to Net Worth
    const netWorthBtn = bottomNav.getByRole('button', { name: 'Net Worth' });
    await netWorthBtn.click();
    await expect(page).toHaveURL(/#\/networth/);
    await expect(netWorthBtn).toHaveAttribute('aria-current', 'page');
    await expect(ledgerBtn).not.toHaveAttribute('aria-current', 'page');
  });

  test('should have no black borders or outlines around nav buttons', async ({ page }) => {
    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    const homeBtn = bottomNav.getByRole('button', { name: 'Home' });

    await homeBtn.focus();
    const border = await homeBtn.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        borderWidth: style.borderWidth,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });

    expect(border.outlineStyle === 'none' || border.outlineWidth === '0px').toBeTruthy();
  });

  const viewports = [
    { name: '320x568 (Small Mobile)', width: 320, height: 568 },
    { name: '360x800 (Standard Android)', width: 360, height: 800 },
    { name: '375x667 (iPhone SE)', width: 375, height: 667 },
    { name: '390x844 (iPhone 12/13/14)', width: 390, height: 844 },
    { name: '412x915 (Pixel 7 / Galaxy)', width: 412, height: 915 },
    { name: '430x932 (iPhone Pro Max)', width: 430, height: 932 },
    { name: '844x390 (Landscape Mobile)', width: 844, height: 390 },
  ];

  for (const vp of viewports) {
    test(`should render cleanly without overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
      await expect(bottomNav).toBeVisible();

      // Check that Net Worth label does not wrap
      const netWorthSpan = bottomNav.getByRole('button', { name: 'Net Worth' }).locator('span');
      await expect(netWorthSpan).toBeVisible();

      const spanBox = await netWorthSpan.boundingBox();
      expect(spanBox).not.toBeNull();
      // Should be single line height (< 20px)
      expect(spanBox.height).toBeLessThan(22);

      // Check horizontal overflow of window
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBeFalsy();
    });
  }

  test('desktop view (>=1024px) should show sidebar and hide mobile bottom nav', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    await expect(bottomNav).not.toBeVisible();

    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toBeVisible();
  });
});
