-- Fixes a real race condition: the app used to read a stock count locally,
-- compute +1/-1 in JavaScript, then overwrite the database with that
-- absolute number. If the local copy was even slightly stale (a customer
-- just spun on another tablet, an admin edited a moment earlier), that
-- overwrite silently erased the real change instead of adjusting from it --
-- e.g. DB has 0, admin's stale screen still shows 1, admin clicks "+1",
-- DB becomes 2 instead of 1.
--
-- These functions let the database do the arithmetic itself, atomically,
-- against whatever the real current value is at that instant -- so a spin's
-- decrement and an admin's +/- can never stomp on each other, regardless of
-- how fast (or slow) each side's screen has synced.
--
-- Safe to run on the live database -- only adds two functions, touches no data.
-- Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.

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

create or replace function increment_biscuit_stock(p_mall_id text, p_lot_type text, p_delta int)
returns int
language plpgsql
as $$
declare
  new_qty int;
begin
  insert into biscuit_stocks (mall_id, lot_type, quantity)
  values (p_mall_id, p_lot_type, greatest(0, p_delta))
  on conflict (mall_id, lot_type)
  do update set quantity = greatest(0, biscuit_stocks.quantity + p_delta)
  returning quantity into new_qty;
  return new_qty;
end;
$$;

grant execute on function increment_stock(text, text, int) to anon;
grant execute on function increment_biscuit_stock(text, text, int) to anon;
