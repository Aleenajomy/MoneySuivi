import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';
import { setupPlannerMock } from './helpers/plannerMock';

const now = new Date();
const thisMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
const monthInput = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;
const shift = ({ year, month }, by) => {
  const i = year * 12 + (month - 1) + by;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const field = (page, name) => page.getByRole('spinbutton', { name: new RegExp(`^${escape(name)}`) });
const setAmount = async (page, name, value) => {
  const input = field(page, name);
  await input.fill(String(value));
  await input.press('Enter');
};
const noMoneyTouched = (mock) => {
  expect(mock.moneyWrites).toEqual([]);
  expect(mock.otherPlannerCalls).toEqual([]);
};

test.describe('Salary Planner', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
  });

  test('shows the four sections and the default plan with the agreed calculation', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/');
    await page.locator('nav[aria-label="Mobile Bottom Navigation"]').getByRole('button', { name: 'Salary Planner' }).click();
    await expect(page).toHaveURL(/#\/planner$/);

    for (const name of ['A. Monthly Salary', 'B. Fixed Expenses', 'C. Monthly Budget (from ₹8,400)', 'D. Savings Summary']) {
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
    await expect(field(page, 'Salary')).toHaveValue('15000');
    await expect(field(page, 'Company mess allowance')).toHaveValue('2560');
    await expect(field(page, 'EMI')).toHaveValue('4100');
    await expect(field(page, 'Room rent')).toHaveValue('2500');
    await expect(page.getByTestId('income-with-allowance')).toContainText('Total Income + Allowance');
    await expect(page.getByTestId('income-with-allowance')).toContainText('₹17,560');
    await expect(page.getByTestId('after-fixed')).toContainText('₹8,400');
    await expect(page.getByTestId('extra-balance')).toContainText('₹900');
    await expect(page.getByTestId('budget-total')).toContainText('₹8,400');
    await expect(page.getByTestId('planned-savings')).toContainText('₹4,000');
    await expect(page.getByTestId('planned-expenses')).toContainText('₹10,100');
    await expect(page.getByTestId('money-remaining')).toContainText('₹900');
    const bar = page.getByTestId('salary-breakdown');
    await expect(bar).toContainText('Where your ₹15,000 goes');
    for (const text of ['₹6,600', '44%', '₹3,500', '23%', '₹4,000', '27%', '₹900', '6%']) await expect(bar).toContainText(text);

    for (const gone of ['Mark received', 'Record', 'Add source', 'Invest', 'Goals', 'Reset planner']) {
      await expect(page.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
    }
    await expect(page.getByText('Total Received')).toHaveCount(0);
    // Set-up is idempotent (development mode may send it twice); it still makes one plan.
    expect(mock.requests.filter(r => r.path === '/salary-plan/init').every(r => r.body.month === thisMonth.month)).toBe(true);
    expect(Object.keys(mock.plans)).toEqual([`${thisMonth.year}-${thisMonth.month}`]);
    noMoneyTouched(mock);
  });

  test('editing amounts saves the plan, recalculates, and never touches money', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await setAmount(page, 'Travel', 800);
    await expect(page.getByRole('status')).toContainText('Saved');
    await expect(page.getByTestId('extra-balance')).toContainText('₹1,100');
    await setAmount(page, 'Room rent', 3000);
    await expect(page.getByTestId('after-fixed')).toContainText('₹7,900');
    await expect(page.getByTestId('extra-balance')).toContainText('₹600');
    expect(mock.requests.filter(r => r.method === 'PUT').map(r => r.body)).toEqual([
      { ...thisMonth, travelAmount: '800' },
      { ...thisMonth, rentAmount: '3000' },
    ]);
    noMoneyTouched(mock);
  });

  test('the allowance changes only "Total Income + Allowance", never the budget', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await setAmount(page, 'Company mess allowance', 3000);
    await expect(page.getByTestId('income-with-allowance')).toContainText('₹18,000');
    await expect(page.getByTestId('after-fixed')).toContainText('₹8,400');
    await expect(page.getByTestId('money-remaining')).toContainText('₹900');
    noMoneyTouched(mock);
  });

  test('allocating more than is left shows the over-budget amount instead of a balance', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await setAmount(page, 'Shopping / personal needs', 2500);
    const warning = page.getByTestId('over-budget');
    await expect(warning).toContainText('Over budget by ₹100');
    await expect(page.getByTestId('extra-balance')).toHaveCount(0);
    await expect(page.getByTestId('money-remaining')).toContainText('₹0');
    await setAmount(page, 'Shopping / personal needs', 2400);
    await expect(page.getByTestId('extra-balance')).toContainText('₹0');
    await expect(warning).toHaveCount(0);
    noMoneyTouched(mock);
  });

  test('invalid amounts are not saved', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await setAmount(page, 'Salary', '15000.555');
    await expect(page.getByRole('alert')).toContainText('at most 2 decimals');
    await setAmount(page, 'Salary', '');
    await expect(page.getByRole('alert')).toContainText('Salary is required');
    expect(mock.requests.filter(r => r.method === 'PUT')).toHaveLength(0);
  });

  test('EMI offers the Loans & EMIs total but only changes the plan', async ({ page }) => {
    const mock = await setupPlannerMock(page, { emiTrackerTotal: 4100 });
    await page.goto('/#/planner');
    await setAmount(page, 'EMI', 3000);
    const useTracker = page.getByRole('button', { name: /Loans & EMIs total is ₹4,100/ });
    await expect(useTracker).toBeVisible();
    await useTracker.click();
    await expect(field(page, 'EMI')).toHaveValue('4100');
    await expect(useTracker).toHaveCount(0);
    noMoneyTouched(mock);
  });

  test('reset to my default plan asks first and restores the defaults', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await setAmount(page, 'Salary', 20000);
    await expect(page.getByTestId('after-fixed')).toContainText('₹13,400');
    await page.getByRole('button', { name: 'Reset to my default plan' }).click();
    await expect(page.getByText('no transaction or balance is touched')).toBeVisible();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(field(page, 'Salary')).toHaveValue('15000');
    await expect(page.getByTestId('after-fixed')).toContainText('₹8,400');
    noMoneyTouched(mock);
  });

  test('a new month copies the previous one; a past month is created only when asked', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await setAmount(page, 'Travel', 1200);
    await expect(page.getByRole('status')).toContainText('Saved');

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByTestId('planner-month')).toHaveValue(monthInput(shift(thisMonth, 1)));
    await expect(field(page, 'Travel')).toHaveValue('1200');

    await page.getByTestId('planner-month').fill(monthInput(shift(thisMonth, -3)));
    await expect(page.getByText(/No plan for/)).toBeVisible();
    await page.getByRole('button', { name: 'Create plan for this month' }).click();
    await expect(field(page, 'Salary')).toHaveValue('15000');
    noMoneyTouched(mock);
  });

  test('shows a loading state, then recovers from an API error with Try again', async ({ page }) => {
    const mock = await setupPlannerMock(page, { failLoad: true, loadDelayMs: 1500 });
    await page.goto('/#/planner');
    await expect(page.getByLabel('Loading planner')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Could not load');
    mock.failLoad = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(field(page, 'Salary')).toHaveValue('15000');
  });

  test('very large and fractional amounts are shown to the paisa', async ({ page }) => {
    await setupPlannerMock(page);
    await page.goto('/#/planner');
    const shown = await page.evaluate(async () => {
      const { formatAmount } = await import('/src/utils/planner.js');
      return [formatAmount('90999999999999.09'), formatAmount(4999.5), formatAmount(15000), formatAmount('12.30')];
    });
    expect(shown).toEqual(['₹9,09,99,99,99,99,999.09', '₹4,999.50', '₹15,000', '₹12.30']);
  });

  for (const vp of [{ width: 320, height: 640 }, { width: 1280, height: 800 }]) {
    test(`has no horizontal overflow at ${vp.width}px, even over budget`, async ({ page }) => {
      await page.setViewportSize(vp);
      await setupPlannerMock(page);
      await page.goto('/#/planner');
      await expect(page.getByTestId('salary-breakdown')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      await setAmount(page, 'Shopping / personal needs', 99999999);
      await expect(page.getByTestId('over-budget')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    });
  }
});
