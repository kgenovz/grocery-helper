import * as cheerio from 'cheerio';

export type ScrapedRecipe = {
  title: string | null;
  sourceUrl: string;
  baseServings: number | null;
  ingredients: string[];
};

// JSON-LD is messy in the wild, so we treat parsed blocks as unknown JSON.
type Json = unknown;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function typeIncludesRecipe(node: Record<string, Json>): boolean {
  return asArray(node['@type']).some((t) => String(t).toLowerCase() === 'recipe');
}

// Recursively search parsed JSON-LD for the first Recipe node.
// Handles: bare object, arrays, and @graph containers.
function findRecipe(node: Json): Record<string, Json> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(node)) return null;
  if (typeIncludesRecipe(node)) return node;
  if ('@graph' in node) return findRecipe(node['@graph']);
  return null;
}

function parseYield(v: Json): number | null {
  for (const item of asArray(v)) {
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string') {
      const m = item.match(/\d+/);
      if (m) return Number(m[0]);
    }
  }
  return null;
}

export function extractRecipe(html: string, sourceUrl: string): ScrapedRecipe | null {
  const $ = cheerio.load(html);

  let recipe: Record<string, Json> | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (recipe) return;
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      recipe = findRecipe(JSON.parse(raw));
    } catch {
      // skip malformed JSON-LD blocks
    }
  });

  if (!recipe) return null;
  const node: Record<string, Json> = recipe;

  const ingredients = asArray<Json>(node.recipeIngredient ?? node.ingredients)
    .map((s) => String(s).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const title =
    typeof node.name === 'string' && node.name.trim() ? node.name.trim() : null;

  return {
    title,
    sourceUrl,
    baseServings: parseYield(node.recipeYield),
    ingredients,
  };
}
