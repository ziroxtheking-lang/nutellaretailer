-- Admin switches shared by every tablet (e.g. show/hide the "change store" buttons).
-- One row per setting; value is JSON. Safe to run more than once.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

drop policy if exists "anon read app_settings" on app_settings;
drop policy if exists "anon write app_settings" on app_settings;
create policy "anon read app_settings" on app_settings for select to anon using (true);
create policy "anon write app_settings" on app_settings for all to anon using (true) with check (true);

-- Defaults: every button visible (same as before this feature).
insert into app_settings (key, value) values
  ('show_change_store', 'true'::jsonb),
  ('show_change_city', 'true'::jsonb)
on conflict (key) do nothing;

-- Tablets pick up a change instantly.
do $$ begin
  alter publication supabase_realtime add table app_settings;
exception when duplicate_object then null; end $$;
