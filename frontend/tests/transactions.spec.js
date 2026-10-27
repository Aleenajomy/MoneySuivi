import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';

test.describe('Transaction Management UI & Functions', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { loggedIn: true });
  });

  test('should render Add Transaction page and toggle between Expense, Income, and Transfer', async ({ page }) => {
    await page.goto('/#/add');

    // Page title
    await expect(page.getByRole('heading', { name: /New Transaction/i })).toBeVisible();

    // Type toggles
    const expenseBtn = page.getByRole('button', { name: 'Expense', exact: true });
    const incomeBtn = page.getByRole('button', { name: 'Income', exact: true });
    const transferBtn = page.getByRole('button', { name: 'Transfer', exact: true });

    await expect(expenseBtn).toBeVisible();
    await expect(incomeBtn).toBeVisible();
    await expect(transferBtn).toBeVisible();

    // Switch to Income
    await incomeBtn.click();
    await expect(page.getByRole('button', { name: 'Salary' })).toBeVisible();

    // Switch to Transfer
    await transferBtn.click();
    await expect(page.locator('label:has-text("Transfer From")')).toBeVisible();

    // Switch back to Expense
    await expenseBtn.click();
    await expect(page.getByRole('button', { name: 'Food' })).toBeVisible();
  });

  test('should NOT show Bank option on Expense and Income, but keep Bank available for Transfer', async ({ page }) => {
    await page.goto('/#/add');

    // 1. In Expense mode (default): verify "Paid Using" dropdown does NOT have Bank
    const paymentSelect = page.locator('select').first();
    await expect(paymentSelect).toBeVisible();
    const expenseOptions = await paymentSelect.locator('option').allTextContents();
    expect(expenseOptions).not.toContain('Bank');
    expect(expenseOptions).toContain('UPI');
    expect(expenseOptions).toContain('Cash');

    // 2. Switch to Income mode: verify "Received In" dropdown does NOT have Bank
    await page.getByRole('button', { name: 'Income', exact: true }).click();
    const incomeOptions = await page.locator('select').first().locator('option').allTextContents();
    expect(incomeOptions).not.toContain('Bank');
    expect(incomeOptions).toContain('UPI');
    expect(incomeOptions).toContain('Cash');

    // 3. Switch to Transfer mode: verify "Transfer From" and "Transfer To" DO have Bank
    await page.getByRole('button', { name: 'Transfer', exact: true }).click();
    const fromOptions = await page.locator('select').first().locator('option').allTextContents();
    const toOptions = await page.locator('select').nth(1).locator('option').allTextContents();
    expect(fromOptions).toContain('Bank');
    expect(toOptions).toContain('Bank');
  });

  test('should fill out and submit a new expense transaction', async ({ page }) => {
    // Navigate from dashboard so browser history exists for navigate(-1)
    await page.goto('/#/');
    const aside = page.locator('aside.sidebar');
    await aside.getByRole('button', { name: 'Add Transaction' }).click();
    await expect(page).toHaveURL(/#\/add/);

    // Enter amount
    const amountInput = page.locator('input[type="number"]');
    await amountInput.fill('450');

    // Enter title
    const titleInput = page.locator('input[placeholder*="Lunch"]');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Starbucks Coffee');

    // Select category Food
    const foodCategory = page.getByRole('button', { name: 'Food' });
    if (await foodCategory.isVisible()) {
      await foodCategory.click();
    }

    // Submit form
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Expect return back to Dashboard
    await expect(page).toHaveURL(/#\/?$/);
    await expect(page.locator('text=Total Balance').first()).toBeVisible();
  });

  test('history labels a transaction paid via Other as Other, not its internal account', async ({ page }) => {
    const otherEntry = {
      id: 'exp_other',
      title: 'Paid via other',
      amount: 218,
      category: 'Other',
      type: 'expense',
      accountType: 'UPI',
      paymentMethod: 'Other',
      expenseDate: new Date().toISOString(),
    };
    // Registered after the shared mocks, so it takes precedence for the list request only.
    await page.route((url) => url.pathname === '/api/expenses', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ expenses: [otherEntry], currentPage: 1, totalPages: 1, totalCount: 1 }),
    }));

    await page.goto('/#/history');
    const card = page.locator('div', { hasText: 'Paid via other' }).filter({ hasText: '218' }).last();
    await expect(card).toBeVisible();
    await expect(card.getByText('Other', { exact: true }).last()).toBeVisible();
    await expect(card.getByText('UPI', { exact: true })).toHaveCount(0);
  });

  test('should view history and search transactions', async ({ page }) => {
    await page.goto('/#/history');

    // Check search input
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    // Existing mock items should render
    await expect(page.locator('text=Grocery Shopping').first()).toBeVisible();
    await expect(page.locator('text=Monthly Salary').first()).toBeVisible();

    // Type in search
    await searchInput.fill('Grocery');
    await expect(searchInput).toHaveValue('Grocery');
  });
});
