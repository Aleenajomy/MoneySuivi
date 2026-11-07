// In-memory stand-in for /api/planner/salary-plan* so the screen can be exercised end to end. The
// maths mirrors the backend in paise. Every other planner call, and every write to transactions,
// EMIs or Lend/Borrow made while the planner is open, is recorded so tests can assert there are none.
const FIELDS = ['salaryAmount', 'allowanceAmount', 'rentAmount', 'emiAmount', 'emergencySavingsAmount', 'generalSavingsAmount', 'shoppingAmount', 'travelAmount', 'foodAmount'];
const paise = (v) => Math.round(Number(v) * 100);
const rupees = (p) => p / 100;
const percent = (part, whole) => (whole > 0 ? Math.round((part * 100) / whole) : null);

export const DEFAULT_PLAN = {
  salaryAmount: 15000, allowanceAmount: 2560, rentAmount: 2500, emiAmount: 4100,
  emergencySavingsAmount: 2000, generalSavingsAmount: 2000, shoppingAmount: 1500, travelAmount: 1000, foodAmount: 1000,
};

const summarize = (plan) => {
  const v = Object.fromEntries(FIELDS.map(f => [f, paise(plan[f])]));
  const fixed = v.rentAmount + v.emiAmount;
  const savings = v.emergencySavingsAmount + v.generalSavingsAmount;
  const spending = v.shoppingAmount + v.travelAmount + v.foodAmount;
  const afterFixed = v.salaryAmount - fixed;
  const extra = afterFixed - savings - spending;
  const remaining = Math.max(extra, 0);
  const part = (amount) => ({ amount: rupees(amount), percent: percent(amount, v.salaryAmount) });
  return {
    salary: rupees(v.salaryAmount), allowance: rupees(v.allowanceAmount), incomeWithAllowance: rupees(v.salaryAmount + v.allowanceAmount),
    fixedExpenses: rupees(fixed), afterFixed: rupees(afterFixed), allocated: rupees(savings + spending),
    extraBalance: rupees(remaining), overBudget: rupees(Math.max(-extra, 0)), plannedSavings: rupees(savings), spending: rupees(spending),
    plannedExpenses: rupees(fixed + spending), moneyRemaining: rupees(remaining),
    breakdown: { fixed: part(fixed), spending: part(spending), savings: part(savings), remaining: part(remaining) },
  };
};

export async function setupPlannerMock(page, options = {}) {
  const state = {
    plans: {},
    emiTrackerTotal: options.emiTrackerTotal ?? 4100,
    requests: [],
    otherPlannerCalls: [],
    moneyWrites: [],
    failLoad: Boolean(options.failLoad),
    loadDelayMs: options.loadDelayMs || 0,
  };
  const key = ({ year, month }) => `${year}-${month}`;
  const latestEarlier = (period) => Object.entries(state.plans)
    .map(([k, plan]) => { const [y, m] = k.split('-').map(Number); return { y, m, plan }; })
    .filter(({ y, m }) => y * 12 + m < period.year * 12 + period.month)
    .sort((a, b) => (b.y * 12 + b.m) - (a.y * 12 + a.m))[0]?.plan;
  const body = (period) => {
    const plan = state.plans[key(period)] || null;
    return { success: true, ...period, plan, summary: plan && summarize(plan), emiTrackerTotal: state.emiTrackerTotal };
  };
  const json = (route, status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

  page.on('request', (req) => {
    const url = new URL(req.url());
    if (req.method() !== 'GET' && /\/api\/(expenses|emis|ledger|networth)/.test(url.pathname)) state.moneyWrites.push(`${req.method()} ${url.pathname}`);
  });

  await page.route('**/api/planner/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/planner/, '');
    const method = req.method();
    const data = req.postDataJSON?.() || {};
    const period = { year: Number(url.searchParams.get('year') || data.year), month: Number(url.searchParams.get('month') || data.month) };
    state.requests.push({ method, path, body: data });

    if (path === '/salary-plan' && method === 'GET') {
      if (state.loadDelayMs) await new Promise(r => setTimeout(r, state.loadDelayMs));
      if (state.failLoad) return json(route, 500, { success: false, message: 'Something went wrong. Please try again.' });
      return json(route, 200, body(period));
    }
    if (path === '/salary-plan/init' && method === 'POST') {
      if (state.loadDelayMs) await new Promise(r => setTimeout(r, state.loadDelayMs));
      if (state.failLoad) return json(route, 500, { success: false, message: 'Something went wrong. Please try again.' });
      const created = !state.plans[key(period)];
      if (created) state.plans[key(period)] = { ...(latestEarlier(period) || { ...DEFAULT_PLAN, emiAmount: state.emiTrackerTotal }) };
      return json(route, created ? 201 : 200, { ...body(period), created });
    }
    if (path === '/salary-plan' && method === 'PUT') {
      const plan = state.plans[key(period)] || (state.plans[key(period)] = { ...DEFAULT_PLAN });
      for (const f of FIELDS) {
        if (data[f] === undefined) continue;
        if (!/^\d+(\.\d{1,2})?$/.test(String(data[f]))) return json(route, 400, { success: false, message: `${f} is invalid` });
        plan[f] = Number(data[f]);
      }
      return json(route, 200, body(period));
    }
    if (path === '/salary-plan/reset' && method === 'POST') {
      state.plans[key(period)] = { ...DEFAULT_PLAN, emiAmount: state.emiTrackerTotal };
      return json(route, 200, body(period));
    }
    state.otherPlannerCalls.push(`${method} ${path}`);
    return json(route, 404, { success: false, message: 'Route not found' });
  });

  return state;
}
