import { Hono } from 'hono';
import { sql } from '../db';
import { normalizeName } from '../aisle/aisle';
import { pickMatch, type Candidate } from '../pricing/match';

export const priceRoute = new Hono();

// Treat a cached price as good for ~12 days (plan: ~10–14 day freshness window).
const FRESH_DAYS = 12;

async function householdListId(): Promise<number | null> {
  const rows = await sql<{ id: number }[]>`select id from lists order by id limit 1`;
  return rows[0]?.id ?? null;
}

// GET /price/pending -> normalized item names from the list that are uncached
// or stale. The extension reads this to know what to search for.
priceRoute.get('/price/pending', async (c) => {
  const listId = await householdListId();
  if (listId === null) return c.json({ freshnessDays: FRESH_DAYS, pending: [] });

  const items = await sql<{ item: string }[]>`
    select distinct item from list_items where list_id = ${listId}
  `;
  const repByNorm = new Map<string, string>();
  for (const { item } of items) {
    const norm = normalizeName(item);
    if (norm && !repByNorm.has(norm)) repByNorm.set(norm, item);
  }
  const norms = [...repByNorm.keys()];
  if (norms.length === 0) return c.json({ freshnessDays: FRESH_DAYS, pending: [] });

  const fresh = await sql<{ norm_name: string }[]>`
    select norm_name from product_match_cache
    where norm_name in ${sql(norms)}
      and last_priced_at > now() - make_interval(days => ${FRESH_DAYS})
  `;
  const freshSet = new Set(fresh.map((r) => r.norm_name));
  const pending = norms
    .filter((n) => !freshSet.has(n))
    .map((n) => ({ term: repByNorm.get(n)!, normName: n }));

  return c.json({ freshnessDays: FRESH_DAYS, pending });
});

// POST /price/ingest { term, results: Candidate[] } -> auto-pick the median
// match, write product_match_cache + append price_history, and set est_price on
// matching list items. Called by the extension; a mock caller hits the same path.
priceRoute.post('/price/ingest', async (c) => {
  let body: { term?: unknown; results?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const term = typeof body.term === 'string' ? body.term.trim() : '';
  if (!term) return c.json({ error: 'term required' }, 400);
  if (!Array.isArray(body.results)) return c.json({ error: 'results[] required' }, 400);

  const norm = normalizeName(term);
  const match = pickMatch(term, body.results as Candidate[]);
  if (!match) return c.json({ ok: true, matched: false, term });

  const listId = await householdListId();

  await sql.begin(async (tx) => {
    await tx`
      insert into product_match_cache
        (norm_name, sku, product_name, package_size, last_price, last_unit_price, on_sale, was_price, last_priced_at)
      values
        (${norm}, ${match.sku}, ${match.productName}, ${match.packageSize}, ${match.price},
         ${match.unitPrice}, ${match.onSale}, ${match.wasPrice}, now())
      on conflict (norm_name) do update set
        sku = excluded.sku, product_name = excluded.product_name, package_size = excluded.package_size,
        last_price = excluded.last_price, last_unit_price = excluded.last_unit_price,
        on_sale = excluded.on_sale, was_price = excluded.was_price, last_priced_at = now()
    `;
    if (match.sku) {
      await tx`
        insert into price_history (sku, price, unit_price, on_sale, was_price)
        values (${match.sku}, ${match.price}, ${match.unitPrice}, ${match.onSale}, ${match.wasPrice})
      `;
    }
    if (listId !== null) {
      const its = await tx<{ id: number; item: string }[]>`
        select id, item from list_items where list_id = ${listId}
      `;
      const ids = its.filter((it) => normalizeName(it.item) === norm).map((it) => it.id);
      if (ids.length > 0) {
        await tx`
          update list_items
          set est_price = ${match.price}, matched_sku = ${match.sku}, on_sale = ${match.onSale},
              priced_at = now(), updated_at = now()
          where id in ${sql(ids)}
        `;
      }
    }
  });

  return c.json({ ok: true, matched: true, term, match });
});
