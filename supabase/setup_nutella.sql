-- Nutella "Dour l'3ajla w rba7" spin wheel -- complete database setup.
--
-- Works on an EMPTY project (creates everything) and on an existing one
-- (upgrades it). Safe to run more than once.
-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- What it sets up:
--   * the 45 retail stores (7 cities), store N = id 'c<N>', access code 1000+N
--   * 3 promotions: 180g = 1 spin, 350g = 2 spins, 600g / 750g = 3 spins.
--     The prize depends on which spin it is (same for every promotion):
--       spin 1 -> Nutella 15g, Nutella B-Ready
--       spin 2 -> Autocollant, Trousse + crayons de couleur, Trousse non tissé + crayons cire
--       spin 3 -> Surligneur 5 pcs, Set fluo
--     All spins take from the same per-store stock.
--   * starting stock per store (only where none exists yet): Nutella 15g 22,
--     Nutella B-Ready 22, Autocollant 11, Trousse + crayons de couleur 2,
--     Trousse non tissé + crayons cire 2, Surligneur 5 pcs 1, Set fluo 1
--
-- The app talks to Supabase directly from the browser with the publishable
-- key, so the RLS policies below give it read/write access (the password
-- screens are client-side only).
--
-- Keep the store list in sync with RETAIL_STORES in database.ts, and the
-- prize names in sync with LOTS / TIERS in constants.tsx.

-- ---------------------------------------------------------------- tables

create table if not exists malls (
  id text primary key,
  name text not null,
  password text not null,
  active_wheels int not null default 1
);
alter table malls add column if not exists city text;
alter table malls add column if not exists sfa text;
alter table malls add column if not exists store_number int;

create table if not exists stocks (
  mall_id text not null references malls(id) on delete cascade,
  lot_type text not null,
  quantity int not null default 0,
  primary key (mall_id, lot_type)
);

-- One prize cycle per store per spin number (spin1 / spin2 / spin3).
create table if not exists cycles (
  mall_id text not null references malls(id) on delete cascade,
  wheel text not null,
  sequence jsonb not null default '[]'::jsonb,
  index int not null default 0,
  completed int not null default 0,
  primary key (mall_id, wheel)
);
-- Older databases only allowed the 'main' / 'biscuit' wheels.
alter table cycles drop constraint if exists cycles_wheel_check;
delete from cycles where wheel not in ('spin1', 'spin2', 'spin3');
alter table cycles add constraint cycles_wheel_check check (wheel in ('spin1', 'spin2', 'spin3'));

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

-- The old 45dh "biscuit wheel" stock pool is no longer used.
drop table if exists biscuit_stocks;
drop function if exists increment_biscuit_stock(text, text, int);

-- ---------------------------------------------------------------- access

-- Newer Supabase projects don't always expose new tables to the API automatically.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on malls, stocks, cycles, logs to anon, authenticated;

alter table malls enable row level security;
alter table stocks enable row level security;
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

drop policy if exists "anon read cycles" on cycles;
drop policy if exists "anon write cycles" on cycles;
create policy "anon read cycles" on cycles for select to anon using (true);
create policy "anon write cycles" on cycles for all to anon using (true) with check (true);

drop policy if exists "anon read logs" on logs;
drop policy if exists "anon write logs" on logs;
create policy "anon read logs" on logs for select to anon using (true);
create policy "anon write logs" on logs for all to anon using (true) with check (true);

-- Ticket photos.
insert into storage.buckets (id, name, public)
values ('ticket-photos', 'ticket-photos', true)
on conflict (id) do nothing;

drop policy if exists "anon manage ticket photos" on storage.objects;
create policy "anon manage ticket photos" on storage.objects for all to anon
  using (bucket_id = 'ticket-photos') with check (bucket_id = 'ticket-photos');

-- Atomic +/- on a stock count, so a spin and an admin edit can't overwrite each other.
create or replace function increment_stock(p_mall_id text, p_lot_type text, p_delta int)
returns int
language plpgsql
as $$
declare
  new_qty int;
begin
  insert into stocks (mall_id, lot_type, quantity)
  values (p_mall_id, p_lot_type, greatest(0, p_delta))
  on conflict (mall_id, lot_type)
  do update set quantity = greatest(0, stocks.quantity + p_delta)
  returning quantity into new_qty;
  return new_qty;
end;
$$;
grant execute on function increment_stock(text, text, int) to anon, authenticated;

-- Live updates across tablets / admin screens (skipped if the project has no
-- realtime publication; the app then falls back to refreshing every 20s).
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['malls', 'stocks', 'cycles', 'logs'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- stores

insert into malls (id, name, password, active_wheels, city, sfa, store_number) values
  ('c1',  'JODY MARKET (smart)',                 '1001', 2, 'Agadir',     'AGAR001182', 1),
  ('c2',  'MIDO Market dchira',                  '1002', 2, 'Agadir',     'AGAR001278', 2),
  ('c3',  'Achkid Market',                       '1003', 2, 'Agadir',     'AGAR001596', 3),
  ('c4',  'SAMA MARKET',                         '1004', 2, 'Agadir',     'AGAR001281', 4),
  ('c5',  'FARAH MARKET AIT MELOUL',             '1005', 2, 'Agadir',     'AGAR001546', 5),
  ('c6',  'Lqliaa NASSIM MARKET',                '1006', 2, 'Agadir',     'AGAR001329', 6),
  ('c7',  'YAOUNE (Superette Tadaret)',          '1007', 2, 'Agadir',     'AGAR001601', 7),
  ('c8',  'Soulaiman Market tadaret',            '1008', 2, 'Agadir',     'AGAR000747', 8),
  ('c9',  'Atlas Generation',                    '1009', 2, 'Agadir',     'AGAR000664', 9),
  ('c10', 'MAZOUZ MARKET',                       '1010', 2, 'Agadir',     'AGAR000741', 10),
  ('c11', 'menara prestige developement',        '1011', 2, 'Marrakech',  'MARR001226', 11),
  ('c12', 'Fruits sec assif n welt',             '1012', 2, 'Marrakech',  'MARR000802', 12),
  ('c13', 'AYAD market',                         '1013', 2, 'Marrakech',  'MARR000807', 13),
  ('c14', 'NICKEL KIT',                          '1014', 2, 'Marrakech',  'MARR000472', 14),
  ('c15', 'Supérette marwa',                     '1015', 2, 'Marrakech',  'MARR000542', 15),
  ('c16', 'Essadouni service',                   '1016', 2, 'Marrakech',  'MARR000680', 16),
  ('c17', 'Supérette EL baraka (kinder tronky)', '1017', 2, 'Marrakech',  'MARR000547', 17),
  ('c18', 'Essadouni service 2',                 '1018', 2, 'Marrakech',  'MARR000125', 18),
  ('c19', 'Supermarché Al boustane',             '1019', 2, 'Marrakech',  'MARR000252', 19),
  ('c20', 'Abdelmajid sup de co',                '1020', 2, 'Marrakech',  'MARR000165', 20),
  ('c21', 'LE PREMEUR MARKET',                   '1021', 2, 'Rabat',      'RABR000107', 21),
  ('c22', 'NAHDA MARKET',                        '1022', 2, 'Rabat',      'RABR000386', 22),
  ('c23', 'MOURAD ISLBAN',                       '1023', 2, 'Rabat',      null,         23),
  ('c24', 'CHAMPION MARKET',                     '1024', 2, 'Rabat',      'RABR000067', 24),
  ('c25', 'STE AS-MART',                         '1025', 2, 'Kénitra',    'RAB000652',  25),
  ('c26', 'ISTANBOUL',                           '1026', 2, 'Kénitra',    'RAB000644',  26),
  ('c27', 'HASSANE',                             '1027', 2, 'Kénitra',    'RAB000629',  27),
  ('c28', 'ABDERRAZAK',                          '1028', 2, 'Salé',       'RAB000418',  28),
  ('c29', 'DYNA MARKET',                         '1029', 2, 'Salé',       'RAB000557',  29),
  ('c30', 'MUSTAPHA',                            '1030', 2, 'Salé',       'RAB000612',  30),
  ('c31', 'AZIZ',                                '1031', 2, 'Salé',       'RAB000669',  31),
  ('c32', 'SM FATIMA ZAHRA',                     '1032', 2, 'Casablanca', '2803943',    32),
  ('c33', 'MIMOUZA NMARKET',                     '1033', 2, 'Casablanca', '2850499',    33),
  ('c34', 'PALM MARKET',                         '1034', 2, 'Casablanca', '2850502',    34),
  ('c35', 'HASSAN ADRINE',                       '1035', 2, 'Casablanca', '2800075',    35),
  ('c36', 'SUPERTTE FATHE',                      '1036', 2, 'Casablanca', '2804196',    36),
  ('c37', 'SUPER M OUSSAMA (BOURHIM EL MAHFOU)', '1037', 2, 'Casablanca', '2800111',    37),
  ('c38', 'STE BR NEGOCE',                       '1038', 2, 'Casablanca', '2802530',    38),
  ('c39', 'SUPER MARCHER ISWAN',                 '1039', 2, 'Casablanca', '2805401',    39),
  ('c40', 'SUPREME MARKET',                      '1040', 2, 'Casablanca', '2805610',    40),
  ('c41', 'Trescaminos',                         '1041', 2, 'Tanger',     'TANR000045', 41),
  ('c42', 'Centro',                              '1042', 2, 'Tanger',     'TANR000048', 42),
  ('c43', 'Aourik lahcen',                       '1043', 2, 'Tanger',     'TANR000008', 43),
  ('c44', 'amzil',                               '1044', 2, 'Tanger',     'TANR000573', 44),
  ('c45', 'abdellah mogadour',                   '1045', 2, 'Tanger',     'TANR000900', 45)
on conflict (id) do update set
  name = excluded.name,
  city = excluded.city,
  sfa = excluded.sfa,
  store_number = excluded.store_number;
-- (existing access codes are kept on re-run, in case they were changed in the admin panel)

delete from malls where store_number is null;

-- ---------------------------------------------------------------- prizes / stock

-- Remove the old Kinder gifts (Gourde, Sac Isotherme, Lunch Box, B-Ready T1, Happy Hippo T1).
delete from stocks where lot_type not in (
  'Nutella 15g', 'Nutella B-Ready',
  'Autocollant', 'Trousse + crayons de couleur', 'Trousse non tissé + crayons cire',
  'Surligneur 5 pcs', 'Set fluo'
);

-- Starting stock, same for every store. Adjust per store in admin -> Stocks.
insert into stocks (mall_id, lot_type, quantity)
select m.id, lot.lot_type, lot.qty
from malls m
cross join (values
  ('Nutella 15g', 22),
  ('Nutella B-Ready', 22),
  ('Autocollant', 11),
  ('Trousse + crayons de couleur', 2),
  ('Trousse non tissé + crayons cire', 2),
  ('Surligneur 5 pcs', 1),
  ('Set fluo', 1)
) as lot(lot_type, qty)
on conflict (mall_id, lot_type) do nothing;

-- Make the API see the new/changed tables straight away.
notify pgrst, 'reload schema';
