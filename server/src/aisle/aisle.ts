import { sql } from '../db';
import { anthropic, HAIKU_MODEL } from '../llm/anthropic';

export const AISLES = [
  'Produce',
  'Dairy',
  'Meat',
  'Pantry',
  'Frozen',
  'Spices',
  'Bakery',
  'Other',
] as const;
export type Aisle = (typeof AISLES)[number];

function isAisle(x: unknown): x is Aisle {
  return typeof x === 'string' && (AISLES as readonly string[]).includes(x);
}

// Cache key: lowercased, punctuation-stripped, whitespace-collapsed.
export function normalizeName(item: string): string {
  return item
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SYSTEM = `You are a grocery aisle classifier for a Canadian supermarket (Real Canadian Superstore).
Assign each ingredient to exactly one aisle from this list:
Produce, Dairy, Meat, Pantry, Frozen, Spices, Bakery, Other.

Guidance:
- Produce: fresh fruit, vegetables, fresh herbs.
- Dairy: milk, cheese, butter, yogurt, eggs.
- Meat: fresh or frozen meat, poultry, fish, seafood.
- Pantry: canned goods, dry goods, pasta, rice, flour, sugar, oils, vinegars, sauces, condiments, baking staples.
- Frozen: frozen vegetables, frozen meals, ice cream.
- Spices: dried spices, dried herbs, seasonings, salt, pepper.
- Bakery: bread, buns, tortillas, bakery items.
- Other: anything that does not fit, or non-food items.

Return ONLY a JSON array — no prose, no code fences. Each element must be exactly:
{"name": "<the input string, verbatim>", "aisle": "<one aisle from the list>"}`;

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

// Ask Haiku to tag a batch of ingredient display-names. Returns name -> aisle.
// Any failure (no key, API error, bad JSON) yields an empty map — the caller
// treats unclassified items as null, never crashing the recipe request.
async function classifyWithHaiku(names: string[]): Promise<Map<string, Aisle>> {
  const out = new Map<string, Aisle>();
  if (!anthropic || names.length === 0) return out;

  try {
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(names) }],
    });
    const block = res.content.find((b) => b.type === 'text');
    const raw = block && block.type === 'text' ? block.text : '';
    const parsed: unknown = JSON.parse(stripFences(raw));
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : [];
    for (const entry of list) {
      const e = entry as { name?: unknown; aisle?: unknown };
      if (typeof e.name === 'string' && isAisle(e.aisle)) out.set(e.name, e.aisle);
    }
  } catch (err) {
    console.error('aisle: Haiku classify failed:', err instanceof Error ? err.message : err);
  }
  return out;
}

// For a list of ingredient `item` names, return norm_name -> aisle.
// Cache first (instant + free); only uncached names go to Haiku; new mappings
// are written back. Plan §5.
export async function classifyAisles(items: string[]): Promise<Map<string, Aisle>> {
  const aisleByNorm = new Map<string, Aisle>();

  // unique norm_names, each with a representative display name
  const repByNorm = new Map<string, string>();
  for (const item of items) {
    const norm = normalizeName(item);
    if (norm && !repByNorm.has(norm)) repByNorm.set(norm, item);
  }
  const norms = [...repByNorm.keys()];
  if (norms.length === 0) return aisleByNorm;

  // 1. cache
  const cached = await sql<{ norm_name: string; aisle: string }[]>`
    select norm_name, aisle from ingredient_aisle_cache where norm_name in ${sql(norms)}
  `;
  for (const row of cached) {
    if (isAisle(row.aisle)) aisleByNorm.set(row.norm_name, row.aisle);
  }

  // 2. uncached -> Haiku
  const uncached = norms.filter((n) => !aisleByNorm.has(n));
  if (uncached.length > 0 && anthropic) {
    const byDisplay = await classifyWithHaiku(uncached.map((n) => repByNorm.get(n)!));
    const toInsert: { norm_name: string; aisle: Aisle }[] = [];
    for (const norm of uncached) {
      const aisle = byDisplay.get(repByNorm.get(norm)!);
      if (aisle) {
        aisleByNorm.set(norm, aisle);
        toInsert.push({ norm_name: norm, aisle });
      }
    }
    // 3. write back
    if (toInsert.length > 0) {
      await sql`
        insert into ingredient_aisle_cache ${sql(toInsert, 'norm_name', 'aisle')}
        on conflict (norm_name) do nothing
      `;
    }
  }

  return aisleByNorm;
}
