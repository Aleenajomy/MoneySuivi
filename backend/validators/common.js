const { body, param } = require('express-validator');

const MAX_AMOUNT = 1e12;
const PASSWORD_MIN = 8;
// bcrypt silently ignores bytes past 72, so longer passwords would give a false sense of strength.
const PASSWORD_MAX = 72;

const hasAtMostTwoDecimals = (value) => /^-?\d+(\.\d{1,2})?$/.test(String(value).trim());

const amount = (field, { optional = false, min = 0.01, allowZero = false } = {}) => {
  let chain = body(field);
  chain = optional ? chain.optional({ values: 'null' }) : chain.exists({ values: 'falsy' }).withMessage(`${field} is required`).bail();
  return chain
    .isFloat({ min: allowZero ? 0 : min, max: MAX_AMOUNT }).withMessage(`${field} must be a number between ${allowZero ? 0 : min} and ${MAX_AMOUNT}`).bail()
    .custom(hasAtMostTwoDecimals).withMessage(`${field} can have at most 2 decimal places`)
    .toFloat();
};

const date = (field, { optional = false } = {}) => {
  const chain = optional ? body(field).optional({ values: 'falsy' }) : body(field).exists({ values: 'falsy' }).withMessage(`${field} is required`).bail();
  return chain.isISO8601().withMessage(`${field} must be a valid date`);
};

const text = (field, { max, required = false } = {}) => {
  const base = required
    ? body(field).exists({ values: 'null' }).withMessage(`${field} is required`).bail()
    : body(field).optional({ values: 'null' });
  let chain = base.isString().withMessage(`${field} must be text`).bail().trim();
  if (required) chain = chain.notEmpty().withMessage(`${field} is required`).bail();
  return chain.isLength({ max }).withMessage(`${field} must be at most ${max} characters`);
};

const oneOf = (field, values, { optional = true } = {}) => {
  const chain = optional ? body(field).optional({ values: 'null' }) : body(field);
  return chain.isIn(values).withMessage(`${field} must be one of: ${values.join(', ')}`);
};

const uuidParam = (name = 'id') => param(name).isUUID().withMessage('Invalid id');

const password = (field) => body(field)
  .isString().withMessage('Password is required').bail()
  .isLength({ min: PASSWORD_MIN, max: PASSWORD_MAX }).withMessage(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);

const email = (field = 'email') => body(field)
  .isString().withMessage('Valid email is required').bail()
  .trim().isEmail().withMessage('Valid email is required').bail()
  .isLength({ max: 254 }).withMessage('Email is too long')
  .toLowerCase();

module.exports = { amount, date, text, oneOf, uuidParam, password, email, MAX_AMOUNT, PASSWORD_MIN, PASSWORD_MAX };
