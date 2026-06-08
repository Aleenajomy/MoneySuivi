# MoneySuivi(All-in-One Finance Ecosystem)

A full-stack finance ecosystem PWA built with React + Vite, Node.js + Express, PostgreSQL, and Prisma.

Live: [smartexpencetracker-frontend.onrender.com](https://smartexpencetracker-frontend.onrender.com)

---

## Features

- **Dashboard** — Total balance, income vs expense summary, recent transactions
- **Transactions** — Add, edit, delete income & expense entries with categories, payment method, date
- **Recurring Expenses** — Auto-create weekly/monthly expenses via cron job (rent, subscriptions)
- **History** — Filter & search transactions by category, date range, keyword
- **Analytics** — Monthly trend chart, category-wise spending breakdown
- **Budget Manager** — Set monthly spending limits per category with alert notifications
- **EMI Tracker** — Track loan repayments with installment progress, overdue detection, edit & pay
- **Net Worth** — Track assets and liabilities, view net worth summary
- **Notifications** — Budget breach alerts with read/unread management
- **Export** — Download transaction history as CSV or PDF
- **Auth** — JWT-based register/login with profile management
- **Dark Mode** — Full dark/light theme support
- **PWA** — Installable on Android/iOS, works offline

---

## Project Structure

```
MyExpences/
├── backend/                        # Node.js + Express API
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── budgetController.js
│   │   ├── emiController.js
│   │   ├── expenseController.js
│   │   ├── exportController.js
│   │   ├── netWorthController.js
│   │   └── notificationController.js
│   ├── lib/
│   │   └── prisma.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── validate.js
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── routes/
│   │   ├── auth.js
│   │   ├── budgets.js
│   │   ├── emis.js
│   │   ├── expenses.js
│   │   ├── export.js
│   │   ├── networth.js
│   │   └── notifications.js
│   ├── services/
│   │   ├── budgetAlertService.js
│   │   └── cronJob.js
│   ├── .env
│   ├── package.json
│   └── server.js
│
└── frontend/                       # React PWA
    ├── public/
    │   ├── icon-192x192.png
    │   └── icon-512x512.png
    ├── src/
    │   ├── components/
    │   │   ├── ExpenseCard.jsx
    │   │   ├── Layout.jsx
    │   │   └── Skeleton.jsx
    │   ├── context/
    │   │   ├── AuthContext.jsx
    │   │   ├── BudgetContext.jsx
    │   │   ├── EMIContext.jsx
    │   │   ├── ExpenseContext.jsx
    │   │   ├── NetWorthContext.jsx
    │   │   ├── NotificationContext.jsx
    │   │   └── ThemeContext.jsx
    │   ├── pages/
    │   │   ├── auth/
    │   │   │   ├── Login.jsx
    │   │   │   └── Register.jsx
    │   │   ├── AddExpense.jsx
    │   │   ├── Analytics.jsx
    │   │   ├── Budgets.jsx
    │   │   ├── Dashboard.jsx
    │   │   ├── EMITracker.jsx
    │   │   ├── History.jsx
    │   │   ├── NetWorth.jsx
    │   │   ├── Notifications.jsx
    │   │   └── Profile.jsx
    │   ├── services/
    │   │   └── api.js
    │   ├── utils/
    │   │   └── constants.js
    │   ├── App.jsx
    │   ├── index.css
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── package.json
```

---

## Database Models

| Model | Description |
|---|---|
| User | Auth, profile, currency, budget limit |
| Expense | Transactions (income/expense), recurring support |
| Budget | Monthly category spending limits |
| EMI | Loan installment tracking with progress |
| Asset | Assets for net worth calculation |
| Liability | Liabilities for net worth calculation |
| Notification | Budget alert notifications |

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get profile |
| PUT | `/api/auth/profile` | Update profile |
| GET/POST | `/api/expenses` | List / add transaction |
| GET/PUT/DELETE | `/api/expenses/:id` | Get / edit / delete |
| GET | `/api/expenses/analytics` | Analytics data |
| GET/POST | `/api/budgets` | List / create budget |
| PUT/DELETE | `/api/budgets/:id` | Edit / delete budget |
| GET/POST | `/api/emis` | List / create EMI |
| PUT | `/api/emis/:id` | Edit EMI |
| PATCH | `/api/emis/:id/pay` | Mark installment paid |
| DELETE | `/api/emis/:id` | Delete EMI |
| GET/POST | `/api/networth/assets` | List / add asset |
| GET/POST | `/api/networth/liabilities` | List / add liability |
| GET | `/api/networth/summary` | Net worth summary |
| GET | `/api/notifications` | List notifications |
| PUT | `/api/notifications/read-all` | Mark all read |
| GET | `/api/export/csv` | Export CSV |
| GET | `/api/export/pdf` | Export PDF |

---

## Setup Instructions

### 1. Backend

```bash
cd backend
npm install
npx prisma generate
```

Edit `.env`:
```env
PORT=5000
DATABASE_URL="postgresql://postgres:<password>@localhost:5432/smart_expense_tracker?schema=public"
JWT_SECRET=your_super_secret_key
JWT_EXPIRE=7d
NODE_ENV=development
```

```bash
npm run prisma:migrate
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: **http://localhost:3000**

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Build for Production (PWA)

```bash
cd frontend
npm run build
```

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, React Router v6, Axios
- **PWA**: vite-plugin-pwa, Web App Manifest, Service Worker
- **Backend**: Node.js, Express.js, JWT, bcryptjs, node-cron
- **Database**: PostgreSQL, Prisma ORM
- **Deployment**: Render (backend + frontend)
