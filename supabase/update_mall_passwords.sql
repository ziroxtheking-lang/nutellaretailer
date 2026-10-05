-- One-off: update mall access codes to the new repeated-digit pattern.
-- Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.

update malls set password = '1111' where id = 'c1';  -- Hyper Carrefour Dar Bouazza
update malls set password = '2222' where id = 'c2';  -- Hyper Carrefour Sidi Maarouf
update malls set password = '3333' where id = 'c3';  -- Hyper Carrefour Zenata
update malls set password = '4444' where id = 'c4';  -- Hyper Carrefour Ain Sebaa
update malls set password = '5555' where id = 'c5';  -- Hyper Carrefour Tanger
update malls set password = '6666' where id = 'c6';  -- Hyper Carrefour Salé
update malls set password = '7777' where id = 'c7';  -- Hyper Carrefour Almazar
update malls set password = '8888' where id = 'c8';  -- Hyper Carrefour Targa
update malls set password = '9999' where id = 'c9';  -- Hyper Carrefour Adrar
update malls set password = '0000' where id = 'c10'; -- Hyper Carrefour Almaz
update malls set password = '1010' where id = 'c11'; -- Hyper Carrefour Tétouan
update malls set password = '1212' where id = 'c12'; -- Hyper Carrefour Béni Mellal
