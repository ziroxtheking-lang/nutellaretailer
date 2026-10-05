-- One-off migration: adds the separate stock pool for the 45dh promo's
-- second (biscuit) wheel. Safe to run on the live database -- it only
-- creates a new table, does not touch malls/stocks/cycles/logs.
-- Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.

create table if not exists biscuit_stocks (
  mall_id text not null references malls(id) on delete cascade,
  lot_type text not null check (lot_type in ('B-Ready T1', 'Happy Hippo T1')),
  quantity int not null default 0,
  primary key (mall_id, lot_type)
);

alter table biscuit_stocks enable row level security;

drop policy if exists "anon read biscuit_stocks" on biscuit_stocks;
drop policy if exists "anon write biscuit_stocks" on biscuit_stocks;
create policy "anon read biscuit_stocks" on biscuit_stocks for select to anon using (true);
create policy "anon write biscuit_stocks" on biscuit_stocks for all to anon using (true) with check (true);

-- Starting stock: 30 B-Ready T1 / 25 Happy Hippo T1 per mall.
-- Adjust per-mall in admin -> Stocks -> "Roue Biscuit (45dh)" once live.
insert into biscuit_stocks (mall_id, lot_type, quantity)
select m.id, lot.lot_type, lot.qty
from malls m
cross join (values
  ('B-Ready T1', 30),
  ('Happy Hippo T1', 25)
) as lot(lot_type, qty)
on conflict (mall_id, lot_type) do nothing;
