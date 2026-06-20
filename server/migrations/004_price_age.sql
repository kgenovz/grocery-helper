-- When a list item was last priced, so the UI can show "priced 3 days ago"
-- and grey out stale estimates (plan: show price age).
alter table list_items add column if not exists priced_at timestamptz;
