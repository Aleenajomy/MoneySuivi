# Smart Expense Tracker (PWA)

A full-stack expense tracker PWA built with React + Vite, Node.js + Express, PostgreSQL, and Prisma.

---

## Project Structure

```
MyExpences/
├── backend/                    # Node.js + Express API
│   ├── config/db.js
│   ├── controllers/
│   │   ├── authController.js
│   │   └── expenseController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── validate.js
│   ├── models/
│   │   ├── User.js
│   │   └── Expense.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── expenses.js
│   ├── .env
│   ├── package.json
│   └── server.js
│
└── frontend/                   # React PWA
    ├── public/
    ├── src/
    │   ├── components/
    │   │   ├── Layout.jsx
    │   │   ├── ExpenseCard.jsx
    │   │   └── Skeleton.jsx
    │   ├── context/
    │   │   ├── AuthContext.jsx
    │   │   ├── ExpenseContext.jsx
    │   │   └── ThemeContext.jsx
    │   ├── pages/
    │   │   ├── auth/
    │   │   │   ├── Login.jsx
    │   │   │   └── Register.jsx
    │   │   ├── Dashboard.jsx
    │   │   ├── History.jsx
    │   │   ├── Analytics.jsx
    │   │   ├── Profile.jsx
    │   │   └── AddExpense.jsx
    │   ├── services/api.js
    │   ├── utils/constants.js
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── package.json
```

---

## Setup Instructions

### 1. Backend Setup
```bash
cd backend
npm install
```

Edit `.env`:
```env
PORT=5000
DATABASE_URL="postgresql://postgres:<password>@localhost:5432/smart_expense_tracker?schema=public"
JWT_SECRET=your_super_secret_key
JWT_EXPIRE=7d
NODE_ENV=development
```

Create the PostgreSQL database, then run the Prisma migration:
```bash
createdb -U postgres smart_expense_tracker
npm run prisma:migrate
```

```bash
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Open: **http://localhost:3000**

### 3. Build for Production (PWA)
```bash
cd frontend
npm run build
```

This generates a `dist/` folder with full PWA support (installable on Android/iOS).

---

## Install as App on Android
1. Open Chrome on Android
2. Go to your deployed URL
3. Tap the **"Add to Home Screen"** banner
4. App installs like a native app ✅

---

## Tech Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, React Router v6
- **PWA**: vite-plugin-pwa, Web App Manifest, Service Worker
- **Backend**: Node.js, Express.js, JWT, bcryptjs
- **Database**: PostgreSQL, Prisma
