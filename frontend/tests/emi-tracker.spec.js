import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';

// Regression: a flexible loan's "Record Repayment" button used an icon that was never imported,
// which crashed the whole Loans & EMIs page as soon as a flexible loan was shown.
test('the Loans & EMIs page renders fixed EMIs and flexible loans without crashing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await setupApiMocks(page, { loggedIn: true });
  await page.route('**/api/emis', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      emis: [
        { id: 'emi_fixed', title: 'Phone EMI', type: 'FIXED', totalAmount: 24000, emiAmount: 2000, totalInstallments: 12, paidInstallments: 2, paidAmount: 4000, startDate: '2026-09-01', active: true, payments: [] },
        { id: 'emi_flex', title: 'Bike loan', type: 'FLEXIBLE', totalAmount: 50000, emiAmount: null, totalInstallments: null, paidInstallments: 0, paidAmount: 3000, interestRate: 10, startDate: '2026-09-01', active: true, payments: [{ id: 'p1', amount: 3000, paidAt: '2026-10-02' }] },
      ],
    }),
  }));
  await page.goto('/#/emis');
  await expect(page.getByText('Bike loan').first()).toBeVisible();
  await expect(page.getByText('Phone EMI').first()).toBeVisible();
  const expand = page.getByText('Bike loan').first();
  await expand.click();
  await expect(page.getByRole('button', { name: /Record Repayment/ })).toBeVisible();
  expect(errors).toEqual([]);
});
