// Helper to mock all backend API routes for full UI & functional testing
export const mockUser = {
  id: 'usr_test_123',
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  currency: 'INR',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const mockExpenses = [
  {
    id: 'exp_1',
    title: 'Grocery Shopping',
    amount: 2450,
    category: 'Food',
    type: 'expense',
    accountType: 'UPI',
    paymentMethod: 'UPI',
    note: 'Weekly provisions',
    expenseDate: new Date().toISOString(),
  },
  {
    id: 'exp_2',
    title: 'Monthly Salary',
    amount: 75000,
    category: 'Salary',
    type: 'income',
    accountType: 'Bank',
    paymentMethod: 'Bank',
    note: 'Tech Corp monthly payout',
    expenseDate: new Date().toISOString(),
  },
  {
    id: 'exp_3',
    title: 'Electricity Bill',
    amount: 1800,
    category: 'Bills',
    type: 'expense',
    accountType: 'Bank',
    paymentMethod: 'Bank',
    note: 'Home power bill',
    expenseDate: new Date().toISOString(),
  },
];

export const mockAnalytics = {
  totalIncome: 75000,
  totalExpense: 4250,
  balance: 70750,
  totalBalance: 70750,
  savingsRate: 94,
  cashBalance: 5000,
  upiBalance: 15750,
  bankBalance: 50000,
  creditCardBalance: 0,
  debitCardBalance: 0,
  netBankingBalance: 0,
  categoryBreakdown: [
    { category: 'Food', amount: 2450 },
    { category: 'Bills', amount: 1800 },
  ],
};

export const mockBudgets = [
  {
    id: 'b_1',
    category: 'Food',
    monthlyLimit: 10000,
    spent: 2450,
    remaining: 7550,
    percentage: 25,
  },
  {
    id: 'b_2',
    category: 'Bills',
    monthlyLimit: 5000,
    spent: 1800,
    remaining: 3200,
    percentage: 36,
  },
];

export const mockEmis = [
  {
    id: 'emi_1',
    title: 'Home Loan',
    bank: 'HDFC',
    totalAmount: 2500000,
    emiAmount: 22000,
    totalInstallments: 240,
    paidInstallments: 36,
    interestRate: 8.5,
    startDate: '2023-01-01',
    note: 'HDFC Bank',
    category: 'Mortgage',
    active: true,
  },
];

export const mockNetWorth = {
  totalAssets: 3500000,
  totalLiabilities: 2100000,
  netWorth: 1400000,
  cashBalance: 5000,
  bankBalance: 50000,
  investmentBalance: 945000,
  outstandingLoans: 2100000,
  outstandingEMIs: 2100000,
  assets: [
    { id: 'ast_1', name: 'Mutual Funds', value: 945000, type: 'Investment' },
    { id: 'ast_2', name: 'Gold Reserve', value: 500000, type: 'Asset' },
  ],
  liabilities: [
    { id: 'lib_1', name: 'Home Loan Balance', value: 2100000, type: 'Loan' },
  ],
};

export const mockLedgerContacts = [
  {
    id: 'c_1',
    name: 'Rahul Sharma',
    phone: '9876543210',
    balance: 5000,
    entryCount: 1,
    notes: 'Personal loan for weekend trip',
  },
];

export const mockLedgerSummary = {
  totalLentOut: 5000,
  totalBorrowed: 0,
  netBalance: 5000,
};

export const mockNotifications = [
  {
    id: 'notif_1',
    title: 'Salary Credited',
    message: 'Monthly salary of INR 75,000 received',
    read: false,
    createdAt: new Date().toISOString(),
  },
];

/**
 * Attaches handlers for all API routes called by the frontend.
 */
export async function setupApiMocks(page, options = {}) {
  const { loggedIn = false } = options;
  let userLoggedIn = loggedIn;

  if (loggedIn) {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'mock_jwt_token_for_playwright_tests');
    });
  }

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const authHeader = route.request().headers()['authorization'];

    // 1. Auth routes
    if (url.includes('/api/auth/me')) {
      if (userLoggedIn || (authHeader && authHeader.includes('Bearer'))) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: mockUser }),
        });
      }
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized' }),
      });
    }

    if (url.includes('/api/auth/login')) {
      userLoggedIn = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock_jwt_token_for_playwright_tests',
          user: mockUser,
        }),
      });
    }

    if (url.includes('/api/auth/register')) {
      userLoggedIn = true;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock_jwt_token_for_playwright_tests',
          user: mockUser,
        }),
      });
    }

    // 2. Expenses & Analytics
    if (url.includes('/api/expenses/analytics')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ analytics: mockAnalytics }),
      });
    }

    if (url.includes('/api/expenses')) {
      if (method === 'POST') {
        const postData = route.request().postDataJSON() || {};
        const newExpense = {
          id: `exp_${Date.now()}`,
          ...postData,
          expenseDate: postData.expenseDate || new Date().toISOString(),
        };
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Expense added successfully',
            expense: newExpense,
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          expenses: mockExpenses,
          currentPage: 1,
          totalPages: 1,
          totalCount: mockExpenses.length,
        }),
      });
    }

    // 3. Budgets
    if (url.includes('/api/budgets')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ budgets: mockBudgets }),
      });
    }

    // 4. EMIs / Loans
    if (url.includes('/api/emis')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ emis: mockEmis }),
      });
    }

    // 5. Net Worth
    if (url.includes('/api/networth/summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockNetWorth),
      });
    }

    // 6. Ledger
    if (url.includes('/api/ledger/contacts')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ contacts: mockLedgerContacts }),
      });
    }

    if (url.includes('/api/ledger/summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLedgerSummary),
      });
    }

    // 7. Notifications
    if (url.includes('/api/notifications/fcm-token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'FCM token registered successfully',
        }),
      });
    }

    if (url.includes('/api/notifications')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: mockNotifications,
          unreadCount: 1,
        }),
      });
    }

    // Fallback for any other API calls
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
}
