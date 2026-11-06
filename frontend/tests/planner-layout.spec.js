import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';
import { setupPlannerMock } from './helpers/plannerMock';

// Release check: every planner tab, populated, renders without errors or sideways scrolling at
// phone, tablet and desktop widths, in both themes.
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const on = (d) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`;
const options = {
  plan: { year, month, allocations: [
    { group: 'FIXED', name: 'Rent / Accommodation', plannedAmount: 3500, matchCategories: ['Bills'] },
    { group: 'VARIABLE', name: 'Mess / Food', plannedAmount: 2500, matchCategories: ['Food'] },
    { group: 'SAVINGS', name: 'Emergency Fund', plannedAmount: 2000 },
    { group: 'INVESTMENT', name: 'Nifty Index Fund', plannedAmount: 1000 },
  ] },
  spending: [
    { id: '11111111-1111-4111-8111-000000000001', title: 'Mess advance for the whole month', category: 'Food', amount: 2500, date: on(3), autoLine: 'Mess / Food', autoBy: 'NAME', paymentMethod: 'UPI' },
    { id: '11111111-1111-4111-8111-000000000002', title: 'Gift', category: 'Shopping', amount: 300, date: on(4) },
  ],
  bills: {
    bills: [{ id: 'b', title: 'Broadband and streaming bundle', category: 'Bills', recurringType: 'monthly', paymentMethod: 'Net Banking', dueDate: on(2), amount: 1299, status: 'NOT_FOUND' }],
    emis: [{ id: 'e', title: 'Phone EMI', type: 'FIXED', active: true, dueDate: on(5), expectedAmount: 2000, paidThisMonth: 0, status: 'OVERDUE', remainingInstallments: 9, payable: true }],
    upcoming: [{ id: 'u', source: 'EMI', title: 'Phone EMI', dueDate: on(5), amount: 2000, status: 'OVERDUE' }],
    summary: { expected: 3299, settled: 0, pending: 3299, overdueCount: 1, notFoundCount: 1 },
  },
  report: {
    kpis: { income: 15000, expectedIncome: 15000, plannedExpenses: 6000, expenses: 2800, savingsNet: 2000, investmentNet: 1000, available: 9200, budgetUtilization: 47, savingsRate: 13 },
    trend: [{ year, month, income: 15000, expenses: 2800 }],
    categories: [{ category: 'Food', amount: 2500, share: 89, previousAmount: 2100 }, { category: 'Shopping', amount: 300, share: 11, previousAmount: 0 }],
    lines: [{ id: 'l', name: 'Mess / Food', planned: 2500, actual: 2500, utilization: 100 }],
    goals: [{ id: 'g', name: 'Emergency Fund', savedAmount: 2000, targetAmount: 50000, progress: 4, reached: false }],
    insights: [{ id: 'i', tone: 'info', text: '₹300 was spent outside your plan, mostly on Shopping.' }],
  },
};

for (const theme of ['light', 'dark']) {
  for (const width of [320, 390, 768, 1280]) {
    test(`every planner tab fits at ${width}px (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await setupApiMocks(page, { loggedIn: true });
      await setupPlannerMock(page, options);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/#/planner?tab=salary');
      await page.getByRole('button', { name: 'Add salary' }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel('Name').fill('Salary from a company with a long name');
      await d.getByLabel('Expected monthly amount (₹)').fill('15000');
      await d.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByTestId('salary-record')).toBeVisible();

      for (const tab of ['Overview', 'Salary', 'Budget', 'Spending', 'Goals', 'Invest', 'Bills']) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tabpanel')).not.toBeEmpty();
        await expect(page.getByText(/Could not load/)).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${tab} overflows`).toBe(false);
      }
      expect(errors).toEqual([]);
    });
  }
}
