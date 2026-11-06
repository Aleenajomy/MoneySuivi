// In-memory stand-in for /api/planner/* so the UI can be exercised end to end. Totals are
// kept in paise like the real backend; it is registered after setupApiMocks so it takes precedence.
const GROUPS = ['FIXED', 'VARIABLE', 'SAVINGS', 'INVESTMENT'];
const paise = (v) => Math.round(Number(v) * 100);
const rupees = (p) => p / 100;
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export async function setupPlannerMock(page, options = {}) {
  const state = {
    sources: [],
    salaries: [],
    plans: {},
    candidates: options.candidates || [],
    // Spending items: { id, title, category, amount, date, source?, autoLine?, autoBy?, pinned? }.
    spending: (options.spending || []).map(s => ({ source: 'TRANSACTION', ...s })),
    goals: [],
    contributions: [],
    investments: [],
    investmentTxs: [],
    requests: [],
    failOverview: Boolean(options.failOverview),
    overviewDelayMs: options.overviewDelayMs || 0,
  };

  const key = (y, m) => `${y}-${m}`;
  if (options.plan) {
    const { year, month, allocations } = options.plan;
    const id = uuid();
    state.plans[key(year, month)] = {
      id,
      allocations: allocations.map((a, i) => ({ id: uuid(), planId: id, recurring: true, matchCategories: [], sortOrder: i, ...a })),
    };
  }
  const salariesFor = (y, m) => state.salaries.filter(s => s.year === y && s.month === m);

  const monthBody = (year, month) => {
    const plan = state.plans[key(year, month)] || null;
    const salaries = salariesFor(year, month);
    const allocations = plan ? plan.allocations : [];
    const spending = state.spending.map((s) => {
      const auto = allocations.find(a => a.name === s.autoLine);
      const allocationId = s.pinned || auto?.id || null;
      return {
        id: s.id, source: s.source, title: s.title, category: s.category, amount: s.amount, date: s.date, paymentMethod: s.paymentMethod || null,
        allocationId, matchedBy: s.pinned ? 'ASSIGNED' : allocationId ? (s.autoBy || 'CATEGORY') : 'UNPLANNED', reassignable: s.source !== 'EMI',
      };
    });
    const spentOn = (id) => spending.filter(s => s.allocationId === id);
    const byGroup = Object.fromEntries(GROUPS.map(g => [g, 0]));
    allocations.forEach(a => { byGroup[a.group] += paise(a.plannedAmount); });
    const expected = salaries.reduce((s, r) => s + paise(r.expectedAmount), 0);
    const expectedSalary = salaries.filter(r => r.kind === 'SALARY').reduce((s, r) => s + paise(r.expectedAmount), 0);
    const received = salaries.reduce((s, r) => s + paise(r.receivedAmount), 0);
    const total = Object.values(byGroup).reduce((s, v) => s + v, 0);
    return {
      success: true,
      year,
      month,
      plan: plan && {
        id: plan.id, year, month, note: null,
        allocations: allocations.map((a) => {
          const tracked = ['FIXED', 'VARIABLE'].includes(a.group);
          const spent = spentOn(a.id).reduce((t, s) => t + paise(s.amount), 0);
          return {
            ...a,
            transactionCount: spentOn(a.id).length,
            actualAmount: tracked ? rupees(spent) : null,
            remainingAmount: tracked ? rupees(paise(a.plannedAmount) - spent) : null,
            utilization: tracked ? (paise(a.plannedAmount) > 0 ? Math.round((spent * 100) / paise(a.plannedAmount)) : null) : null,
          };
        }),
      },
      spending,
      salaries,
      summary: {
        income: {
          expected: rupees(expected), received: rupees(received), expectedSalary: rupees(expectedSalary),
          expectedAdditional: rupees(expected - expectedSalary), pending: rupees(Math.max(expected - received, 0)),
          receivedCount: salaries.filter(s => s.status !== 'PENDING').length, count: salaries.length,
        },
        plan: {
          byGroup: Object.fromEntries(Object.entries(byGroup).map(([g, v]) => [g, rupees(v)])),
          plannedExpenses: rupees(byGroup.FIXED + byGroup.VARIABLE), plannedSavings: rupees(byGroup.SAVINGS),
          plannedInvestments: rupees(byGroup.INVESTMENT), totalAllocated: rupees(total),
        },
        unallocated: rupees(expected - total),
        overAllocated: expected - total < 0,
        allocatedPercent: expected > 0 ? Math.round((total * 100) / expected) : null,
        actual: { income: rupees(received), expenses: 0, emi: 0, savingsNet: 0, investmentNet: 0, available: rupees(received) },
        unplanned: Object.entries(spending.filter(x => !x.allocationId).reduce((acc, x) => ({ ...acc, [x.category]: (acc[x.category] || 0) + paise(x.amount) }), {}))
          .map(([category, p]) => ({ category, amount: rupees(p) })),
      },
    };
  };

  const initSalaries = (year, month) => {
    state.sources.filter(s => s.active).forEach((src) => {
      if (!state.salaries.some(r => r.incomeSourceId === src.id && r.year === year && r.month === month)) {
        state.salaries.push({
          id: uuid(), incomeSourceId: src.id, label: src.name, kind: src.kind, year, month, payDay: src.payDay,
          expectedAmount: src.expectedAmount, receivedAmount: 0, status: 'PENDING', receivedAt: null, expenseId: null, transaction: null,
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
      if (state.failOverview) {
        return json(route, 500, { success: false, message: 'Something went wrong. Please try again.' });
      }
      return json(route, 200, monthBody(year, month));
    }
    if (method === 'POST' && path === '/budgets') {
      const k = key(year, month);
      const created = !state.plans[k];
      if (created) state.plans[k] = { id: uuid(), allocations: [] };
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
    let m = /^\/salaries\/([^/]+)\/candidates$/.exec(path);
    if (method === 'GET' && m) return json(route, 200, { success: true, candidates: state.candidates });
    m = /^\/salaries\/([^/]+)\/receive$/.exec(path);
    if (method === 'POST' && m) {
      const rec = state.salaries.find(s => s.id === m[1]);
      if (rec.status !== 'PENDING') return json(route, 409, { success: false, message: 'This income is already marked as received.' });
      const linked = body.mode === 'link' ? state.candidates.find(c => c.id === body.expenseId) : null;
      const amount = linked ? linked.amount : Number(body.receivedAmount);
      Object.assign(rec, {
        receivedAmount: amount,
        receivedAt: linked ? linked.expenseDate : `${body.receivedAt}T00:00:00.000Z`,
        expenseId: linked ? linked.id : uuid(),
        status: paise(amount) < paise(rec.expectedAmount) ? 'PARTIAL' : 'RECEIVED',
      });
      if (linked) state.candidates = state.candidates.filter(c => c.id !== linked.id);
      return json(route, 200, { success: true, salary: rec });
    }
    m = /^\/budgets\/([^/]+)\/allocations$/.exec(path);
    if (method === 'POST' && m) {
      const entry = Object.entries(state.plans).find(([, p]) => p.id === m[1]);
      const [k, plan] = entry;
      if (plan.allocations.some(a => a.name === body.name)) return json(route, 409, { success: false, message: 'This month already has an allocation with that name.' });
      plan.allocations.push({ id: uuid(), planId: plan.id, recurring: true, matchCategories: [], sortOrder: plan.allocations.length, ...body, plannedAmount: Number(body.plannedAmount) });
      const [y, mo] = k.split('-').map(Number);
      return json(route, 201, monthBody(y, mo));
    }
    m = /^\/budgets\/allocations\/([^/]+)$/.exec(path);
    if (m) {
      const found = findAllocation(m[1]);
      if (method === 'DELETE') found.plan.allocations = found.plan.allocations.filter(a => a.id !== m[1]);
      else Object.assign(found.a, body, body.plannedAmount !== undefined ? { plannedAmount: Number(body.plannedAmount) } : {});
      return json(route, 200, monthBody(found.year, found.month));
    }
    m = /^\/transactions\/([^/]+)\/assignment$/.exec(path);
    if (m) {
      const spend = state.spending.find(s => s.id === m[1]);
      spend.pinned = method === 'DELETE' ? undefined : body.allocationId;
      return json(route, 200, monthBody(Number(spend.date.slice(0, 4)), Number(spend.date.slice(5, 7))));
    }
    const goalBody = (g) => {
      const net = state.contributions.filter(c => c.goalId === g.id).reduce((t, c) => t + (c.type === 'WITHDRAWAL' ? -paise(c.amount) : paise(c.amount)), 0);
      const saved = paise(g.initialAmount || 0) + net;
      const target = paise(g.targetAmount);
      return {
        ...g, savedAmount: rupees(saved), remainingAmount: rupees(Math.max(target - saved, 0)), progress: Math.round((saved * 100) / target),
        reached: saved >= target, thisMonthAmount: rupees(net), requiredMonthly: null, monthsLeft: null, overdue: false,
      };
    };
    const investBody = () => {
      const plans = state.investments.map((p) => {
        const total = state.investmentTxs.filter(t => t.planId === p.id).reduce((t, x) => t + (x.type === 'REDEEM' ? -paise(x.amount) : paise(x.amount)), 0);
        return { ...p, investedTotal: rupees(total), thisMonthAmount: rupees(total), thisMonthProgress: paise(p.monthlyPlannedAmount) ? Math.round((total * 100) / paise(p.monthlyPlannedAmount)) : null, transactionCount: state.investmentTxs.filter(t => t.planId === p.id).length };
      });
      const planned = state.investments.filter(p => p.active).reduce((t, p) => t + paise(p.monthlyPlannedAmount), 0);
      const invested = plans.reduce((t, p) => t + paise(p.thisMonthAmount), 0);
      return { success: true, plans, summary: { plannedThisMonth: rupees(planned), investedThisMonth: rupees(invested), unlinkedThisMonth: 0, totalThisMonth: rupees(invested), totalInvested: rupees(invested), progress: null } };
    };
    if (path === '/goals' && method === 'GET') return json(route, 200, { success: true, goals: state.goals.map(goalBody) });
    if (path === '/goals' && method === 'POST') {
      const goal = { id: uuid(), archived: false, initialAmount: 0, monthlyContribution: null, targetDate: null, note: null, ...body };
      state.goals.push(goal);
      return json(route, 201, { success: true, goal: goalBody(goal) });
    }
    m = /^\/goals\/([^/]+)\/contributions$/.exec(path);
    if (m && method === 'POST') {
      const goal = goalBody(state.goals.find(g => g.id === m[1]));
      if (body.type === 'WITHDRAWAL' && paise(body.amount) > paise(goal.savedAmount)) {
        return json(route, 409, { success: false, message: 'That would take the goal below ₹0. Withdraw at most what is saved.', code: 'INSUFFICIENT_SAVED' });
      }
      state.contributions.push({ id: uuid(), goalId: m[1], ...body });
      return json(route, 201, { success: true, goal: goalBody(state.goals.find(g => g.id === m[1])) });
    }
    if (m && method === 'GET') return json(route, 200, { success: true, contributions: state.contributions.filter(c => c.goalId === m[1]) });
    if (path === '/investments' && method === 'GET') return json(route, 200, investBody());
    if (path === '/investments' && method === 'POST') {
      const plan = { id: uuid(), active: true, note: null, monthlyPlannedAmount: 0, ...body };
      state.investments.push(plan);
      return json(route, 201, { ...investBody(), investmentId: plan.id });
    }
    m = /^\/investments\/([^/]+)\/transactions$/.exec(path);
    if (m && method === 'POST') {
      state.investmentTxs.push({ id: uuid(), planId: m[1], ...body });
      return json(route, 201, investBody());
    }
    if (method === 'GET' && path === '/salaries/history') return json(route, 200, { success: true, history: [] });
    return json(route, 404, { success: false, message: 'Route not found' });
  });

  return state;
}
