import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';
import { setupPlannerMock } from './helpers/plannerMock';

const createGoal = async (page) => {
  await page.getByRole('button', { name: 'Create a goal' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Goal name').fill('Emergency Fund');
  await d.getByLabel('Target (₹)').fill('50000');
  await d.getByLabel('Already saved (₹)').fill('10000');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('goal-card')).toContainText('Emergency Fund');
};

test.describe('Planner: savings goals and investments', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
  });

  test('create a goal, add money and withdraw; nothing touches transactions', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner?tab=goals');
    await expect(page.getByText('No savings goals yet')).toBeVisible();

    await page.getByRole('button', { name: 'Create a goal' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Target (₹)').fill('0');
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(d.getByText('Give the goal a name')).toBeVisible();
    await expect(d.getByText(/Target amount must be more than 0/)).toBeVisible();
    await d.getByRole('button', { name: 'Cancel' }).click();

    await createGoal(page);
    const card = page.getByTestId('goal-card');
    await expect(card).toContainText('₹10,000');
    await expect(card).toContainText('of ₹50,000');
    await expect(card).toContainText('20%');
    expect(mock.requests.find(r => r.method === 'POST' && r.path === '/goals').body)
      .toEqual({ name: 'Emergency Fund', targetAmount: '50000', initialAmount: '10000', monthlyContribution: null, targetDate: null, note: null });

    await card.getByRole('button', { name: 'Add money' }).click();
    await expect(page.getByRole('dialog')).toContainText('No transaction is added');
    await page.getByRole('dialog').getByLabel('Amount (₹)').fill('2500.50');
    await page.getByRole('dialog').getByRole('button', { name: 'Add money' }).click();
    await expect(card).toContainText('₹12,500.50');

    await card.getByRole('button', { name: 'Withdraw' }).click();
    await page.getByRole('dialog').getByLabel('Amount (₹)').fill('20000');
    await page.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByRole('dialog').getByText(/You can withdraw at most ₹12,500.50/)).toBeVisible();
    await page.getByRole('dialog').getByLabel('Amount (₹)').fill('500.50');
    await page.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
    await expect(card).toContainText('₹12,000');
    await expect(page.getByTestId('goals-total')).toContainText('₹12,000');

    const contributions = mock.requests.filter(r => r.path.endsWith('/contributions') && r.method === 'POST').map(r => [r.body.type, r.body.amount]);
    expect(contributions).toEqual([['CONTRIBUTION', '2500.50'], ['WITHDRAWAL', '500.50']]);
    expect(mock.requests.some(r => r.path.startsWith('/transactions') || r.path.includes('expenses'))).toBe(false);
  });

  test('add an investment and record a buy; the disclaimer and confirmation explain the effects', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner?tab=invest');
    await expect(page.getByText(/doesn't estimate returns/)).toBeVisible();
    await page.getByRole('button', { name: 'Add an investment' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Name').fill('Nifty Index Fund');
    await d.getByLabel('Type').selectOption('INDEX_FUND');
    await d.getByLabel('Planned monthly (₹)').fill('2000');
    await d.getByRole('button', { name: 'Save' }).click();
    const card = page.getByTestId('investment-card');
    await expect(card).toContainText('Index Fund · ₹2,000 planned monthly');

    await card.getByRole('button', { name: 'Invest' }).click();
    await expect(page.getByRole('dialog')).toContainText('counts as investment, not as spending');
    await page.getByRole('dialog').getByLabel('Amount (₹)').fill('1500');
    await page.getByRole('dialog').getByLabel('Paid from').selectOption('UPI');
    await page.getByRole('dialog').getByRole('button', { name: 'Record investment' }).click();
    await expect(card).toContainText('₹1,500');
    await expect(page.getByTestId('investments-summary')).toContainText('of ₹2,000 planned');
    const buy = mock.requests.find(r => r.path.endsWith('/transactions') && r.method === 'POST');
    expect(buy.body).toMatchObject({ type: 'BUY', amount: '1500', paymentMethod: 'UPI' });

    await card.getByRole('button', { name: 'Delete Nifty Index Fund' }).click();
    await expect(page.getByText('Delete with its transactions?')).toBeVisible();
    await expect(page.getByText(/To keep them, pause it instead/)).toBeVisible();
  });

  test('a Savings budget line can track a goal', async ({ page }) => {
    const now = new Date();
    const mock = await setupPlannerMock(page, { plan: { year: now.getFullYear(), month: now.getMonth() + 1, allocations: [] } });
    await page.goto('/#/planner?tab=goals');
    await createGoal(page);
    await page.getByRole('tab', { name: 'Budget' }).click();
    await page.getByRole('button', { name: 'Add first allocation' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Group').selectOption('SAVINGS');
    await d.getByLabel('Name').fill('Emergency Fund');
    await d.getByLabel('Planned amount (₹)').fill('2000');
    await d.getByLabel('Track a savings goal').selectOption({ label: 'Emergency Fund' });
    await d.getByRole('button', { name: 'Save' }).click();
    const post = mock.requests.find(r => r.method === 'POST' && r.path.endsWith('/allocations'));
    expect(post.body.savingsGoalId).toBeTruthy();
    expect(post.body).not.toHaveProperty('investmentPlanId');
    await expect(page.getByTestId('allocation-card')).toContainText('Tracks Emergency Fund');
  });

  test('six planner tabs scroll sideways at 320px without page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await setupPlannerMock(page);
    await page.goto('/#/planner');
    for (const name of ['Goals', 'Invest', 'Overview']) {
      await page.getByRole('tab', { name }).click();
      await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tab', { name })).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    }
  });
});
