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

export function formatPrice(n: number | null): string {
  if (n === null || n === undefined) return '';
  return `$${n.toFixed(2)}`;
}

// Human price age, with a "stale past ~3 weeks" flag (plan: grey out old prices).
export function priceAge(pricedAt: string | null): { label: string; stale: boolean } | null {
  if (!pricedAt) return null;
  const then = new Date(pricedAt).getTime();
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  return {
    label: days <= 0 ? 'today' : days === 1 ? '1d ago' : `${days}d ago`,
    stale: days > 21,
  };
}
