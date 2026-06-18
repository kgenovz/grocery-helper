// Thin REST client for the Hono service (proxied at /api by Vite in dev and
// by Caddy in prod).

export type Ingredient = {
  raw: string;
  qty: number | null;
  unit: string | null;
  item: string;
  prep: string | null;
  aisle: string | null;
};

export type Recipe = {
  title: string | null;
  sourceUrl: string;
  baseServings: number | null;
  ingredients: Ingredient[];
};

export type ListItem = {
  id: number;
  item: string;
  qty: number | null;
  unit: string | null;
  aisle: string | null;
  checked: boolean;
};

export type GroceryList = {
  id: number;
  name: string;
  items: ListItem[];
};

export type AddItem = {
  item: string;
  qty: number | null;
  unit: string | null;
  aisle: string | null;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function fetchRecipe(url: string): Promise<Recipe> {
  return fetch('/api/recipe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  }).then((r) => unwrap<Recipe>(r));
}

export function getList(): Promise<GroceryList> {
  return fetch('/api/list').then((r) => unwrap<GroceryList>(r));
}

export function addToList(items: AddItem[]): Promise<GroceryList> {
  return fetch('/api/list/items', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  }).then((r) => unwrap<GroceryList>(r));
}

export function clearList(): Promise<GroceryList> {
  return fetch('/api/list/items', { method: 'DELETE' }).then((r) =>
    unwrap<GroceryList>(r),
  );
}

export function toggleItem(id: number, checked: boolean): Promise<void> {
  return fetch(`/api/list/items/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ checked }),
  }).then((r) => unwrap<unknown>(r).then(() => undefined));
}

export function deleteItem(id: number): Promise<void> {
  return fetch(`/api/list/items/${id}`, { method: 'DELETE' }).then((r) =>
    unwrap<unknown>(r).then(() => undefined),
  );
}

export type Settings = { aisleOrder: string[] };

export function getSettings(): Promise<Settings> {
  return fetch('/api/settings').then((r) => unwrap<Settings>(r));
}

export function saveAisleOrder(order: string[]): Promise<Settings> {
  return fetch('/api/settings/aisle-order', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ order }),
  }).then((r) => unwrap<Settings>(r));
}
