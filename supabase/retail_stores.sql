-- Switches the game from Carrefour malls to the 45 retail stores of
-- "LISTE DES CLIENTS - ACTIVATION BTS NUTELLA" (7 cities).
--
-- * Adds city / sfa / store_number columns to malls.
-- * Store N gets id 'c<N>' and access code 1000+N (store 1 -> 1001, store 45 -> 1045),
--   so the existing c1-c35 rows keep their stock and cycle data.
-- * Removes any other old store rows (and, via cascade, their stocks/cycles/logs).
-- * Gives the new stores the same default starting stock as schema.sql.
--
-- Keep the list in sync with RETAIL_STORES in database.ts.
-- Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.

alter table malls add column if not exists city text;
alter table malls add column if not exists sfa text;
alter table malls add column if not exists store_number int;

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
  password = excluded.password,
  active_wheels = excluded.active_wheels,
  city = excluded.city,
  sfa = excluded.sfa,
  store_number = excluded.store_number;

delete from malls where store_number is null;

-- Default starting stock for stores that don't have any yet (existing counts are kept).
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

insert into biscuit_stocks (mall_id, lot_type, quantity)
select m.id, lot.lot_type, lot.qty
from malls m
cross join (values
  ('B-Ready T1', 30),
  ('Happy Hippo T1', 25)
) as lot(lot_type, qty)
on conflict (mall_id, lot_type) do nothing;
