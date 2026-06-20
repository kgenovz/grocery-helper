// Pick the "medium-priced common item" from PC Express search results — the
// zero-effort auto-pick (plan §3): drop the rock-bottom tiny package and the
// premium/organic outlier, then take the median of what's left.

export type Candidate = {
  name: string;
  brand?: string | null;
  price: number; // package price, dollars
  size?: string | null;
  unitPrice?: number | null;
  onSale?: boolean;
  wasPrice?: number | null;
  sku?: string | null;
};

export type Match = {
  sku: string | null;
  productName: string;
  packageSize: string | null;
  price: number;
  unitPrice: number | null;
  onSale: boolean;
  wasPrice: number | null;
};

const STOPWORDS = new Set(['the', 'a', 'of', 'and', 'fresh', 'organic', 'with']);

function termWords(term: string): string[] {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Keep candidates whose name overlaps the search term; if that filters
// everything out, fall back to all valid-priced candidates (don't return null
// just because names are worded differently).
function relevant(term: string, candidates: Candidate[]): Candidate[] {
  const valid = candidates.filter(
    (c) => typeof c.price === 'number' && Number.isFinite(c.price) && c.price > 0,
  );
  const words = termWords(term);
  if (words.length === 0) return valid;
  const matched = valid.filter((c) => {
    const n = c.name.toLowerCase();
    return words.some((w) => n.includes(w));
  });
  return matched.length > 0 ? matched : valid;
}

export function pickMatch(term: string, candidates: Candidate[]): Match | null {
  const pool0 = relevant(term, candidates);
  if (pool0.length === 0) return null;

  const sorted = [...pool0].sort((a, b) => a.price - b.price);
  // With enough options, drop the cheapest (tiny/loss-leader) and priciest
  // (premium/organic) before taking the median.
  const pool = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
  const mid = pool[Math.floor((pool.length - 1) / 2)];

  return {
    sku: mid.sku ?? null,
    productName: mid.name,
    packageSize: mid.size ?? null,
    price: mid.price,
    unitPrice: mid.unitPrice ?? null,
    onSale: Boolean(mid.onSale),
    wasPrice: mid.wasPrice ?? null,
  };
}
