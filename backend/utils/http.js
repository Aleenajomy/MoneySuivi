const logger = require('./logger');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Clients only ever see a generic message for unexpected failures; details stay in server logs.
const serverError = (res, error, context = 'request') => {
  logger.error(`[${context}] ${error?.message || error}`, { stack: error?.stack });
  return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
};

const handleError = (res, error, context) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ success: false, message: error.message, ...(error.code && { code: error.code }) });
  }
  if (error?.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' });
  return serverError(res, error, context);
};

module.exports = { HttpError, serverError, handleError };
