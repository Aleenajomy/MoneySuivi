<div align="center">

<h1>
  <img src="https://img.shields.io/badge/💰-MoneySuivi-0EA5E9?style=for-the-badge&labelColor=0f172a&color=0EA5E9" alt="MoneySuivi" height="40"/>
</h1>

<p><strong>All-in-One Personal Finance Ecosystem</strong></p>

<p>
  <a href="https://smartexpencetracker-frontend.onrender.com" target="_blank">
    <img src="https://img.shields.io/badge/🌐 Live Demo-0EA5E9?style=for-the-badge&labelColor=0f172a" alt="Live Demo"/>
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white&labelColor=0f172a"/>
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white&labelColor=0f172a"/>
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=nodedotjs&logoColor=white&labelColor=0f172a"/>
  <img src="https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?style=flat-square&logo=postgresql&logoColor=white&labelColor=0f172a"/>
  <img src="https://img.shields.io/badge/PWA-Installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white&labelColor=0f172a"/>
</p>

<p>
  <img src="https://img.shields.io/badge/TailwindCSS-3-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white&labelColor=0f172a"/>
  <img src="https://img.shields.io/badge/JWT-Auth-000000?style=flat-square&logo=jsonwebtokens&logoColor=white&labelColor=0f172a"/>
  <img src="https://img.shields.io/badge/Recharts-2-FF6B6B?style=flat-square&labelColor=0f172a"/>
  <img src="https://img.shields.io/badge/Deployed-Render-46E3B7?style=flat-square&logo=render&logoColor=white&labelColor=0f172a"/>
</p>

</div>

---

## ✨ Overview

**MoneySuivi** (French: *money tracker*) is a full-stack progressive web application for complete personal finance management. Track every rupee — from daily expenses to long-term loans — with real-time analytics, smart budget alerts, and offline-ready PWA capabilities.

---

## 🚀 Features

### 💳 Transactions & History
- Add, edit, and delete **income & expense** entries
- Categorise by type: Food, Travel, Shopping, Bills, Entertainment, Salary, Healthcare, and more
- Multiple **payment methods**: Cash, UPI, Credit Card, Debit Card
- **Multi-account support**: Bank, Wallet, UPI, Credit Card
- Advanced **filter & search** by category, date range, and keyword
- Export full history as **CSV or PDF**

### 🔁 Recurring Expenses
- Schedule **weekly/monthly** recurring transactions (rent, subscriptions, EMIs)
- Automated creation via **node-cron** background job — no manual entry needed

### 📊 Analytics
- Interactive **monthly trend chart** (income vs. expenses)
- **Category-wise spending breakdown** with visual ring charts
- Powered by **Recharts** with smooth animations

### 🎯 Budget Manager
- Set **monthly spending limits** per category
- Real-time **usage tracking** with progress indicators
- Automatic **budget breach alerts** with severity levels (warning / critical)

### 🏦 EMI & Loan Tracker
- Track **Fixed EMI** loans with full amortisation schedule
  - `Total Payable = EMI × Months`
  - `Remaining Balance` derived from the amortisation schedule (not a simple subtraction)
  - Accurate per-installment `Principal Paid` and `Interest Paid` breakdown
- Track **Flexible loans** with dynamic repayment and monthly anniversary interest accrual
  - `Monthly Interest = Outstanding Principal × Annual Rate ÷ 12`
  - Interest locked to billing cycle date — stable, never drifts day to day
  - Repayments apply to accrued interest first, then reduce principal
- Overdue detection with visual alerts
- Full repayment log with initial payment surfacing

### 💰 Net Worth
- Track **Assets** (savings, property, investments) and **Liabilities** (loans, credit)
- Live **Net Worth summary**: `Assets − Liabilities`
- Historical asset/liability management

### 📒 Ledger (Borrow & Lend Tracker)
- Manage **contacts** who owe you money or you owe money to
- Log `LENT`, `BORROWED`, `REPAYMENT_RECEIVED`, and `REPAYMENT_MADE` entries
- Per-contact running **balance summary**

### 🔔 Notifications & Web Push
- In-app notifications for **budget breaches** and overdue EMIs
- **PWA Web Push** notifications delivered to your browser/device even when the app is closed
  - Daily spend summary pushed at 9 PM
  - Instant push on budget breach
- Read / unread management

### 🔐 Authentication
- Secure **JWT-based** register & login
- Field-level validation with targeted error messages (email not found vs. wrong password)
- **Forgot password** / reset flow
- Profile management with password change

### 🎨 UI / UX
- Premium **dark & light** theme with system preference detection
- Glassmorphism card design with micro-animations (Framer Motion)
- Fully **responsive** — mobile-first layout
- **Installable PWA** — works on Android, iOS, and desktop
- Offline support via service worker

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 5, React Router v6 |
| **Styling** | Tailwind CSS 3, Custom CSS, Framer Motion |
| **Charts** | Recharts 2 |
| **Icons** | Lucide React, React Icons |
| **HTTP Client** | Axios (with JWT interceptor) |
| **PWA** | vite-plugin-pwa, Web App Manifest, Service Worker |
| **Backend** | Node.js, Express.js |
| **Auth** | JSON Web Token (JWT), bcryptjs (salt rounds: 12) |
| **Database** | PostgreSQL (NeonDB) |
| **ORM** | Prisma 6 |
| **Background Jobs** | node-cron |
| **Push Notifications** | web-push (VAPID) |
| **PDF Export** | PDFKit |
| **Deployment** | Render (backend + frontend) |

---

## 📁 Project Structure

```
MoneySuivi/
├── backend/                          # Node.js + Express REST API
│   ├── controllers/
│   │   ├── authController.js         # Register, login, profile, forgot password
│   │   ├── budgetController.js       # Budget CRUD + alert triggers
│   │   ├── emiController.js          # Loan/EMI CRUD, installment payments
│   │   ├── expenseController.js      # Transaction CRUD, analytics
│   │   ├── exportController.js       # CSV & PDF generation
│   │   ├── ledgerController.js       # Borrow/lend contacts & entries
│   │   ├── netWorthController.js     # Assets & liabilities
│   │   └── notificationController.js # Push subscriptions & alerts
│   ├── lib/
│   │   └── prisma.js                 # Prisma client singleton
│   ├── middleware/
│   │   ├── auth.js                   # JWT protect middleware
│   │   └── validate.js               # express-validator error handler
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma             # Database schema
│   ├── routes/
│   │   ├── auth.js
│   │   ├── budgets.js
│   │   ├── emis.js
│   │   ├── expenses.js
│   │   ├── export.js
│   │   ├── ledger.js
│   │   ├── networth.js
│   │   └── notifications.js
│   ├── services/
│   │   ├── budgetAlertService.js     # Budget breach detection
│   │   ├── cronJob.js                # Recurring expense automation
│   │   └── pushService.js            # Web Push delivery
│   ├── utils/
│   │   └── loanUtils.js              # Amortisation & interest calculation engine
│   ├── .env
│   ├── package.json
│   └── server.js
│
└── frontend/                         # React 18 PWA
    ├── public/
    │   ├── icon-192x192.png
    │   └── icon-512x512.png
    ├── src/
    │   ├── components/
    │   │   ├── Layout.jsx            # App shell + navigation
    │   │   ├── ExpenseCard.jsx
    │   │   └── Skeleton.jsx
    │   ├── context/
    │   │   ├── AuthContext.jsx
    │   │   ├── BudgetContext.jsx
    │   │   ├── EMIContext.jsx
    │   │   ├── ExpenseContext.jsx
    │   │   ├── LedgerContext.jsx
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
    │   │   ├── Ledger.jsx
    │   │   ├── NetWorth.jsx
    │   │   ├── Notifications.jsx
    │   │   └── Profile.jsx
    │   ├── services/
    │   │   └── api.js                # Axios instance + JWT interceptor
    │   ├── utils/
    │   │   ├── constants.js          # Shared loan calculation logic (mirrors backend)
    │   │   └── pushManager.js        # Browser push subscription manager
    │   ├── App.jsx
    │   ├── index.css
    │   ├── main.jsx
    │   └── sw.js                     # Service worker (offline support)
    ├── index.html
    ├── tailwind.config.js
    ├── vite.config.js
    └── package.json
```

---

## 🗄️ Database Schema

| Model | Fields | Description |
|---|---|---|
| `User` | name, email, password, budgetLimit, currency | Auth + profile |
| `Expense` | title, amount, category, type, accountType, paymentMethod, expenseDate, recurring, recurringType | Transactions |
| `Budget` | category, monthlyLimit | Monthly spend limits |
| `EMI` | title, totalAmount, emiAmount, totalInstallments, paidInstallments, paidAmount, startDate, type, interestRate | Loans & installments |
| `EMIPayment` | emiId, amount, paidAt, note | Individual repayment log entries |
| `Asset` | name, type, value | Net worth assets |
| `Liability` | name, type, value | Net worth liabilities |
| `LedgerContact` | name, phone, note | Borrow/lend contacts |
| `LedgerEntry` | contactId, type, amount, date, settled | LENT / BORROWED entries |
| `Notification` | category, message, type, read | In-app alerts |
| `PushSubscription` | endpoint, p256dh, auth | Browser push registrations |

---

## 🌐 API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login (returns JWT) |
| `GET` | `/api/auth/me` | Get current user |
| `PUT` | `/api/auth/profile` | Update name / password |
| `POST` | `/api/auth/forgot-password` | Reset password |
| `DELETE` | `/api/auth/reset` | Wipe all user data |

### Transactions
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/expenses` | List all transactions |
| `POST` | `/api/expenses` | Add transaction |
| `PUT` | `/api/expenses/:id` | Edit transaction |
| `DELETE` | `/api/expenses/:id` | Delete transaction |
| `GET` | `/api/expenses/analytics` | Monthly + category analytics |
| `GET` | `/api/export/csv` | Export as CSV |
| `GET` | `/api/export/pdf` | Export as PDF |

### Budgets
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/budgets` | List budgets |
| `POST` | `/api/budgets` | Create budget |
| `PUT` | `/api/budgets/:id` | Update budget |
| `DELETE` | `/api/budgets/:id` | Delete budget |

### Loans & EMIs
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/emis` | List all loans |
| `POST` | `/api/emis` | Create loan/EMI |
| `PUT` | `/api/emis/:id` | Update loan details |
| `PATCH` | `/api/emis/:id/pay` | Record repayment |
| `DELETE` | `/api/emis/:id` | Delete loan |
| `DELETE` | `/api/emis/payments/:paymentId` | Delete repayment log entry |

### Net Worth
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/networth/summary` | Net worth summary |
| `GET/POST` | `/api/networth/assets` | List / add asset |
| `PUT/DELETE` | `/api/networth/assets/:id` | Edit / remove asset |
| `GET/POST` | `/api/networth/liabilities` | List / add liability |
| `PUT/DELETE` | `/api/networth/liabilities/:id` | Edit / remove liability |

### Ledger
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/ledger/summary` | Overall borrow/lend summary |
| `GET/POST` | `/api/ledger/contacts` | List / add contact |
| `PUT/DELETE` | `/api/ledger/contacts/:id` | Edit / delete contact |
| `GET/POST` | `/api/ledger/contacts/:id/entries` | List / add ledger entry |
| `PUT/DELETE` | `/api/ledger/entries/:id` | Edit / delete entry |

### Notifications
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notifications` | List notifications |
| `PUT` | `/api/notifications/read-all` | Mark all as read |
| `POST` | `/api/notifications/subscribe` | Register push subscription |
| `DELETE` | `/api/notifications/unsubscribe` | Remove push subscription |

---

## ⚙️ Local Setup

### Prerequisites
- Node.js ≥ 18
- PostgreSQL database (or a free [NeonDB](https://neon.tech) cloud instance)

### 1. Clone

```bash
git clone https://github.com/Aleenajomy/SmartExpenceTracker.git
cd SmartExpenceTracker
```

### 2. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=5000
DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
DIRECT_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRE=7d
NODE_ENV=development
VAPID_PUBLIC_KEY="your_vapid_public_key"
VAPID_PRIVATE_KEY="your_vapid_private_key"
```

> Generate VAPID keys: `npx web-push generate-vapid-keys`

```bash
npx prisma generate
npx prisma migrate dev   # or: npx prisma db push
npm run dev              # starts on http://localhost:5000
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

```bash
npm run dev              # starts on http://localhost:3000
```

### 4. Build for Production (PWA)

```bash
cd frontend
npm run build            # outputs to frontend/dist/
```

---

## 💡 Loan Calculation Logic

MoneySuivi implements a precise, fully deterministic loan engine in `backend/utils/loanUtils.js` (mirrored client-side in `frontend/src/utils/constants.js`).

### Fixed EMI Loans
```
Total Payable     = EMI × Total Months
Total Interest    = Total Payable − Principal
Monthly Interest  = Remaining Principal × (Annual Rate / 12 / 100)
Principal Paid    = EMI − Monthly Interest
Remaining Balance = Outstanding Principal after m paid installments (from amortisation loop)
```

### Flexible Loans (Monthly Anniversary Accrual)
```
Billing cycles fire on startDate + N months (e.g., May 1 → Jun 1 → Jul 1)
Cycle Interest    = Outstanding Principal × Annual Rate / 12 / 100
                    (fixed for the entire cycle — never drifts day to day)
Repayment order   = Accrued Interest first → then Principal
```

---

## 🚢 Deployment

Both services are deployed on **Render**:

| Service | URL |
|---|---|
| Frontend (Static) | [smartexpencetracker-frontend.onrender.com](https://smartexpencetracker-frontend.onrender.com) |
| Backend (Web Service) | `https://smartexpencetracker.onrender.com` |

Database hosted on **NeonDB** (serverless PostgreSQL).

---

## 📜 License

MIT © 2026 [Aleena Jomy](https://github.com/Aleenajomy)
