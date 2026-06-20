import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMatch, type Candidate } from './match';

const c = (name: string, price: number, extra: Partial<Candidate> = {}): Candidate => ({
  name,
  price,
  ...extra,
});

test('drops cheapest + priciest, returns the median of the rest', () => {
  // 5 candidates: 0.99 (tiny), 2.49, 3.29, 3.99, 8.99 (premium)
  // pool after trimming extremes: [2.49, 3.29, 3.99] -> median 3.29
  const m = pickMatch('milk', [
    c('milk bag 1L', 0.99),
    c('2% milk 2L', 2.49),
    c('whole milk 2L', 3.29),
    c('skim milk 4L', 3.99),
    c('organic milk 2L', 8.99),
  ]);
  assert.ok(m);
  assert.equal(m.price, 3.29);
  assert.equal(m.productName, 'whole milk 2L');
});

test('with fewer than 5 candidates, takes the median of all', () => {
  const m = pickMatch('butter', [
    c('butter 454g', 4.49),
    c('butter 250g', 3.49),
    c('premium butter', 6.99),
  ]);
  assert.ok(m);
  assert.equal(m.price, 4.49); // median of 3.49 / 4.49 / 6.99
});

test('filters to relevant names; ignores noise', () => {
  const m = pickMatch('flour', [
    c('all-purpose flour 2.5kg', 4.99),
    c('corn tortillas', 2.99), // noise — no "flour"
    c('bread flour 1kg', 3.99),
  ]);
  assert.ok(m);
  // relevant pool: the two flours -> median (2 items, lower-middle) = 3.99
  assert.equal(m.price, 3.99);
});

test('falls back to all candidates when none match the term wording', () => {
  const m = pickMatch('scallions', [c('green onions bunch', 1.29), c('green onion', 1.49)]);
  assert.ok(m);
  assert.equal(m.price, 1.29);
});

test('carries sale fields and sku from the picked item', () => {
  const m = pickMatch('eggs', [
    c('eggs dozen', 3.99, { sku: 'A', onSale: true, wasPrice: 4.99, unitPrice: 0.33 }),
  ]);
  assert.ok(m);
  assert.equal(m.sku, 'A');
  assert.equal(m.onSale, true);
  assert.equal(m.wasPrice, 4.99);
  assert.equal(m.unitPrice, 0.33);
});

test('returns null when no candidate has a valid price', () => {
  assert.equal(pickMatch('milk', [c('milk', 0), c('milk', NaN)]), null);
  assert.equal(pickMatch('milk', []), null);
});
