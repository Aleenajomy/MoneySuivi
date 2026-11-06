import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';
import { setupPlannerMock } from './helpers/plannerMock';

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const day = (d) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`;

const plan = {
  year, month,
  allocations: [
    { group: 'FIXED', name: 'Rent / Accommodation', plannedAmount: 3500 },
    { group: 'FIXED', name: 'Mess / Food', plannedAmount: 2500, matchCategories: ['Food'] },
    { group: 'FIXED', name: 'Other Bills', plannedAmount: 1000, matchCategories: ['Bills'] },
    { group: 'SAVINGS', name: 'Emergency Fund', plannedAmount: 2000 },
  ],
};
const spending = [
  { id: '11111111-1111-4111-8111-000000000001', title: 'Mess', category: 'Food', amount: 2500, date: day(3), autoLine: 'Mess / Food', autoBy: 'NAME', paymentMethod: 'UPI' },
  { id: '11111111-1111-4111-8111-000000000002', title: 'House payment', category: 'Bills', amount: 3500, date: day(2), autoLine: 'Other Bills' },
  { id: '11111111-1111-4111-8111-000000000003', title: 'Gift', category: 'Shopping', amount: 300, date: day(4) },
  { id: 'emi:22222222-2222-4222-8222-000000000001', source: 'EMI', title: 'Phone EMI', category: 'EMI', amount: 2000, date: day(5) },
];

const card = (page, name) => page.getByTestId('allocation-card').filter({ has: page.getByRole('heading', { name }) });
const row = (page, title) => page.getByTestId('spending-item').filter({ hasText: title });

test.describe('Planner: matching spending to budget lines', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
  });

  test('a Mess expense from History shows on the Mess line and opens its own list', async ({ page }) => {
    const mock = await setupPlannerMock(page, { plan, spending });
    await page.goto('/#/planner?tab=budget');
    const mess = card(page, 'Mess / Food');
    await expect(mess).toContainText('Spent ₹2,500 · 1 item');
    await expect(mess).toContainText('₹0 left');
    await expect(card(page, 'Other Bills')).toContainText('₹2,500 over');

    await mess.getByRole('button', { name: /Show 1 transactions counted toward Mess/ }).click();
    await expect(page).toHaveURL(/tab=spending&line=/);
    await expect(page.getByTestId('spending-item')).toHaveCount(1);
    await expect(row(page, 'Mess')).toContainText('Auto · name');
    await expect(page.getByTestId('spending-total')).toContainText('₹2,500');
    expect(mock.requests.filter(r => r.method !== 'GET' && r.path.startsWith('/transactions'))).toHaveLength(0);
  });

  test('a wrong automatic match can be moved to another line and back to automatic', async ({ page }) => {
    const mock = await setupPlannerMock(page, { plan, spending });
    await page.goto('/#/planner?tab=spending');
    const house = row(page, 'House payment');
    await expect(house).toContainText('Auto · category');
    const picker = house.getByRole('combobox', { name: 'Budget line for House payment' });
    await expect(picker).toHaveValue('');
    await expect(picker.locator('option').first()).toHaveText('Automatic (Other Bills)');
    // Savings lines never take spending, so they aren't offered.
    await expect(picker.locator('option', { hasText: 'Emergency Fund' })).toHaveCount(0);

    await picker.selectOption({ label: 'Rent / Accommodation' });
    await expect(house).toContainText('Moved by you');
    const put = mock.requests.find(r => r.method === 'PUT');
    expect(put.path).toBe('/transactions/11111111-1111-4111-8111-000000000002/assignment');
    expect(put.body).toEqual({ allocationId: await picker.inputValue() });

    await page.getByRole('tab', { name: 'Budget' }).click();
    await expect(card(page, 'Rent / Accommodation')).toContainText('Spent ₹3,500 · 1 item');
    await expect(card(page, 'Other Bills')).toContainText('Spent ₹0 · 0 items');

    await page.getByRole('tab', { name: 'Spending' }).click();
    await row(page, 'House payment').getByRole('combobox').selectOption({ value: '' });
    await expect(row(page, 'House payment')).toContainText('Auto · category');
    expect(mock.requests.filter(r => r.method === 'DELETE').map(r => r.path)).toEqual(['/transactions/11111111-1111-4111-8111-000000000002/assignment']);
  });

  test('unplanned spending can be reviewed from the Budget tab; EMI payments are read-only', async ({ page }) => {
    await setupPlannerMock(page, { plan, spending });
    await page.goto('/#/planner?tab=budget');
    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByLabel('Filter spending by line')).toHaveValue('UNPLANNED');
    await expect(page.getByTestId('spending-item')).toHaveCount(2);
    await expect(row(page, 'Gift')).toContainText('Unplanned');
    await expect(row(page, 'Gift').getByRole('combobox')).toHaveValue('');

    const emi = row(page, 'Phone EMI');
    await expect(emi).toContainText('From EMI tracker');
    await expect(emi.getByRole('combobox')).toHaveCount(0);

    await page.getByLabel('Filter spending by line').selectOption('ALL');
    await expect(page.getByTestId('spending-item')).toHaveCount(4);
    await expect(page).toHaveURL(/tab=spending$/);
  });

  test('empty month explains where spending comes from', async ({ page }) => {
    await setupPlannerMock(page, { plan });
    await page.goto('/#/planner?tab=spending');
    await expect(page.getByText('No spending recorded this month')).toBeVisible();
  });

  test('Spending tab has no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await setupPlannerMock(page, { plan, spending });
    await page.goto('/#/planner?tab=spending');
    await expect(page.getByTestId('spending-item')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
});
