-- Enables Supabase Realtime (live push updates over websockets) for the
-- tables the app needs to stay in sync across tablets/admins instantly,
-- instead of relying on the app's 20s background poll.
-- Safe to run on the live database -- only adds tables to the realtime
-- publication, does not change any data or existing policies.
-- Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.

alter publication supabase_realtime add table malls;
alter publication supabase_realtime add table stocks;
alter publication supabase_realtime add table biscuit_stocks;
alter publication supabase_realtime add table cycles;
alter publication supabase_realtime add table logs;
