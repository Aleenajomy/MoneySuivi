require('dotenv').config();
const { config, validateEnv } = require('./config/env');

try {
  validateEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = require('./app');
const prisma = require('./lib/prisma');
const logger = require('./utils/logger');

const connectWithRetry = async (retries = 5, delay = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$connect();
      logger.info('PostgreSQL connected via Prisma');
      return true;
    } catch (error) {
      logger.warn(`Database connection attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt < retries) await new Promise((res) => setTimeout(res, delay));
    }
  }
  logger.error('Max database connection attempts reached; queries will retry on incoming requests');
  return false;
};

const server = app.listen(config.port, () => logger.info(`Server running on port ${config.port}`));

server.on('error', (err) => {
  logger.error(err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use` : `Server error: ${err.message}`);
  process.exit(1);
});

let cron;
connectWithRetry().then(() => {
  if (!config.cronEnabled) return logger.info('[Cron] Disabled via CRON_ENABLED=false');
  cron = require('./services/cronJob');
  cron.start();
});

// Render sends SIGTERM on deploy; finish in-flight requests and release DB connections first.
const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down`);
  cron?.stop?.();
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error(`Unhandled promise rejection: ${reason?.message || reason}`, { stack: reason?.stack }));
