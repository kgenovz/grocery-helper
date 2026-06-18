import { Hono } from 'hono';
import { sql } from '../db';

export const settingsRoute = new Hono();

// Canonical aisle set + default order. The user reorders these to match the
// layout of our store (the thing off-the-shelf apps don't do well).
export const DEFAULT_AISLE_ORDER = [
  'Produce',
  'Bakery',
  'Meat',
  'Dairy',
  'Frozen',
  'Pantry',
  'Spices',
  'Other',
];

async function readAisleOrder(): Promise<string[]> {
  const rows = await sql<{ value: unknown }[]>`
    select value from settings where key = 'aisle_order'
  `;
  const stored = rows[0]?.value;
  if (!Array.isArray(stored)) return DEFAULT_AISLE_ORDER;
  // keep only known aisles, then append any missing ones (e.g. after a code change)
  const known = stored.filter((a): a is string => DEFAULT_AISLE_ORDER.includes(a as string));
  const missing = DEFAULT_AISLE_ORDER.filter((a) => !known.includes(a));
  return [...known, ...missing];
}

settingsRoute.get('/settings', async (c) => {
  return c.json({ aisleOrder: await readAisleOrder() });
});

settingsRoute.put('/settings/aisle-order', async (c) => {
  let body: { order?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  if (!Array.isArray(body.order)) {
    return c.json({ error: 'order must be an array' }, 400);
  }
  const order = body.order.filter(
    (a): a is string => typeof a === 'string' && DEFAULT_AISLE_ORDER.includes(a),
  );
  await sql`
    insert into settings (key, value) values ('aisle_order', ${sql.json(order)})
    on conflict (key) do update set value = excluded.value
  `;
  return c.json({ aisleOrder: await readAisleOrder() });
});
