import { Hono } from 'hono';
import { sql } from '../db';
import { normalizeName } from '../aisle/aisle';

export const listRoute = new Hono();

type ListRow = { id: number; name: string };
type ItemRow = {
  id: number;
  item: string;
  qty: string | null; // postgres numeric -> string
  unit: string | null;
  aisle: string | null;
  checked: boolean;
  est_price: string | null;
  on_sale: boolean;
  updated_at: Date;
};

// One shared household list (seeded in migration 002); create as a safety net.
async function getHouseholdList(): Promise<ListRow> {
  const found = await sql<ListRow[]>`select id, name from lists order by id limit 1`;
  if (found.length > 0) return found[0];
  const created = await sql<ListRow[]>`
    insert into lists (name) values ('Household') returning id, name
  `;
  return created[0];
}

async function loadItems(listId: number) {
  const rows = await sql<ItemRow[]>`
    select id, item, qty, unit, aisle, checked, est_price, on_sale, updated_at
    from list_items
    where list_id = ${listId}
    order by coalesce(aisle, 'Other'), lower(item)
  `;
  return rows.map((r) => ({
    id: r.id,
    item: r.item,
    qty: r.qty === null ? null : Number(r.qty),
    unit: r.unit,
    aisle: r.aisle,
    checked: r.checked,
    estPrice: r.est_price === null ? null : Number(r.est_price),
    onSale: r.on_sale,
    updatedAt: r.updated_at,
  }));
}

// Merge key: same normalized item name + same unit collapses to one line.
function mergeKey(item: string, unit: string | null): string {
  return `${normalizeName(item)}|${(unit ?? '').toLowerCase().trim()}`;
}

// GET /list -> the household list with its items, grouped-ready (aisle, name).
listRoute.get('/list', async (c) => {
  const list = await getHouseholdList();
  return c.json({ id: list.id, name: list.name, items: await loadItems(list.id) });
});

// POST /list/items { items:[{item,qty,unit,aisle}] } -> merge into the list.
// Duplicate lines (same item+unit) combine: numeric qtys sum; if either side is
// null ("to taste"), the merged qty becomes null.
listRoute.post('/list/items', async (c) => {
  let body: { items?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  if (!Array.isArray(body.items)) {
    return c.json({ error: 'items must be an array' }, 400);
  }
  const incoming = body.items as Array<Record<string, unknown>>;
  const list = await getHouseholdList();

  await sql.begin(async (tx) => {
    const existing = await tx<
      { id: number; item: string; qty: string | null; unit: string | null }[]
    >`select id, item, qty, unit from list_items where list_id = ${list.id}`;

    const byKey = new Map<string, { id: number; qty: number | null }>();
    for (const row of existing) {
      byKey.set(mergeKey(row.item, row.unit), {
        id: row.id,
        qty: row.qty === null ? null : Number(row.qty),
      });
    }

    for (const raw of incoming) {
      const item = typeof raw.item === 'string' ? raw.item.trim() : '';
      if (!item) continue;
      const unit =
        typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : null;
      const aisle =
        typeof raw.aisle === 'string' && raw.aisle.trim() ? raw.aisle.trim() : null;
      const n = Number(raw.qty);
      const qty =
        raw.qty === null || raw.qty === undefined || raw.qty === '' || !Number.isFinite(n)
          ? null
          : n;

      const key = mergeKey(item, unit);
      const match = byKey.get(key);
      if (match) {
        const merged = match.qty !== null && qty !== null ? match.qty + qty : null;
        await tx`
          update list_items
          set qty = ${merged}, aisle = coalesce(aisle, ${aisle}), updated_at = now()
          where id = ${match.id}
        `;
        match.qty = merged;
      } else {
        const inserted = await tx<{ id: number }[]>`
          insert into list_items (list_id, item, qty, unit, aisle)
          values (${list.id}, ${item}, ${qty}, ${unit}, ${aisle})
          returning id
        `;
        byKey.set(key, { id: inserted[0].id, qty });
      }
    }
  });

  return c.json({ id: list.id, name: list.name, items: await loadItems(list.id) });
});

// PATCH /list/items/:id { checked?, qty? } -> check off / adjust one item.
listRoute.patch('/list/items/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  let body: { checked?: unknown; qty?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.checked === 'boolean') patch.checked = body.checked;
  if (body.qty === null) patch.qty = null;
  else if (typeof body.qty === 'number' && Number.isFinite(body.qty)) patch.qty = body.qty;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: 'nothing to update' }, 400);
  }

  const updated = await sql<{ id: number }[]>`
    update list_items set ${sql(patch)}, updated_at = now() where id = ${id} returning id
  `;
  if (updated.length === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

// DELETE /list/items/:id -> remove a single item.
listRoute.delete('/list/items/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  const deleted = await sql<{ id: number }[]>`
    delete from list_items where id = ${id} returning id
  `;
  if (deleted.length === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

// DELETE /list/items -> clear the list (handy for a fresh shop / testing).
listRoute.delete('/list/items', async (c) => {
  const list = await getHouseholdList();
  await sql`delete from list_items where list_id = ${list.id}`;
  return c.json({ id: list.id, name: list.name, items: [] });
});
