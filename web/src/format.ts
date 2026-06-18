// Default aisle order for grouping the grocery list. A user-reorderable version
// (matching our store's layout) lands in Phase 7's settings.
export const AISLE_ORDER = [
  'Produce',
  'Bakery',
  'Meat',
  'Dairy',
  'Frozen',
  'Pantry',
  'Spices',
  'Other',
] as const;

// Round to ≤2 decimals and drop trailing zeros for display.
export function formatQty(qty: number | null): string {
  if (qty === null || qty === undefined) return '';
  return String(Math.round(qty * 100) / 100);
}

// Scale a quantity by a factor, leaving "to taste" (null) untouched.
export function scaleQty(qty: number | null, factor: number): number | null {
  if (qty === null) return null;
  return Math.round(qty * factor * 1000) / 1000;
}
