import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';
import { setupPlannerMock } from './helpers/plannerMock';

const now = new Date();
const on = (d) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`;

const bills = {
  bills: [
    { id: 'rent:1', templateId: 'rent', title: 'Rent', category: 'Bills', recurringType: 'monthly', paymentMethod: 'UPI', dueDate: on(1), amount: 15000, status: 'RECORDED', transactionId: 'tx1' },
    { id: 'net:1', templateId: 'net', title: 'Internet', category: 'Bills', recurringType: 'monthly', paymentMethod: 'UPI', dueDate: on(2), amount: 799, status: 'NOT_FOUND', transactionId: null },
    { id: 'gym:1', templateId: 'gym', title: 'Gym', category: 'Healthcare', recurringType: 'monthly', paymentMethod: 'Cash', dueDate: on(28), amount: 1200, status: 'SCHEDULED', transactionId: null },
  ],
  emis: [
    { id: '11111111-1111-4111-8111-000000000001', title: 'Phone', type: 'FIXED', active: true, dueDate: on(5), expectedAmount: 2000, paidThisMonth: 0, status: 'OVERDUE', remainingInstallments: 9, payable: true },
    { id: '11111111-1111-4111-8111-000000000002', title: 'Family loan', type: 'FLEXIBLE', active: true, dueDate: on(25), expectedAmount: 3000, paidThisMonth: 1000, status: 'PARTIAL', remainingInstallments: null, payable: true },
    { id: '11111111-1111-4111-8111-000000000003', title: 'Bike', type: 'FIXED', active: true, dueDate: on(10), expectedAmount: 1500, paidThisMonth: 1500, status: 'PAID', remainingInstallments: 3, payable: false },
  ],
  upcoming: [{ id: 'emi:x', source: 'EMI', title: 'Family loan', dueDate: on(25), amount: 3000, status: 'UPCOMING' }],
  summary: { expected: 23499, settled: 17500, pending: 5999, overdueCount: 1, notFoundCount: 1 },
};

test.describe('Planner: bills and EMIs', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
  });

  test('shows the month\'s bills and EMIs with their status and totals', async ({ page }) => {
    await setupPlannerMock(page, { bills });
    await page.goto('/#/planner?tab=bills');
    const summary = page.getByTestId('bills-summary');
    await expect(summary).toContainText('₹23,499');
    await expect(summary).toContainText('₹17,500');
    await expect(summary).toContainText('₹5,999');
    await expect(summary).toContainText('1 overdue');

    const bill = (t) => page.getByTestId('bill-item').filter({ hasText: t });
    await expect(bill('Rent')).toContainText('Recorded');
    await expect(bill('Internet')).toContainText('Not in History');
    await expect(bill('Gym')).toContainText('Scheduled');
    await expect(page.getByTestId('upcoming-list')).toContainText('Family loan');

    const emi = (t) => page.getByTestId('emi-item').filter({ hasText: t });
    await expect(emi('Phone')).toContainText('Overdue');
    await expect(emi('Family loan')).toContainText('Part paid');
    await expect(emi('Bike')).toContainText('Paid');
    await expect(emi('Bike').getByRole('button')).toHaveCount(0);
  });

  test('paying an EMI goes through the existing Loans & EMIs endpoint, after confirmation', async ({ page }) => {
    await setupPlannerMock(page, { bills });
    const paid = [];
    await page.route('**/api/emis/*/pay', (route) => {
      paid.push({ url: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    await page.goto('/#/planner?tab=bills');

    await page.getByTestId('emi-item').filter({ hasText: 'Phone' }).getByRole('button', { name: 'Pay installment' }).click();
    await expect(page.getByText(/Records a ₹2,000 payment for Phone in Loans & EMIs/)).toBeVisible();
    await page.getByRole('button', { name: 'Record installment' }).click();
    await expect.poll(() => paid.length).toBe(1);
    expect(paid[0].url).toBe('/api/emis/11111111-1111-4111-8111-000000000001/pay');
    expect(Object.keys(paid[0].body)).toEqual(['paidAt']);

    await page.getByTestId('emi-item').filter({ hasText: 'Family loan' }).getByRole('button', { name: 'Record payment' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Amount paid (₹)').fill('2000');
    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await expect.poll(() => paid.length).toBe(2);
    expect(paid[1].body.amount).toBe('2000');
  });

  test('empty month points to recurring payments', async ({ page }) => {
    await setupPlannerMock(page);
    await page.goto('/#/planner?tab=bills');
    await expect(page.getByText(/No bills or EMIs in/)).toBeVisible();
    await page.getByRole('button', { name: 'Add a recurring payment' }).click();
    await expect(page).toHaveURL(/#\/add$/);
  });
});
