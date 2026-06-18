import { Hono } from 'hono';
import { fetchHtml } from '../recipe/fetchHtml';
import { extractRecipe } from '../recipe/jsonld';
import { parseIngredient } from '../recipe/parseIngredient';

export const recipeRoute = new Hono();

// POST /recipe  { url } -> { title, sourceUrl, baseServings, ingredients[] }
// Phase 3: scrape + schema.org JSON-LD parse + heuristic ingredient parse.
// No persistence yet (recipes are saved when added to the list — Phase 5),
// and no LLM yet (Haiku parse + aisle classify arrive in Phase 4).
recipeRoute.post('/recipe', async (c) => {
  let body: { url?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) return c.json({ error: 'url is required' }, 400);

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return c.json({ error: 'invalid url' }, 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return c.json({ error: 'url must be http or https' }, 400);
  }

  let html: string;
  try {
    html = await fetchHtml(url.toString());
  } catch (err) {
    return c.json(
      { error: 'failed to fetch page', detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }

  const scraped = extractRecipe(html, url.toString());
  if (!scraped) {
    // Phase 4 will fall back to a Haiku extraction pass here.
    return c.json(
      { error: 'no schema.org Recipe found on page', sourceUrl: url.toString() },
      422,
    );
  }

  return c.json({
    title: scraped.title,
    sourceUrl: scraped.sourceUrl,
    baseServings: scraped.baseServings,
    ingredients: scraped.ingredients.map(parseIngredient),
  });
});
