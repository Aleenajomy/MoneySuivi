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
const dayInMonth = (day = 1) => `${monthInput(thisMonth)}-${String(day).padStart(2, '0')}`;

const addSalarySource = async (page, amount = '15000') => {
  await page.getByRole('button', { name: 'Add salary' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Acme salary');
  await dialog.getByLabel('Expected monthly amount (₹)').fill(amount);
  await dialog.getByLabel('Pay day (optional)').fill('1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('salary-record')).toContainText('Acme salary');
};

const historySalary = (amount, id = '11111111-1111-4111-8111-111111111111') => ({
  id, title: 'Salary credit', amount, category: 'Salary',
  expenseDate: `${dayInMonth(1)}T00:00:00.000Z`, paymentMethod: 'UPI', matchesExpected: amount === 15000,
});

test.describe('Salary Planner', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
  });

  test('opens from the mobile nav and shows the four sections with the default expenses', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/');
    const nav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    await nav.getByRole('button', { name: 'Salary Planner' }).click();

    await expect(page).toHaveURL(/#\/planner$/);
    for (const name of ['Monthly Overview', 'Salary & Other Income', 'Monthly Expenses', 'Savings Suggestion']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    for (const gone of ['Invest', 'Goals', 'Spending', 'Bills', 'Budget']) {
      await expect(page.getByRole('tab', { name: gone })).toHaveCount(0);
    }
    await expect(page.getByTestId('planner-month')).toHaveValue(monthInput(thisMonth));

    const lines = page.getByTestId('expense-line');
    await expect(lines).toHaveText([/Rent.*₹2,500/, /EMI/, /Mess \/ Food/, /Travel/, /Other Personal/]);
    const setUp = mock.requests.filter(r => r.method === 'POST' && r.path === '/budgets');
    expect(setUp).toHaveLength(1);
    expect(setUp[0].body).toEqual({ ...thisMonth, defaults: true });
    expect(mock.transactionsCreated).toBe(0);
  });

  test('expected and received income are shown separately; planning never records a transaction', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await addSalarySource(page);

    const planned = page.getByTestId('planned-position');
    const actual = page.getByTestId('actual-position');
    await expect(planned).toContainText('Expected income');
    await expect(planned).toContainText('₹15,000');
    await expect(planned).toContainText('₹12,500');
    await expect(actual).toContainText('Received income');
    await expect(actual).toContainText('₹15,000 still expected');

    await page.getByRole('button', { name: 'Edit Rent' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Planned amount (₹)').fill('3000');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(planned).toContainText('₹12,000');
    await expect(page.getByTestId('suggested-savings')).toContainText('₹2,400');
    expect(mock.transactionsCreated).toBe(0);
  });

  test('Mark received preselects nothing and Record new needs an account', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await addSalarySource(page);
    await page.getByRole('button', { name: 'Mark received' }).click();

    const dialog = page.getByRole('dialog');
    for (const name of ['Link existing income', 'Already in my balance', 'Record new']) {
      await expect(dialog.getByRole('radio', { name: new RegExp(name) })).not.toBeChecked();
    }
    await expect(dialog.getByRole('button', { name: 'Choose an option' })).toBeDisabled();

    await dialog.getByRole('radio', { name: /Record new/ }).check();
    await expect(dialog.getByLabel('Received in')).toHaveValue('');
    await dialog.getByLabel('Amount received (₹)').fill('14500');
    await dialog.getByRole('button', { name: 'Record ₹14,500' }).click();
    await expect(dialog.getByText('Choose the account the money arrived in')).toBeVisible();
    expect(mock.requests.some(r => r.path.endsWith('/receive'))).toBe(false);

    await dialog.getByLabel('Received in').selectOption('UPI');
    await expect(dialog.getByTestId('receive-effect')).toContainText('Adds ₹14,500 to UPI');
    await dialog.getByRole('button', { name: 'Record ₹14,500' }).click();

    await expect(page.getByTestId('salary-record')).toContainText('Partly received');
    const call = mock.requests.find(r => r.path.endsWith('/receive'));
    expect(call.body).toMatchObject({ mode: 'create', receivedAmount: '14500', paymentMethod: 'UPI', confirmDuplicate: false });
    expect(mock.transactionsCreated).toBe(1);
  });

  test('a salary in History with a different amount can be linked, and creates nothing', async ({ page }) => {
    const candidate = historySalary(14850);
    const mock = await setupPlannerMock(page, { candidates: [candidate] });
    await page.goto('/#/planner');
    await addSalarySource(page);
    await page.getByRole('button', { name: 'Mark received' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: /Link existing income \(1\)/ })).not.toBeChecked();
    await dialog.getByRole('radio', { name: /Already in my balance/ }).check();
    await expect(dialog.getByTestId('history-hint')).toContainText('1 unlinked income transaction is in History');
    await dialog.getByRole('radio', { name: /Link existing income/ }).check();
    await dialog.getByRole('radio', { name: /Salary credit/ }).check();
    await dialog.getByRole('button', { name: 'Link transaction' }).click();

    await expect(page.getByTestId('salary-record')).toContainText('Partly received');
    expect(mock.requests.find(r => r.path.endsWith('/receive')).body).toEqual({ mode: 'link', expenseId: candidate.id });
    expect(mock.transactionsCreated).toBe(0);
  });

  test('Record new warns about a possible duplicate and offers to link it instead', async ({ page }) => {
    const lookalike = historySalary(14850);
    const mock = await setupPlannerMock(page, { duplicates: [lookalike] });
    await page.goto('/#/planner');
    await addSalarySource(page);
    await page.getByRole('button', { name: 'Mark received' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Record new/ }).check();
    await dialog.getByLabel('Received in').selectOption('UPI');
    await dialog.getByRole('button', { name: 'Record ₹15,000' }).click();

    const warning = dialog.getByTestId('possible-duplicate');
    await expect(warning).toContainText('may already be in History');
    expect(mock.transactionsCreated).toBe(0);
    await warning.getByRole('button', { name: 'Link this' }).click();
    await dialog.getByRole('button', { name: 'Link transaction' }).click();
    await expect(page.getByTestId('salary-record')).toContainText('Partly received');
    expect(mock.requests.filter(r => r.path.endsWith('/receive')).at(-1).body).toEqual({ mode: 'link', expenseId: lookalike.id });
    expect(mock.transactionsCreated).toBe(0);
  });

  test('Already in my balance counts the salary as received without a transaction', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await addSalarySource(page);
    await page.getByRole('button', { name: 'Mark received' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Already in my balance/ }).check();
    await expect(dialog.getByLabel('Received in')).toHaveCount(0);
    await expect(dialog.getByTestId('receive-effect')).toContainText('No transaction is added');
    await dialog.getByRole('button', { name: 'Mark received' }).click();

    await expect(page.getByTestId('salary-record')).toContainText('already in balance, no transaction');
    await expect(page.getByTestId('actual-position')).toContainText('₹15,000');
    expect(mock.requests.find(r => r.path.endsWith('/receive')).body).toMatchObject({ mode: 'alreadyInBalance', receivedAmount: '15000' });
    expect(mock.transactionsCreated).toBe(0);
  });

  test('recording a planned expense asks for the account and adds one transaction', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await page.getByRole('button', { name: 'Record a payment for Rent' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Amount paid (₹)')).toHaveValue('2500');
    await dialog.getByRole('button', { name: 'Record expense' }).click();
    await expect(dialog.getByText('Choose the account you paid from')).toBeVisible();
    await dialog.getByLabel('Paid from').selectOption('Cash');
    await expect(dialog.getByTestId('record-effect')).toContainText('taken from Cash');
    await dialog.getByRole('button', { name: 'Record expense' }).click();

    await expect(page.getByTestId('expense-line').filter({ hasText: 'Rent' })).toContainText('Spent ₹2,500');
    expect(mock.requests.filter(r => r.path.endsWith('/record')).map(r => r.body)).toEqual([{ amount: '2500', date: expect.any(String), paymentMethod: 'Cash' }]);
    expect(mock.transactionsCreated).toBe(1);
    await expect(page.getByRole('button', { name: 'Record a payment for EMI' })).toHaveCount(0);
  });

  test('an EMI payment that looks duplicated in History is counted once only after linking', async ({ page }) => {
    const mock = await setupPlannerMock(page, {
      emiPayments: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Phone EMI', amount: 2000, paidAt: `${dayInMonth(3)}T10:00:00.000Z` }],
      emiCandidates: [{ id: 'bbbbbbbb-0000-4000-8000-000000000001', title: 'Phone EMI', amount: 2000, date: `${dayInMonth(3)}T00:00:00.000Z`, category: 'Bills', paymentMethod: 'UPI', sameAmount: true, daysApart: 0 }],
      spending: [{ id: 'bbbbbbbb-0000-4000-8000-000000000001', title: 'Phone EMI', category: 'Bills', amount: 2000, date: dayInMonth(3) }],
    });
    await page.goto('/#/planner');
    const block = page.getByTestId('emi-payments');
    await expect(block).toContainText('1 payment may be counted twice');
    await expect(page.getByTestId('actual-position')).toContainText('₹4,000');

    await block.getByRole('button', { name: 'Already in History?' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Phone EMI/ }).check();
    await dialog.getByRole('button', { name: 'Link as same payment' }).click();

    await expect(block).toContainText('Counted once');
    await expect(page.getByTestId('actual-position')).toContainText('₹2,000');
    expect(mock.transactionsCreated).toBe(0);
    await block.getByRole('button', { name: 'Unlink Phone EMI payment' }).click();
    await expect(page.getByTestId('actual-position')).toContainText('₹4,000');
  });

  test('the savings suggestion is a calculation with an editable share', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await addSalarySource(page);
    await expect(page.getByTestId('suggested-savings')).toContainText('₹2,500');
    await expect(page.getByTestId('suggested-savings')).toContainText('of ₹12,500 planned remaining');
    await expect(page.getByTestId('actual-savings')).toContainText('₹0');
    await expect(page.getByTestId('savings-note')).toContainText('never creates a transaction');

    await page.getByLabel('Savings %').fill('150');
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByText('Use a whole number from 0 to 100')).toBeVisible();
    await page.getByLabel('Savings %').fill('30');
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByTestId('suggested-savings')).toContainText('₹3,750');
    expect(mock.requests.find(r => r.method === 'PUT' && r.body.savingsPercent !== undefined).body).toEqual({ savingsPercent: 30 });
    expect(mock.transactionsCreated).toBe(0);
  });

  test('month selector loads other months; a past month is not set up without asking', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await expect(page.getByTestId('expense-line').first()).toBeVisible();

    await page.getByRole('button', { name: 'Next month' }).click();
    const next = shift(thisMonth, 1);
    await expect(page.getByTestId('planner-month')).toHaveValue(monthInput(next));
    await expect.poll(() => mock.requests.some(r => r.method === 'POST' && r.path === '/budgets' && r.body.month === next.month && r.body.year === next.year)).toBe(true);

    const past = shift(thisMonth, -3);
    await page.getByTestId('planner-month').fill(monthInput(past));
    await expect(page.getByText(/No plan for/)).toBeVisible();
    expect(mock.requests.some(r => r.method === 'POST' && r.path === '/budgets' && r.body.month === past.month && r.body.year === past.year)).toBe(false);

    await page.getByRole('button', { name: 'Start plan for this month' }).click();
    await expect(page.getByTestId('expense-line').first()).toBeVisible();
  });

  test('shows a loading state, then recovers from an API error with Try again', async ({ page }) => {
    const mock = await setupPlannerMock(page, { failOverview: true, overviewDelayMs: 1500 });
    await page.goto('/#/planner');
    await expect(page.getByLabel('Loading planner')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Could not load');
    mock.failOverview = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('monthly-overview')).toBeVisible();
  });

  for (const vp of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
    test(`has no horizontal overflow at ${vp.width}px`, async ({ page }) => {
      await page.setViewportSize(vp);
      await setupPlannerMock(page, {
        emiPayments: [{ id: 'aaaaaaaa-0000-4000-8000-000000000002', title: 'A rather long two-wheeler loan EMI', amount: 2000, paidAt: `${dayInMonth(3)}T10:00:00.000Z` }],
      });
      await page.goto('/#/planner');
      await addSalarySource(page);
      await expect(page.getByTestId('emi-payments')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      await page.getByRole('button', { name: 'Mark received' }).click();
      await page.getByRole('dialog').getByRole('radio', { name: /Record new/ }).check();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    });
  }
});
