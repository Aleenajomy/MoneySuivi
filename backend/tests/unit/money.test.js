const test = require('node:test');
const assert = require('node:assert/strict');
const { roundMoney, sumMoney, roundMoneyFields } = require('../../utils/money');

test('roundMoney removes binary floating point noise', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(-1.005), -1.01);
  assert.equal(roundMoney(19999.999), 20000);
});

test('roundMoney treats non-finite input as zero', () => {
  assert.equal(roundMoney(NaN), 0);
  assert.equal(roundMoney(undefined), 0);
  assert.equal(roundMoney(Infinity), 0);
  assert.equal(roundMoney('12.345'), 12.35);
});

test('sumMoney adds many small amounts exactly to the paisa', () => {
  assert.equal(sumMoney(Array(1000).fill(0.1)), 100);
  assert.equal(sumMoney([10.1, 20.2, null, 'x']), 30.3);
});

test('roundMoneyFields only touches numbers', () => {
  assert.deepEqual(roundMoneyFields({ a: 0.1 + 0.2, b: 'x', c: null }), { a: 0.3, b: 'x', c: null });
});
