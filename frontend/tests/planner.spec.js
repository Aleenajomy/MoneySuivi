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

const addSalarySource = async (page, amount = '15000') => {
  await page.getByRole('tab', { name: 'Salary' }).click();
  await page.getByRole('button', { name: 'Add salary' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Acme salary');
  await dialog.getByLabel('Expected monthly amount (₹)').fill(amount);
  await dialog.getByLabel('Pay day (optional)').fill('1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('salary-record')).toContainText('Acme salary');
};

test.describe('Salary Planner', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupApiMocks(page, { loggedIn: true });
  });

  test('opens from the sixth mobile tab and sets up the current month automatically', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/');
    const nav = page.locator('nav[aria-label="Mobile Bottom Navigation"]');
    await nav.getByRole('button', { name: 'Salary Planner' }).click();

    await expect(page).toHaveURL(/#\/planner$/);
    await expect(page.getByRole('heading', { name: 'Salary Planner' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Salary Planner' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('planner-month')).toHaveValue(monthInput(thisMonth));
    await expect(page.getByText('Start with your salary')).toBeVisible();

    const setUp = mock.requests.filter(r => r.method === 'POST' && r.path === '/budgets');
    expect(setUp).toHaveLength(1);
    expect(setUp[0].body).toEqual(thisMonth);
  });

  test('salary source form validates, saves, and the month expects it without assuming it arrived', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner?tab=salary');
    await page.getByRole('button', { name: 'Add salary' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Name is required')).toBeVisible();
    await expect(dialog.getByText('Expected amount is required')).toBeVisible();

    await dialog.getByLabel('Name').fill('Acme salary');
    await dialog.getByLabel('Expected monthly amount (₹)').fill('15000.555');
    await dialog.getByLabel('Pay day (optional)').fill('32');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(/at most 2 decimals/)).toBeVisible();
    await expect(dialog.getByText('Pay day must be between 1 and 31')).toBeVisible();
    expect(mock.requests.some(r => r.method === 'POST' && r.path === '/income-sources')).toBe(false);

    await dialog.getByLabel('Expected monthly amount (₹)').fill('15000');
    await dialog.getByLabel('Pay day (optional)').fill('1');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const record = page.getByTestId('salary-record');
    await expect(record).toContainText('Acme salary');
    await expect(record).toContainText('Pending');
    await expect(record).toContainText('₹15,000');
    expect(mock.requests.find(r => r.method === 'POST' && r.path === '/income-sources').body)
      .toEqual({ name: 'Acme salary', kind: 'SALARY', expectedAmount: '15000', payDay: 1 });

    await page.getByRole('tab', { name: 'Overview' }).click();
    const summary = page.getByTestId('planner-summary');
    await expect(summary.getByRole('region', { name: 'Income' })).toContainText('Expected');
    await expect(summary.getByText('₹15,000').first()).toBeVisible();
    await expect(summary).toContainText('₹15,000 to come');
  });

  test('marking salary received records a new income when nothing matches in History', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await addSalarySource(page);
    await page.getByRole('button', { name: 'Mark received' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: 'Already in History' })).toHaveCount(0);
    await dialog.getByLabel('Amount received (₹)').fill('14500');
    await dialog.getByLabel('Received in').selectOption('UPI');
    await dialog.getByRole('button', { name: 'Mark received' }).click();

    await expect(page.getByTestId('salary-record')).toContainText('Partly received');
    const call = mock.requests.find(r => r.path.endsWith('/receive'));
    expect(call.body).toMatchObject({ mode: 'create', receivedAmount: '14500', paymentMethod: 'UPI' });
    expect(call.body.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('a matching income already in History is offered first and linked, not duplicated', async ({ page }) => {
    const candidate = {
      id: '11111111-1111-4111-8111-111111111111', title: 'Salary credit', amount: 15000, category: 'Salary',
      expenseDate: `${monthInput(thisMonth)}-01T00:00:00.000Z`, paymentMethod: 'Net Banking', matchesExpected: true,
    };
    const mock = await setupPlannerMock(page, { candidates: [candidate] });
    await page.goto('/#/planner');
    await addSalarySource(page);
    await page.getByRole('button', { name: 'Mark received' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: 'Already in History' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('radio')).toBeChecked();
    await dialog.getByRole('button', { name: 'Link transaction' }).click();

    await expect(page.getByTestId('salary-record')).toContainText('Received');
    const call = mock.requests.find(r => r.path.endsWith('/receive'));
    expect(call.body).toEqual({ mode: 'link', expenseId: candidate.id });
  });

  test('budget allocation form, summary and the distribution chart stay in step', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await addSalarySource(page);
    await page.getByRole('tab', { name: 'Budget' }).click();
    await page.getByRole('button', { name: 'Add first allocation' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Give this line a name')).toBeVisible();
    await dialog.getByRole('button', { name: 'Rent / Accommodation' }).click();
    await dialog.getByLabel('Planned amount (₹)').fill('-5');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(/Planned amount must be a positive number/)).toBeVisible();
    await dialog.getByLabel('Planned amount (₹)').fill('3500');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await page.getByRole('button', { name: 'Add to Savings' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Emergency Fund' }).click();
    await page.getByRole('dialog').getByLabel('Planned amount (₹)').fill('2000.50');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

    const summary = page.getByTestId('allocation-summary');
    await expect(summary).toContainText('Left to allocate');
    await expect(summary).toContainText('₹9,499.50');
    await expect(summary).toContainText('₹5,500.50 planned of ₹15,000 expected');
    await expect(page.getByTestId('group-FIXED').getByTestId('allocation-card')).toContainText('Rent / Accommodation');
    await expect(page.getByTestId('group-SAVINGS').getByTestId('allocation-card')).toContainText('₹2,000.50');

    const rentCreate = mock.requests.find(r => r.method === 'POST' && r.body.name === 'Rent / Accommodation');
    expect(rentCreate.body).toEqual({ group: 'FIXED', name: 'Rent / Accommodation', plannedAmount: '3500', matchCategories: [], recurring: true });

    // Controlled by the server response, so click and wait for the saved state.
    const repeat = page.getByRole('switch', { name: 'Repeat Emergency Fund next month' });
    await repeat.click();
    await expect(repeat).not.toBeChecked();
    await expect.poll(() => mock.requests.filter(r => r.method === 'PUT').map(r => r.body)).toContainEqual({ recurring: false });

    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByTestId('distribution-bar')).toBeVisible();
    const table = page.getByTestId('distribution-table');
    await expect(table.getByRole('row', { name: /Fixed Expenses/ })).toContainText('₹3,500');
    await expect(table.getByRole('row', { name: /Unallocated/ })).toContainText('₹9,499.50');
    await expect(table.getByRole('row', { name: /Total planned/ })).toContainText('37%');
    await expect(page.getByTestId('ranked-allocations')).toBeVisible();

    await page.getByRole('tab', { name: 'Budget' }).click();
    await page.getByRole('button', { name: 'Delete Rent / Accommodation' }).click();
    await expect(page.getByText('is removed from this month only')).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('group-FIXED').getByTestId('allocation-card')).toHaveCount(0);
    await expect(page.getByTestId('allocation-summary')).toContainText('₹12,999.50');
  });

  test('month selector loads other months; a past month is not set up without asking', async ({ page }) => {
    const mock = await setupPlannerMock(page);
    await page.goto('/#/planner');
    await expect(page.getByText('Start with your salary')).toBeVisible();

    await page.getByRole('button', { name: 'Next month' }).click();
    const next = shift(thisMonth, 1);
    await expect(page.getByTestId('planner-month')).toHaveValue(monthInput(next));
    await expect.poll(() => mock.requests.some(r => r.method === 'POST' && r.path === '/budgets' && r.body.month === next.month && r.body.year === next.year)).toBe(true);

    const past = shift(thisMonth, -3);
    await page.getByTestId('planner-month').fill(monthInput(past));
    await expect(page.getByText(/No plan for/)).toBeVisible();
    expect(mock.requests.some(r => r.method === 'POST' && r.path === '/budgets' && r.body.month === past.month && r.body.year === past.year)).toBe(false);
    expect(mock.requests.some(r => r.path === '/overview' && Number(r.query.month) === past.month)).toBe(true);

    await page.getByRole('button', { name: 'Start plan for this month' }).click();
    await expect(page.getByText('Start with your salary')).toBeVisible();
  });

  test('shows a loading state, then recovers from an API error with Try again', async ({ page }) => {
    const mock = await setupPlannerMock(page, { failOverview: true, overviewDelayMs: 400 });
    await page.goto('/#/planner');
    await expect(page.getByLabel('Loading planner')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Could not load');
    mock.failOverview = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Start with your salary')).toBeVisible();
  });

  for (const vp of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
    test(`has no horizontal overflow at ${vp.width}px`, async ({ page }) => {
      await page.setViewportSize(vp);
      await setupPlannerMock(page);
      await page.goto('/#/planner');
      await addSalarySource(page);
      await page.getByRole('tab', { name: 'Budget' }).click();
      await page.getByRole('button', { name: 'Add first allocation' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Mess / Food' }).click();
      await page.getByRole('dialog').getByLabel('Planned amount (₹)').fill('2500');
      await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
      for (const tab of ['Budget', 'Overview', 'Salary']) {
        await page.getByRole('tab', { name: tab }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      }
    });
  }
});
