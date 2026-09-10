const PAYMENT_BUCKETS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking'];
const ACCOUNT_TYPES = ['Cash', 'Bank', 'UPI', 'Credit Card', 'Wallet', 'Debit Card', 'Net Banking'];
const BALANCE_ACCOUNTS = ['Cash', 'Bank', 'UPI', 'Wallet', 'Credit Card', 'Debit Card', 'Net Banking'];

const normalizePaymentMethod = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'upi' || raw === 'wallet') return 'UPI';
  if (raw === 'credit card') return 'Credit Card';
  if (raw === 'debit card') return 'Debit Card';
  if (raw === 'net banking' || raw === 'bank transfer' || raw === 'bank') return 'Net Banking';
  if (raw === 'cash') return 'Cash';
  return 'Net Banking';
};

const normalizeAccountType = (value, fallback = 'Cash') => {
  const raw = String(value || fallback).trim().toLowerCase();
  if (raw === 'upi') return 'UPI';
  if (raw === 'credit card') return 'Credit Card';
  if (raw === 'wallet') return 'UPI';
  if (raw === 'debit card') return 'Debit Card';
  if (raw === 'net banking' || raw === 'bank' || raw === 'bank transfer') return 'Bank';
  if (raw === 'cash') return 'Cash';
  return 'Cash';
};

const balanceBucketFor = (accountType) => {
  const raw = String(accountType || '').trim().toLowerCase();
  if (raw === 'cash') return 'Cash';
  if (raw === 'upi' || raw === 'wallet') return 'UPI';
  if (raw === 'credit card') return 'Credit Card';
  if (raw === 'debit card') return 'Debit Card';
  if (raw === 'net banking' || raw === 'bank' || raw === 'bank transfer') return 'Net Banking';
  return 'Net Banking';
};

const resolveTransactionBucket = (transaction) => {
  const acc = String(transaction.accountType || '').trim().toLowerCase();
  const pm = String(transaction.paymentMethod || '').trim().toLowerCase();
  if (acc === 'cash' || pm === 'cash') return 'Cash';
  if (acc === 'credit card' || pm === 'credit card') return 'Credit Card';
  if (acc === 'debit card' || pm === 'debit card') return 'Debit Card';
  if (acc === 'upi' || pm === 'upi' || acc === 'wallet' || pm === 'wallet') return 'UPI';
  if (acc === 'net banking' || pm === 'net banking' || acc === 'bank' || pm === 'bank' || pm === 'bank transfer') return 'Net Banking';
  return balanceBucketFor(transaction.accountType || transaction.paymentMethod || 'Net Banking');
};

const inferTransactionAccountType = (transaction) => {
  return normalizeAccountType(transaction.accountType || transaction.paymentMethod);
};

const emptyBalances = () => ({
  cashBalance: 0,
  upiBalance: 0,
  creditCardBalance: 0,
  debitCardBalance: 0,
  netBankingBalance: 0,
  bankBalance: 0,
  totalBalance: 0,
});

const addToPaymentBucket = (balances, method, amount) => {
  const bucket = balanceBucketFor(method);
  if (bucket === 'Cash') balances.cashBalance += amount;
  else if (bucket === 'UPI') balances.upiBalance += amount;
  else if (bucket === 'Credit Card') balances.creditCardBalance += amount;
  else if (bucket === 'Debit Card') balances.debitCardBalance += amount;
  else balances.netBankingBalance += amount;
};

const calculateBalances = (transactions = []) => {
  const balances = emptyBalances();

  transactions.forEach((transaction) => {
    const amount = Number(transaction.amount || 0);
    if (!amount || isNaN(amount)) return;

    if (transaction.type === 'transfer') {
      const fromBucket = balanceBucketFor(transaction.fromAccountType || 'Bank');
      const toBucket = balanceBucketFor(transaction.toAccountType || 'Cash');
      addToPaymentBucket(balances, fromBucket, -amount);
      addToPaymentBucket(balances, toBucket, amount);
      return;
    }

    const bucket = resolveTransactionBucket(transaction);
    const delta = transaction.type === 'income' ? amount : -amount;
    addToPaymentBucket(balances, bucket, delta);
  });

  balances.bankBalance =
    balances.upiBalance +
    balances.debitCardBalance +
    balances.netBankingBalance;

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
  resolveTransactionBucket,
  calculateBalances,
  buildBalanceAlerts,
};

