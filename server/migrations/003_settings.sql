-- Household-level settings (one shared household). Keyed JSON blobs.
-- First use: 'aisle_order' -> string[] matching our store's layout.
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);
