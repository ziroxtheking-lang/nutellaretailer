-- Fresh start before the event: wipes all spins and prize cycles, and puts every
-- store's stock back to the starting quantities.
-- KEEPS: the 45 stores, their access codes and SFA codes.
--
-- Ticket PHOTOS are not removed by this script (Supabase doesn't allow deleting
-- storage files from SQL): delete them in Dashboard -> Storage -> ticket-photos.
--
-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.

-- All spin history (the "Gains" tables in admin).
delete from logs;

-- Prize order per store / spin number: regenerated automatically on the next spin.
delete from cycles;

-- Starting stock for every store (same numbers as setup_nutella.sql).
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
on conflict (mall_id, lot_type) do update set quantity = excluded.quantity;

-- Check: should show 0 spins, 0 cycles, 45 stores, 315 stock rows, 2745 prizes.
select
  (select count(*) from logs)            as spins,
  (select count(*) from cycles)          as cycles,
  (select count(*) from malls)           as stores,
  (select count(*) from stocks)          as stock_rows,
  (select sum(quantity) from stocks)     as prizes_in_stock;
