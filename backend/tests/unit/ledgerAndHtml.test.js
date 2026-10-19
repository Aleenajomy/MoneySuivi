const test = require('node:test');
const assert = require('node:assert/strict');
const { computeContactBalance, withRunningBalance } = require('../../utils/ledger');
const { escapeHtml, sanitizeHeader } = require('../../utils/html');

test('ledger balance: lent and repayments made are owed to the user, borrowed and received reduce it', () => {
  const entries = [
    { type: 'LENT', amount: 1000 },
    { type: 'REPAYMENT_RECEIVED', amount: 400 },
    { type: 'BORROWED', amount: 300 },
    { type: 'REPAYMENT_MADE', amount: 100 },
  ];
  assert.equal(computeContactBalance(entries), 400);
  assert.deepEqual(withRunningBalance(entries).map(e => e.runningBalance), [1000, 600, 300, 400]);
});

test('ledger balance is rounded to paise', () => {
  assert.equal(computeContactBalance([{ type: 'LENT', amount: 0.1 }, { type: 'LENT', amount: 0.2 }]), 0.3);
});

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml(null), '');
});

test('sanitizeHeader strips CR/LF so headers cannot be injected', () => {
  assert.equal(sanitizeHeader('Hello\r\nBcc: victim@example.test'), 'Hello Bcc: victim@example.test');
});
