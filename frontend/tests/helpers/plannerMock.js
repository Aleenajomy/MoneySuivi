// In-memory stand-in for /api/planner/* so the UI can be exercised end to end. Totals are kept in
// paise like the real backend; it is registered after setupApiMocks so it takes precedence.
// `transactionsCreated` counts every call that would add a real transaction, so tests can assert
// that planning actions never do.
const paise = (v) => Math.round(Number(v) * 100);
const rupees = (p) => p / 100;
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

const DEFAULT_LINES = [
  { group: 'FIXED', name: 'Rent', plannedAmount: 2500, matchCategories: [] },
  { group: 'FIXED', name: 'EMI', plannedAmount: 0, matchCategories: ['EMI'] },
  { group: 'FIXED', name: 'Mess / Food', plannedAmount: 0, matchCategories: ['Food'] },
  { group: 'VARIABLE', name: 'Travel', plannedAmount: 0, matchCategories: ['Travel'] },
  { group: 'VARIABLE', name: 'Other Personal', plannedAmount: 0, matchCategories: ['Shopping', 'Entertainment', 'Healthcare', 'Other'] },
];

export async function setupPlannerMock(page, options = {}) {
  const state = {
    sources: [],
    salaries: [],
    plans: {},
    candidates: options.candidates || [],
    duplicates: options.duplicates || null,
    // Spending already in History: { id, title, category, amount, date, line? }.
    spending: options.spending || [],
    emiPayments: options.emiPayments || [],
    emiCandidates: options.emiCandidates || [],
    otherIncome: options.otherIncome || 0,
    requests: [],
    transactionsCreated: 0,
    failOverview: Boolean(options.failOverview),
    overviewDelayMs: options.overviewDelayMs || 0,
  };

  const key = (y, m) => `${y}-${m}`;
  const addLines = (plan, lines) => lines.forEach((a) => {
    plan.allocations.push({ id: uuid(), planId: plan.id, recurring: true, matchCategories: [], sortOrder: plan.allocations.length, ...a, plannedAmount: Number(a.plannedAmount) });
  });
  if (options.plan) {
    const { year, month, allocations } = options.plan;
    const plan = { id: uuid(), savingsPercent: 20, allocations: [] };
    addLines(plan, allocations);
    state.plans[key(year, month)] = plan;
  }
  const salariesFor = (y, m) => state.salaries.filter(s => s.year === y && s.month === m);

  const monthBody = (year, month) => {
    const plan = state.plans[key(year, month)] || null;
    const salaries = salariesFor(year, month);
    const allocations = plan ? plan.allocations : [];
    const lineFor = (s) => allocations.find(a => a.name === s.line)?.id || null;
    const linkedExpenseIds = new Set(state.emiPayments.filter(p => p.linkedId).map(p => p.linkedId));
    const counted = state.spending.filter(s => !linkedExpenseIds.has(s.id));
    const spentOn = (id) => counted.filter(s => lineFor(s) === id);
    const planned = allocations.filter(a => ['FIXED', 'VARIABLE'].includes(a.group)).reduce((t, a) => t + paise(a.plannedAmount), 0);
    const byGroup = { FIXED: 0, VARIABLE: 0, SAVINGS: 0, INVESTMENT: 0 };
    allocations.forEach(a => { byGroup[a.group] += paise(a.plannedAmount); });
    const expected = salaries.reduce((s, r) => s + paise(r.expectedAmount), 0);
    const received = salaries.reduce((s, r) => s + paise(r.receivedAmount), 0) + paise(state.otherIncome);
    const emiPaid = state.emiPayments.reduce((t, p) => t + paise(p.amount), 0);
    const actual = counted.reduce((t, s) => t + paise(s.amount), 0) + emiPaid;
    const percent = plan?.savingsPercent ?? 20;
    const share = (p) => (p > 0 ? Math.floor((p * percent) / 100) : 0);
    return {
      success: true,
      year,
      month,
      plan: plan && {
        id: plan.id, year, month, note: null, savingsPercent: plan.savingsPercent,
        allocations: allocations.map((a) => {
          const spent = spentOn(a.id).reduce((t, s) => t + paise(s.amount), 0) + (a.matchCategories.includes('EMI') ? emiPaid : 0);
          return { ...a, transactionCount: spentOn(a.id).length, actualAmount: rupees(spent), remainingAmount: rupees(paise(a.plannedAmount) - spent), utilization: null };
        }),
      },
      salaries,
      summary: {
        income: {
          expected: rupees(expected), received: rupees(received), pending: rupees(Math.max(expected - received, 0)),
          receivedCount: salaries.filter(s => s.status !== 'PENDING').length, count: salaries.length,
        },
        plan: {
          byGroup: Object.fromEntries(Object.entries(byGroup).map(([g, v]) => [g, rupees(v)])),
          plannedExpenses: rupees(planned),
        },
        unplanned: Object.entries(counted.filter(s => !lineFor(s)).reduce((acc, s) => ({ ...acc, [s.category]: (acc[s.category] || 0) + paise(s.amount) }), {}))
          .map(([category, p]) => ({ category, amount: rupees(p) })),
      },
      position: {
        expectedIncome: rupees(expected),
        receivedIncome: rupees(received),
        plannedExpenses: rupees(planned),
        actualExpenses: rupees(actual),
        investedNet: 0,
        plannedRemaining: rupees(expected - planned),
        actualRemaining: rupees(received - actual),
        suggestedSavings: rupees(share(expected - planned)),
        actualSavingsPotential: rupees(share(received - actual)),
        savingsPercent: percent,
      },
      emi: {
        payments: state.emiPayments.map(p => ({
          id: p.id, emiId: 'emi-1', title: p.title, amount: p.amount, paidAt: p.paidAt,
          linkedTransaction: p.linkedId ? state.emiCandidates.find(c => c.id === p.linkedId) : null,
          possibleDuplicates: p.linkedId ? [] : state.emiCandidates.filter(c => c.sameAmount && c.daysApart <= 3),
        })),
        paid: rupees(emiPaid),
        possibleDoubleCounts: state.emiPayments.filter(p => !p.linkedId && state.emiCandidates.some(c => c.sameAmount && c.daysApart <= 3)).length,
      },
      spending: [],
    };
  };

  const initSalaries = (year, month) => {
    state.sources.filter(s => s.active).forEach((src) => {
      if (!state.salaries.some(r => r.incomeSourceId === src.id && r.year === year && r.month === month)) {
        state.salaries.push({
          id: uuid(), incomeSourceId: src.id, label: src.name, kind: src.kind, year, month, payDay: src.payDay,
          expectedAmount: src.expectedAmount, receivedAmount: 0, status: 'PENDING', receivedAt: null, receivedVia: null, expenseId: null, transaction: null,
        });
      }
    });
  };

  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const findAllocation = (id) => {
    for (const [k, plan] of Object.entries(state.plans)) {
      const a = plan.allocations.find(x => x.id === id);
      if (a) return { plan, a, year: Number(k.split('-')[0]), month: Number(k.split('-')[1]) };
    }
    return null;
  };
  const findPlan = (id) => {
    const entry = Object.entries(state.plans).find(([, p]) => p.id === id);
    const [y, mo] = entry[0].split('-').map(Number);
    return { plan: entry[1], year: y, month: mo };
  };

  await page.route('**/api/planner/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/planner/, '');
    const method = req.method();
    const body = req.postDataJSON?.() || {};
    const year = Number(url.searchParams.get('year') || body.year);
    const month = Number(url.searchParams.get('month') || body.month);
    state.requests.push({ method, path, query: Object.fromEntries(url.searchParams), body });

    if (method === 'GET' && path === '/overview') {
      if (state.overviewDelayMs) await new Promise(r => setTimeout(r, state.overviewDelayMs));
      if (state.failOverview) return json(route, 500, { success: false, message: 'Something went wrong. Please try again.' });
      return json(route, 200, monthBody(year, month));
    }
    if (method === 'POST' && path === '/budgets') {
      const k = key(year, month);
      const created = !state.plans[k];
      if (created) {
        state.plans[k] = { id: uuid(), savingsPercent: 20, allocations: [] };
        if (body.defaults) addLines(state.plans[k], DEFAULT_LINES);
      }
      initSalaries(year, month);
      return json(route, created ? 201 : 200, { ...monthBody(year, month), initialized: { created } });
    }
    if (method === 'GET' && path === '/income-sources') return json(route, 200, { success: true, incomeSources: state.sources });
    if (method === 'POST' && path === '/income-sources') {
      const src = { id: uuid(), active: true, ...body, expectedAmount: Number(body.expectedAmount) };
      state.sources.push(src);
      return json(route, 201, { success: true, incomeSource: src });
    }
    if (method === 'POST' && path === '/salaries/initialize') {
      initSalaries(year, month);
      return json(route, 200, { success: true });
    }
    if (method === 'GET' && path === '/salaries/history') return json(route, 200, { success: true, history: [] });
    let m = /^\/salaries\/([^/]+)\/candidates$/.exec(path);
    if (method === 'GET' && m) return json(route, 200, { success: true, candidates: state.candidates });
    m = /^\/salaries\/([^/]+)\/receive$/.exec(path);
    if (method === 'POST' && m) {
      const rec = state.salaries.find(s => s.id === m[1]);
      if (rec.status !== 'PENDING') return json(route, 409, { success: false, code: 'ALREADY_RECEIVED', message: 'This income is already marked as received.' });
      if (!['link', 'alreadyInBalance', 'create'].includes(body.mode)) return json(route, 400, { success: false, message: 'mode is required' });
      if (body.mode === 'create' && !body.paymentMethod) return json(route, 400, { success: false, message: 'Choose the account the money arrived in' });
      if (body.mode === 'create' && state.duplicates && !body.confirmDuplicate) {
        return json(route, 409, { success: false, code: 'POSSIBLE_DUPLICATE', message: 'An income transaction that may be this salary is already in History.', candidates: state.duplicates });
      }
      const linked = body.mode === 'link' ? [...state.candidates, ...(state.duplicates || [])].find(c => c.id === body.expenseId) : null;
      const amount = linked ? linked.amount : Number(body.receivedAmount);
      if (body.mode === 'create') state.transactionsCreated += 1;
      Object.assign(rec, {
        receivedAmount: amount,
        receivedAt: linked ? linked.expenseDate : `${body.receivedAt}T00:00:00.000Z`,
        receivedVia: body.mode === 'alreadyInBalance' ? 'ALREADY_IN_BALANCE' : 'TRANSACTION',
        expenseId: body.mode === 'alreadyInBalance' ? null : (linked ? linked.id : uuid()),
        transaction: body.mode === 'create' ? { paymentMethod: body.paymentMethod } : linked ? { paymentMethod: linked.paymentMethod } : null,
        status: paise(amount) < paise(rec.expectedAmount) ? 'PARTIAL' : 'RECEIVED',
      });
      if (linked) state.candidates = state.candidates.filter(c => c.id !== linked.id);
      return json(route, 200, { success: true, salary: rec });
    }
    m = /^\/budgets\/([^/]+)\/default-lines$/.exec(path);
    if (method === 'POST' && m) {
      const { plan, year: y, month: mo } = findPlan(m[1]);
      const missing = DEFAULT_LINES.filter(d => !plan.allocations.some(a => a.name === d.name));
      addLines(plan, missing);
      return json(route, 200, { ...monthBody(y, mo), added: missing.length });
    }
    m = /^\/budgets\/([^/]+)\/allocations$/.exec(path);
    if (method === 'POST' && m) {
      const { plan, year: y, month: mo } = findPlan(m[1]);
      if (plan.allocations.some(a => a.name === body.name)) return json(route, 409, { success: false, message: 'This month already has an allocation with that name.' });
      addLines(plan, [body]);
      return json(route, 201, monthBody(y, mo));
    }
    m = /^\/budgets\/allocations\/([^/]+)\/record$/.exec(path);
    if (method === 'POST' && m) {
      const found = findAllocation(m[1]);
      if (!body.paymentMethod) return json(route, 400, { success: false, message: 'Choose the account you paid from' });
      state.transactionsCreated += 1;
      state.spending.push({ id: uuid(), title: found.a.name, category: found.a.matchCategories[0] || 'Other', amount: Number(body.amount), date: body.date, line: found.a.name });
      return json(route, 201, { ...monthBody(found.year, found.month), repeated: false });
    }
    m = /^\/budgets\/allocations\/([^/]+)$/.exec(path);
    if (m) {
      const found = findAllocation(m[1]);
      if (method === 'DELETE') found.plan.allocations = found.plan.allocations.filter(a => a.id !== m[1]);
      else Object.assign(found.a, body, body.plannedAmount !== undefined ? { plannedAmount: Number(body.plannedAmount) } : {});
      return json(route, 200, monthBody(found.year, found.month));
    }
    m = /^\/budgets\/([^/]+)$/.exec(path);
    if (method === 'PUT' && m) {
      const { plan, year: y, month: mo } = findPlan(m[1]);
      if (body.savingsPercent !== undefined) plan.savingsPercent = body.savingsPercent;
      return json(route, 200, monthBody(y, mo));
    }
    m = /^\/emi-payments\/([^/]+)\/candidates$/.exec(path);
    if (method === 'GET' && m) return json(route, 200, { success: true, candidates: state.emiCandidates });
    m = /^\/emi-payments\/([^/]+)\/link$/.exec(path);
    if (m) {
      const payment = state.emiPayments.find(p => p.id === m[1]);
      payment.linkedId = method === 'DELETE' ? null : body.expenseId;
      const d = new Date(payment.paidAt);
      return json(route, 200, monthBody(d.getUTCFullYear(), d.getUTCMonth() + 1));
    }
    return json(route, 404, { success: false, message: 'Route not found' });
  });

  return state;
}
