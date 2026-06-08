const PAYMENT_BUCKETS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking'];
const ACCOUNT_TYPES = ['Cash', 'Bank', 'UPI', 'Credit Card', 'Wallet'];
const BALANCE_ACCOUNTS = ['Cash', 'Bank', 'Wallet'];

const normalizePaymentMethod = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'upi' || raw === 'wallet') return 'UPI';
  if (raw === 'credit card') return 'Credit Card';
  if (raw === 'debit card') return 'Debit Card';
  if (raw === 'net banking' || raw === 'bank transfer' || raw === 'bank') return 'Net Banking';
  return 'Cash';
};

const normalizeAccountType = (value, fallback = 'Cash') => {
  const raw = String(value || fallback).trim().toLowerCase();
  if (raw === 'upi') return 'UPI';
  if (raw === 'credit card') return 'Credit Card';
  if (raw === 'wallet') return 'Wallet';
  if (['bank', 'bank transfer', 'debit card', 'net banking'].includes(raw)) return 'Bank';
  return 'Cash';
};

const balanceBucketFor = (accountType) => {
  const normalized = normalizeAccountType(accountType);
  if (normalized === 'UPI') return 'Bank';
  if (normalized === 'Cash' || normalized === 'Bank' || normalized === 'Wallet') return normalized;
  return null;
};

const inferTransactionAccountType = (transaction) => {
  return normalizeAccountType(transaction.accountType);
};

const emptyBalances = () => ({
  cashBalance: 0,
  upiBalance: 0,
  creditCardBalance: 0,
  debitCardBalance: 0,
  netBankingBalance: 0,
  totalBalance: 0,
});

const addToPaymentBucket = (balances, method, amount) => {
  if (method === 'Cash') balances.cashBalance += amount;
  else if (method === 'UPI') balances.upiBalance += amount;
  else if (method === 'Credit Card') balances.creditCardBalance += amount;
  else if (method === 'Debit Card') balances.debitCardBalance += amount;
  else if (method === 'Net Banking') balances.netBankingBalance += amount;
};

// Keep legacy addToBucket for transfer support
const addToBucket = (balances, bucket, amount) => {
  if (bucket === 'Cash') balances.cashBalance += amount;
  if (bucket === 'Bank') { balances.debitCardBalance += amount; }
  if (bucket === 'Wallet') balances.upiBalance += amount;
};

const calculateBalances = (transactions = []) => {
  const balances = emptyBalances();

  transactions.forEach((transaction) => {
    const amount = Number(transaction.amount || 0);
    if (!amount) return;

    if (transaction.type === 'transfer') {
      addToBucket(balances, balanceBucketFor(transaction.fromAccountType), -amount);
      addToBucket(balances, balanceBucketFor(transaction.toAccountType), amount);
      return;
    }

    const method = normalizePaymentMethod(transaction.paymentMethod || transaction.accountType);
    const delta = transaction.type === 'income' ? amount : -amount;
    addToPaymentBucket(balances, method, delta);
  });

  balances.totalBalance =
    balances.cashBalance +
    balances.upiBalance +
    balances.debitCardBalance +
    balances.netBankingBalance +
    balances.creditCardBalance;
  return balances;
};

const buildBalanceAlerts = (balances, thresholds = {}) => {
  const alerts = [];
  if (balances.creditCardBalance < 0) {
    alerts.push({ type: 'warning', accountType: 'Credit Card', message: 'Credit Card balance is negative.' });
  }
  return alerts;
};

module.exports = {
  PAYMENT_BUCKETS,
  ACCOUNT_TYPES,
  BALANCE_ACCOUNTS,
  normalizePaymentMethod,
  normalizeAccountType,
  inferTransactionAccountType,
  balanceBucketFor,
  calculateBalances,
  buildBalanceAlerts,
};
