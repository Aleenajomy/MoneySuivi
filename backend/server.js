require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./lib/prisma');

const app = express();

const allowedOrigins = [
  'https://smartexpencetracker-frontend.onrender.com',
  'https://smartexpencetracker.onrender.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, same-origin proxy)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Return 403-style rejection without throwing — avoids 500 from error handler
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/transactions', require('./routes/expenses'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/budgets', require('./routes/budgets'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/export', require('./routes/export'));
app.use('/api/emis', require('./routes/emis'));
app.use('/api/networth', require('./routes/networth'));
app.use('/api/ledger', require('./routes/ledger'));


app.get('/api/health', (req, res) => res.json({ success: true, message: 'MoneySuivi API is running' }));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('PostgreSQL connected via Prisma');
    require('./services/cronJob');

    const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌  Port ${PORT} is already in use. Kill the process using it and restart.`);
        process.exit(1);
      } else {
        console.error('Server error:', err.message);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    process.exit(1);
  }
};

startServer();
