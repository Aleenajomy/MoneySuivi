import { test, expect } from '@playwright/test';
import { setupApiMocks, mockUser } from './helpers/mockApi';

test.describe('Cash Balance & Startup Stability Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { loggedIn: true });
  });

  test('Cash update immediately updates Total Amount and Account Summary breakdown', async ({ page }) => {
    let currentCash = 5000;
    let currentUpi = 15750;
    let currentBank = 50000;

    // Dynamic analytics route that returns updated cash balance
    await page.route('**/api/expenses/analytics**', async (route) => {
      const totalBalance = currentCash + currentUpi + currentBank;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          analytics: {
            totalIncome: 75000,
            totalExpense: 4250,
            balance: totalBalance,
            totalBalance: totalBalance,
            cashBalance: currentCash,
            upiBalance: currentUpi,
            bankBalance: currentBank,
            creditCardBalance: 0,
            debitCardBalance: 0,
            netBankingBalance: currentBank,
            upcomingRecurring: [],
            categorySpending: [],
          },
        }),
      });
    });

    // Intercept expense POST/PUT to simulate Cash transaction update
    await page.route('**/api/expenses', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() || {};
        if (body.accountType === 'Cash' || body.paymentMethod === 'Cash') {
          // If cash income of 2000 added
          if (body.type === 'income') {
            currentCash += Number(body.amount);
          } else {
            currentCash -= Number(body.amount);
          }
        }
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Expense added successfully',
            expense: { id: 'exp_cash_1', ...body },
          }),
        });
      }
      return route.continue();
    });

    // 1. Initial dashboard visit
    await page.goto('/#/');
    // Initial total is 70,750 (5000 + 15750 + 50000)
    await expect(page.locator('text=₹70,750').first()).toBeVisible();

    // Open Account Summary modal to verify initial Cash
    await page.getByRole('button', { name: /view details/i }).click();
    await expect(page.getByText('Account Summary')).toBeVisible();
    await expect(page.locator('div').filter({ hasText: /^Cash/ }).getByText('₹5,000')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // 2. Add Cash Income of 2,000
    await page.goto('/#/add?type=income');
    await page.locator('input[type="number"]').fill('2000');
    // Select Cash payment method
    const paymentSelect = page.locator('select').first();
    await paymentSelect.selectOption('Cash');

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Expect return to Dashboard and Total Balance updated to 72,750
    await expect(page).toHaveURL(/#\/?$/);
    await expect(page.locator('text=₹72,750').first()).toBeVisible();

    // Verify inside Account Summary breakdown modal
    await page.getByRole('button', { name: /view details/i }).click();
    const modal = page.locator('.card').filter({ hasText: 'Account Summary' });
    await expect(modal).toBeVisible();
    await expect(modal.getByText('₹7,000')).toBeVisible();
    await expect(modal.getByText('₹72,750')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // 3. Refresh app and verify Total Amount persists
    await page.reload();
    await expect(page.locator('text=₹72,750').first()).toBeVisible();
  });

  test('Startup cleanly initializes without runtime exceptions or unhandled errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/#/');
    await expect(page.locator('text=Total Balance').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Hello, Alex/i })).toBeVisible();

    // Verify no fatal runtime errors occurred on initial startup
    const fatalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('404')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('Handles slow /auth/me gracefully without crashing dashboard', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: mockUser }),
      });
    });

    await page.goto('/#/');
    await expect(page.locator('text=Total Balance').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Hello, Alex/i })).toBeVisible();
  });
});
