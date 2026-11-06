import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';
import { setupPlannerMock } from './helpers/plannerMock';

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const plan = { year, month, allocations: [{ group: 'FIXED', name: 'Rent', plannedAmount: 3500 }, { group: 'VARIABLE', name: 'Food', plannedAmount: 2000 }] };
const report = {
  kpis: { income: 15000, expectedIncome: 15000, plannedExpenses: 5500, expenses: 6100, savingsNet: 2250, investmentNet: 1000, available: 5650, budgetUtilization: 111, savingsRate: 15 },
  trend: [
    { year, month: month === 1 ? 12 : month - 1, income: 15000, expenses: 5500 },
    { year, month, income: 15000, expenses: 6100 },
  ],
  categories: [{ category: 'Bills', amount: 3500, share: 57, previousAmount: 3500 }, { category: 'Food', amount: 2600, share: 43, previousAmount: 2000 }],
  lines: [{ id: 'l1', name: 'Rent', planned: 3500, actual: 3500, utilization: 100 }, { id: 'l2', name: 'Food', planned: 2000, actual: 2600, utilization: 130 }],
  goals: [{ id: 'g1', name: 'Emergency Fund', savedAmount: 2250, targetAmount: 50000, progress: 5, reached: false }],
  insights: [
    { id: 'over-plan:l2', tone: 'warning', text: 'Food is ₹600 over plan (₹2,600 of ₹2,000).' },
    { id: 'savings-rate', tone: 'positive', text: 'Your savings rate is 15%: you set aside ₹2,250 of the ₹15,000 you received.' },
  ],
};
const addSalary = async (page) => {
  await page.getByRole('tab', { name: 'Salary' }).click();
  await page.getByRole('button', { name: 'Add salary' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Name').fill('Acme salary');
  await d.getByLabel('Expected monthly amount (₹)').fill('15000');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('salary-record')).toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).click();
};

test.describe('Planner: monthly dashboard and insights', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
  });

  test('shows actual figures, insights and the charts with their data', async ({ page }) => {
    await setupPlannerMock(page, { plan, report });
    await page.goto('/#/planner');
    await addSalary(page);

    const actual = page.getByTestId('planner-summary').getByRole('region', { name: 'Actual' });
    await expect(actual).toContainText('₹6,100');
    await expect(actual).toContainText('111% of planned spending');
    await expect(actual).toContainText('15% of income received');
    await expect(actual).toContainText('₹5,650');

    const insights = page.getByTestId('insights');
    await expect(insights).toContainText('Food is ₹600 over plan');
    await expect(insights.getByRole('img', { name: 'Heads-up' })).toBeVisible();
    await expect(insights.getByRole('img', { name: 'Good news' })).toBeVisible();

    await expect(page.getByTestId('trend-chart').locator('.recharts-line')).toHaveCount(2);
    await expect(page.getByTestId('trend-chart').getByRole('table', { includeHidden: true })).toContainText('₹6,100');
    await expect(page.getByTestId('planned-vs-actual')).toContainText('130%');
    const table = page.getByTestId('category-table');
    await expect(table.getByRole('row', { name: /Food/ })).toContainText('₹2,600');
    await expect(table.getByRole('row', { name: /Food/ })).toContainText('₹2,000');
    await expect(page.getByTestId('goals-progress').getByRole('progressbar', { name: 'Emergency Fund: 5% saved' })).toBeVisible();
  });

  test('a month with nothing recorded shows no charts and no insights', async ({ page }) => {
    await setupPlannerMock(page, { plan });
    await page.goto('/#/planner');
    await addSalary(page);
    await expect(page.getByTestId('planner-summary').getByRole('region', { name: 'Actual' })).toBeVisible();
    for (const id of ['insights', 'trend-chart', 'planned-vs-actual', 'category-breakdown', 'goals-progress']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  for (const width of [320, 768, 1280]) {
    test(`dashboard has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await setupPlannerMock(page, { plan, report });
      await page.goto('/#/planner');
      await addSalary(page);
      await expect(page.getByTestId('trend-chart')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    });
  }
});
