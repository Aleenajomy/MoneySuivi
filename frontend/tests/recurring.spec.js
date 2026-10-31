import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';

const rent = {
  id: 'rec_rent',
  title: 'House Rent',
  amount: 15000,
  category: 'Bills',
  type: 'expense',
  accountType: 'Bank',
  paymentMethod: 'Net Banking',
  recurring: true,
  recurringType: 'monthly',
  nextRunDate: '2026-11-01T00:00:00.000Z',
  expenseDate: '2026-10-01T00:00:00.000Z',
};

// Registered after the shared mocks so they take precedence for these requests.
const mockRecurringApi = async (page, items) => {
  const state = { items: [...items], stopped: [] };
  await page.route((url) => url.pathname === '/api/expenses' && url.searchParams.get('recurring') === 'true', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expenses: state.items, currentPage: 1, totalPages: 1 }) }));
  await page.route((url) => url.pathname.startsWith('/api/expenses/rec_'), async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const id = new URL(route.request().url()).pathname.split('/').pop();
    state.stopped.push({ id, body: route.request().postDataJSON() });
    state.items = state.items.filter(i => i.id !== id);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, expense: { ...rent, recurring: false, nextRunDate: null } }) });
  });
  return state;
};

test.describe('Recurring payments on mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
  });

  test('is reachable from the EMI tab and lists recurring payments', async ({ page }) => {
    await mockRecurringApi(page, [rent]);
    await page.goto('/#/');
    const bottomNav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    await bottomNav.getByRole('button', { name: 'EMI' }).click();
    await page.getByRole('button', { name: /Recurring Payments/ }).click();

    await expect(page).toHaveURL(/#\/recurring$/);
    await expect(page.getByRole('heading', { name: 'Recurring Payments' })).toBeVisible();
    const item = page.getByTestId('recurring-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('House Rent');
    await expect(item).toContainText('Monthly');
    await expect(item).toContainText('01 Nov 2026');
    await expect(bottomNav.getByRole('button', { name: 'EMI' })).toHaveAttribute('aria-current', 'page');
  });

  test('is reachable from the Upcoming Payments card on Home', async ({ page }) => {
    await mockRecurringApi(page, [rent]);
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Manage recurring payments' }).click();
    await expect(page).toHaveURL(/#\/recurring$/);
    await expect(page.getByTestId('recurring-item')).toContainText('House Rent');
  });

  test('stopping a payment asks for confirmation and turns recurring off', async ({ page }) => {
    const state = await mockRecurringApi(page, [rent]);
    await page.goto('/#/recurring');
    await page.getByTestId('recurring-item').getByRole('button', { name: 'Stop' }).click();
    await page.getByRole('button', { name: 'Stop', exact: true }).last().click();

    await expect(page.getByTestId('recurring-item')).toHaveCount(0);
    expect(state.stopped).toEqual([{ id: 'rec_rent', body: { recurring: false } }]);
    await expect(page.getByText('No recurring payments')).toBeVisible();
  });

  test('Edit opens the transaction form for that payment', async ({ page }) => {
    await mockRecurringApi(page, [rent]);
    await page.goto('/#/recurring');
    await page.getByTestId('recurring-item').getByRole('button', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/#\/edit\/rec_rent$/);
  });
});
