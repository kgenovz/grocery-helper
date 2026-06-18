// Heuristic ingredient parser — no LLM. Phase 4 replaces the internals with a
// Haiku pass (and adds aisle tagging); the output shape stays the same.
//
// Handles: unicode fractions (½), ascii fractions (1/2), mixed numbers (1 1/2),
// ranges (3-4 / 3 to 4 → lower bound), decimals, "to taste" (qty null),
// a units vocabulary, leading "(14.5 oz)" package sizes, and comma-separated prep.

export type ParsedIngredient = {
  raw: string;
  qty: number | null;
  unit: string | null;
  item: string;
  prep: string | null;
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75,
  '⅓': 1 / 3, '⅔': 2 / 3,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

// token (lowercased, trailing "." stripped) -> normalized unit
const UNIT_ALIASES: Record<string, string> = {
  cup: 'cup', cups: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  gram: 'g', grams: 'g', g: 'g',
  kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milligram: 'mg', milligrams: 'mg', mg: 'mg',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  pint: 'pint', pints: 'pint',
  quart: 'quart', quarts: 'quart',
  gallon: 'gallon', gallons: 'gallon',
  clove: 'clove', cloves: 'clove',
  can: 'can', cans: 'can',
  jar: 'jar', jars: 'jar',
  package: 'package', packages: 'package', pkg: 'package', pkgs: 'package',
  bottle: 'bottle', bottles: 'bottle',
  bag: 'bag', bags: 'bag',
  box: 'box', boxes: 'box',
  slice: 'slice', slices: 'slice',
  stick: 'stick', sticks: 'stick',
  sprig: 'sprig', sprigs: 'sprig',
  bunch: 'bunch', bunches: 'bunch',
  stalk: 'stalk', stalks: 'stalk',
  head: 'head', heads: 'head',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  piece: 'piece', pieces: 'piece',
  fillet: 'fillet', fillets: 'fillet',
  ear: 'ear', ears: 'ear',
  handful: 'handful', handfuls: 'handful',
};

const TRAILING_QUALIFIER =
  /\b(to taste|as needed|as desired|for serving|for garnish|if desired)\.?$/i;

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// "1½" -> "1.5", "½" -> "0.5"
function replaceUnicodeFractions(s: string): string {
  return s
    .replace(
      new RegExp(`(\\d+)\\s*([${FRACTION_CHARS}])`, 'g'),
      (_, whole: string, frac: string) =>
        String(Number(whole) + UNICODE_FRACTIONS[frac]),
    )
    .replace(
      new RegExp(`([${FRACTION_CHARS}])`, 'g'),
      (_, frac: string) => String(UNICODE_FRACTIONS[frac]),
    );
}

function extractLeadingQty(s: string): { qty: number | null; rest: string } {
  const str = s.trimStart();

  // range "3-4" / "3 to 4" / "3–4" -> lower bound
  const range = str.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\b/i);
  if (range) return { qty: round(Number(range[1])), rest: str.slice(range[0].length).trim() };

  // mixed number "1 1/2"
  const mixed = str.match(/^(\d+)\s+(\d+)\/(\d+)\b/);
  if (mixed) {
    return {
      qty: round(Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])),
      rest: str.slice(mixed[0].length).trim(),
    };
  }

  // simple fraction "1/2"
  const frac = str.match(/^(\d+)\/(\d+)\b/);
  if (frac) return { qty: round(Number(frac[1]) / Number(frac[2])), rest: str.slice(frac[0].length).trim() };

  // decimal or integer (covers unicode fractions already converted to decimals)
  const num = str.match(/^(\d+(?:\.\d+)?)/);
  if (num) return { qty: round(Number(num[1])), rest: str.slice(num[0].length).trim() };

  return { qty: null, rest: str };
}

function extractUnit(rest: string): { unit: string | null; item: string; sizeNote: string | null } {
  let working = rest;
  let sizeNote: string | null = null;

  // leading package size e.g. "(14.5 oz) can ..." -> note "14.5 oz", continue
  const paren = working.match(/^\(([^)]*)\)\s*/);
  if (paren) {
    sizeNote = paren[1].trim() || null;
    working = working.slice(paren[0].length);
  }

  const tokenMatch = working.match(/^([a-zA-Z]+)\.?\b/);
  if (tokenMatch) {
    const token = tokenMatch[1].toLowerCase();
    const norm = UNIT_ALIASES[token];
    if (norm) {
      return { unit: norm, item: working.slice(tokenMatch[0].length).trim(), sizeNote };
    }
  }
  return { unit: null, item: working, sizeNote };
}

export function parseIngredient(raw: string): ParsedIngredient {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const normalized = replaceUnicodeFractions(cleaned);

  // prep = everything after the first comma
  let head = normalized;
  let prep: string | null = null;
  const comma = normalized.indexOf(',');
  if (comma !== -1) {
    head = normalized.slice(0, comma).trim();
    prep = normalized.slice(comma + 1).trim() || null;
  }

  const { qty, rest } = extractLeadingQty(head);
  const { unit, item: rawItem, sizeNote } = extractUnit(rest);

  let item = rawItem.replace(/^of\s+/i, '').trim();

  // peel a trailing "to taste" / "as needed" into prep
  const trailing = item.match(TRAILING_QUALIFIER);
  if (trailing && trailing.index !== undefined) {
    const phrase = trailing[1];
    item = item.slice(0, trailing.index).replace(/[,\s]+$/, '').trim();
    prep = prep ? `${prep}; ${phrase}` : phrase;
  }

  if (sizeNote) prep = prep ? `${sizeNote}; ${prep}` : sizeNote;

  return { raw: cleaned, qty, unit, item, prep };
}
