-- Kinder Rentrée Spin Wheel - Supabase schema
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- The app talks to Supabase directly from the browser using the anon
-- (publishable) key, so RLS policies below grant it broad read/write
-- access. There was never real server-side authorization in this app,
-- only a client-side password/admin gate, so this preserves that model.

create table if not exists malls (
  id text primary key,
  name text not null,
  password text not null,
  active_wheels int not null default 1,
  city text,
  sfa text,
  store_number int
);

create table if not exists stocks (
  mall_id text not null references malls(id) on delete cascade,
  lot_type text not null,
  quantity int not null default 0,
  primary key (mall_id, lot_type)
);

-- Independent stock pool for the 45dh promo's second (biscuit) wheel.
-- Kept separate from `stocks` on purpose: the main wheel and the biscuit
-- wheel can both give out B-Ready T1 / Happy Hippo T1, but each is managed
-- and depleted from its own inventory, not a shared count.
create table if not exists biscuit_stocks (
  mall_id text not null references malls(id) on delete cascade,
  lot_type text not null check (lot_type in ('B-Ready T1', 'Happy Hippo T1')),
  quantity int not null default 0,
  primary key (mall_id, lot_type)
);

-- Two independent cycles per mall: 'main' (all 5 gifts, cycle of 18) and
-- 'biscuit' (visually shows all 5 gifts but only ever lands on B-Ready T1 /
-- Happy Hippo T1, cycle of 6). Used for the 45dh promo's second spin.
create table if not exists cycles (
  mall_id text not null references malls(id) on delete cascade,
  wheel text not null check (wheel in ('main', 'biscuit')),
  sequence jsonb not null default '[]'::jsonb,
  index int not null default 0,
  completed int not null default 0,
  primary key (mall_id, wheel)
);

create table if not exists logs (
  id text primary key,
  created_at timestamptz not null default now(),
  "timestamp" text not null,
  mall_id text not null references malls(id) on delete cascade,
  mall_name text not null,
  ticket_id text not null,
  ticket_photo_url text,
  lot_won text not null,
  status text not null default 'Gagné',
  promo text,
  spin_number int
);

create index if not exists logs_mall_id_idx on logs (mall_id);
create index if not exists logs_created_at_idx on logs (created_at desc);

alter table malls enable row level security;
alter table stocks enable row level security;
alter table biscuit_stocks enable row level security;
alter table cycles enable row level security;
alter table logs enable row level security;

drop policy if exists "anon read malls" on malls;
drop policy if exists "anon write malls" on malls;
create policy "anon read malls" on malls for select to anon using (true);
create policy "anon write malls" on malls for all to anon using (true) with check (true);

drop policy if exists "anon read stocks" on stocks;
drop policy if exists "anon write stocks" on stocks;
create policy "anon read stocks" on stocks for select to anon using (true);
create policy "anon write stocks" on stocks for all to anon using (true) with check (true);

drop policy if exists "anon read biscuit_stocks" on biscuit_stocks;
drop policy if exists "anon write biscuit_stocks" on biscuit_stocks;
create policy "anon read biscuit_stocks" on biscuit_stocks for select to anon using (true);
create policy "anon write biscuit_stocks" on biscuit_stocks for all to anon using (true) with check (true);

drop policy if exists "anon read cycles" on cycles;
drop policy if exists "anon write cycles" on cycles;
create policy "anon read cycles" on cycles for select to anon using (true);
create policy "anon write cycles" on cycles for all to anon using (true) with check (true);

drop policy if exists "anon read logs" on logs;
drop policy if exists "anon write logs" on logs;
create policy "anon read logs" on logs for select to anon using (true);
create policy "anon write logs" on logs for all to anon using (true) with check (true);

-- Storage bucket for ticket photos (replaces the /uploads folder).
insert into storage.buckets (id, name, public)
values ('ticket-photos', 'ticket-photos', true)
on conflict (id) do nothing;

drop policy if exists "anon manage ticket photos" on storage.objects;
create policy "anon manage ticket photos" on storage.objects for all to anon
  using (bucket_id = 'ticket-photos') with check (bucket_id = 'ticket-photos');

-- Seed data: the 45 retail stores are loaded by supabase/retail_stores.sql.
-- Run it right after this file (it also sets their starting stock).

-- Default starting stock per mall for the 5 gifts. Adjust in the admin
-- Inventory panel once real quantities are known.
insert into stocks (mall_id, lot_type, quantity)
select m.id, lot.lot_type, lot.qty
from malls m
cross join (values
  ('Gourde', 20),
  ('Sac Isotherme', 20),
  ('Lunch Box', 20),
  ('B-Ready T1', 30),
  ('Happy Hippo T1', 25)
) as lot(lot_type, qty)
on conflict (mall_id, lot_type) do nothing;

-- Default starting stock for the 45dh promo's separate biscuit wheel.
-- Independent from the main wheel's B-Ready T1 / Happy Hippo T1 counts above.
insert into biscuit_stocks (mall_id, lot_type, quantity)
select m.id, lot.lot_type, lot.qty
from malls m
cross join (values
  ('B-Ready T1', 30),
  ('Happy Hippo T1', 25)
) as lot(lot_type, qty)
on conflict (mall_id, lot_type) do nothing;
