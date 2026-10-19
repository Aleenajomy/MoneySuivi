// Amounts are stored as Float (double precision). Every value written or reported is rounded
// to paise so binary floating-point noise (0.1 + 0.2) never surfaces in balances.
const roundMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;
};

const sumMoney = (values) => roundMoney(values.reduce((sum, v) => sum + (Number(v) || 0), 0));

const roundMoneyFields = (obj) => Object.fromEntries(
  Object.entries(obj).map(([k, v]) => [k, typeof v === 'number' ? roundMoney(v) : v]),
);

module.exports = { roundMoney, sumMoney, roundMoneyFields };
