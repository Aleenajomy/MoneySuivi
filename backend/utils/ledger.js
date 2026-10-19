const { roundMoney } = require('./money');

const LEDGER_TYPES = ['LENT', 'BORROWED', 'REPAYMENT_RECEIVED', 'REPAYMENT_MADE'];

// Positive: the contact owes the user. Negative: the user owes the contact.
const SIGN = { LENT: 1, REPAYMENT_MADE: 1, BORROWED: -1, REPAYMENT_RECEIVED: -1 };

const computeContactBalance = (entries) => roundMoney(entries.reduce((bal, e) => bal + (SIGN[e.type] || 0) * Number(e.amount), 0));

const withRunningBalance = (entries) => {
  let running = 0;
  return entries.map(e => {
    running = roundMoney(running + (SIGN[e.type] || 0) * Number(e.amount));
    return { ...e, runningBalance: running };
  });
};

module.exports = { LEDGER_TYPES, computeContactBalance, withRunningBalance };
