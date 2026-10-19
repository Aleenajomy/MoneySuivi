const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const prisma = require('./lib/prisma');
const { config } = require('./config/env');
const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();

// Render terminates TLS at one proxy hop; without this every client shares the proxy's IP
// and rate limits would apply globally.
app.set('trust proxy', 1);
app.disable('x-powered-by');

const corsOptions = {
  origin: (origin, callback) => {
    // Requests without an Origin (native app, curl, server-to-server) carry no ambient browser credentials.
    if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, message: 'MoneySuivi API is running', database: 'up' });
  } catch {
    res.status(503).json({ success: false, message: 'Database unavailable', database: 'down' });
  }
});

app.use('/api', apiLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/export', require('./routes/export'));
app.use('/api/emis', require('./routes/emis'));
app.use('/api/networth', require('./routes/networth'));
app.use('/api/ledger', require('./routes/ledger'));
app.use('/api/support', require('./routes/support'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Malformed JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body too large' });
  }
  logger.error(`[Unhandled] ${req.method} ${req.path}: ${err.message}`, { stack: err.stack });
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
});

module.exports = app;
