import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';
import { setupPlannerMock } from './helpers/plannerMock';

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const today = `${thisMonth}-${pad(now.getDate())}`;

const addSalary = async (page) => {
  await page.getByRole('button', { name: 'Add salary' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Acme salary');
  await dialog.getByLabel('Expected monthly amount (₹)').fill('15000');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('salary-record')).toContainText('Acme salary');
};

test.describe('Planner review fixes (UI)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
  });

  test('"Received on" is limited to the record\'s month and to today', async ({ page }) => {
    await setupPlannerMock(page);
    await page.goto('/#/planner?tab=salary');
    await addSalary(page);
    await page.getByRole('button', { name: 'Mark received' }).click();
    const date = page.getByRole('dialog').getByLabel('Received on');
    await expect(date).toHaveAttribute('min', `${thisMonth}-01`);
    await expect(date).toHaveAttribute('max', today);
  });

  test('a month that has not started cannot be marked received yet', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner?tab=salary');
    await addSalary(page);
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByTestId('salary-record')).toContainText('Pending');
    await page.getByRole('button', { name: 'Mark received' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('status')).toContainText("hasn't started yet");
    await expect(dialog.getByRole('button', { name: 'Mark received' })).toBeDisabled();
    expect(mock.requests.some(r => r.path.endsWith('/receive'))).toBe(false);
  });

  test('very large totals sent as exact strings are shown to the paisa', async ({ page }) => {
    await setupPlannerMock(page);
    await page.goto('/#/planner');
    const shown = await page.evaluate(async () => {
      const { formatAmount } = await import('/src/utils/planner.js');
      return [formatAmount('90999999999999.09'), formatAmount('-10000000000000.00'), formatAmount(4999.5), formatAmount(15000), formatAmount('12.30')];
    });
    expect(shown).toEqual(['₹9,09,99,99,99,99,999.09', '-₹1,00,00,00,00,00,000', '₹4,999.50', '₹15,000', '₹12.30']);
  });
});
