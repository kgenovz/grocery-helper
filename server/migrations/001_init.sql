-- Core schema for the Recipe → Grocery List PWA.
-- Mirrors the "Data model" section of recipe-grocery-pwa-plan.md.

create table if not exists recipes (
  id            bigint generated always as identity primary key,
  title         text,
  source_url    text,
  base_servings numeric,
  created_by    text,
  created_at    timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id        bigint generated always as identity primary key,
  recipe_id bigint not null references recipes(id) on delete cascade,
  qty       numeric,          -- null for "to taste"
  unit      text,
  item      text not null,
  prep      text,
  aisle     text
);

-- One shared "household" list is enough.
create table if not exists lists (
  id         bigint generated always as identity primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

-- The realtime table (Phase 8 fires NOTIFY on change).
create table if not exists list_items (
  id          bigint generated always as identity primary key,
  list_id     bigint not null references lists(id) on delete cascade,
  item        text not null,
  qty         numeric,
  unit        text,
  aisle       text,
  checked     boolean not null default false,
  added_by    text,
  recipe_id   bigint references recipes(id) on delete set null,
  matched_sku text,
  est_price   numeric(10,2),
  on_sale     boolean not null default false,
  updated_at  timestamptz not null default now()
);

create index if not exists list_items_list_id_idx on list_items (list_id);

-- normalized ingredient name -> aisle (check before calling Haiku).
create table if not exists ingredient_aisle_cache (
  norm_name text primary key,
  aisle     text not null
);

-- normalized ingredient name -> chosen Superstore product (the auto-pick).
create table if not exists product_match_cache (
  norm_name       text primary key,
  sku             text,
  product_name    text,
  package_size    text,
  last_price      numeric(10,2),
  last_unit_price numeric(10,4),
  on_sale         boolean not null default false,
  was_price       numeric(10,2),
  last_priced_at  timestamptz
);

-- Append-only: every price we ever capture. Never overwrite.
create table if not exists price_history (
  id          bigint generated always as identity primary key,
  sku         text not null,
  price       numeric(10,2),
  unit_price  numeric(10,4),
  on_sale     boolean not null default false,
  was_price   numeric(10,2),
  captured_at timestamptz not null default now()
);

create index if not exists price_history_sku_idx on price_history (sku);
