

import { Mall, LotType, WheelKind, CycleState } from './types';

export interface AppDatabase {
  version: string;
  malls: Mall[];
  // One stock count per store per prize; each prize belongs to exactly one promotion's wheel.
  stocks: {
    [mallId: string]: {
      [lot in LotType]: number;
    };
  };
  logs: any[];
  cycles: {
    [mallId: string]: {
      [wheel in WheelKind]: CycleState;
    };
  };
}

// Order the cities appear in on the tablet and in the admin panel.
export const CITIES = ['Agadir', 'Marrakech', 'Casablanca', 'Tanger', 'Rabat', 'Salé', 'Kénitra'];

// "LISTE DES CLIENTS - ACTIVATION BTS NUTELLA": 45 retailers across 7 cities.
// [city, SFA code, store name]. Store number = position in this list (1-45),
// id = c<number>, access code = 1000 + number (e.g. store 7 -> 1007).
// Keep in sync with supabase/retail_stores.sql.
const RETAIL_STORES: [string, string, string][] = [
  ['Agadir', 'AGAR001182', 'JODY MARKET (smart)'],
  ['Agadir', 'AGAR001278', 'MIDO Market dchira'],
  ['Agadir', 'AGAR001596', 'Achkid Market'],
  ['Agadir', 'AGAR001281', 'SAMA MARKET'],
  ['Agadir', 'AGAR001546', 'FARAH MARKET AIT MELOUL'],
  ['Agadir', 'AGAR001329', 'Lqliaa NASSIM MARKET'],
  ['Agadir', 'AGAR001601', 'YAOUNE (Superette Tadaret)'],
  ['Agadir', 'AGAR000747', 'Soulaiman Market tadaret'],
  ['Agadir', 'AGAR000664', 'Atlas Generation'],
  ['Agadir', 'AGAR000741', 'MAZOUZ MARKET'],
  ['Marrakech', 'MARR001226', 'menara prestige developement'],
  ['Marrakech', 'MARR000802', 'Fruits sec assif n welt'],
  ['Marrakech', 'MARR000807', 'AYAD market'],
  ['Marrakech', 'MARR000472', 'NICKEL KIT'],
  ['Marrakech', 'MARR000542', 'Supérette marwa'],
  ['Marrakech', 'MARR000680', 'Essadouni service'],
  ['Marrakech', 'MARR000547', 'Supérette EL baraka (kinder tronky)'],
  ['Marrakech', 'MARR000125', 'Essadouni service 2'],
  ['Marrakech', 'MARR000252', 'Supermarché Al boustane'],
  ['Marrakech', 'MARR000165', 'Abdelmajid sup de co'],
  ['Rabat', 'RABR000107', 'LE PREMEUR MARKET'],
  ['Rabat', 'RABR000386', 'NAHDA MARKET'],
  ['Rabat', '', 'MOURAD ISLBAN'],
  ['Rabat', 'RABR000067', 'CHAMPION MARKET'],
  ['Kénitra', 'RAB000652', 'STE AS-MART'],
  ['Kénitra', 'RAB000644', 'ISTANBOUL'],
  ['Kénitra', 'RAB000629', 'HASSANE'],
  ['Salé', 'RAB000418', 'ABDERRAZAK'],
  ['Salé', 'RAB000557', 'DYNA MARKET'],
  ['Salé', 'RAB000612', 'MUSTAPHA'],
  ['Salé', 'RAB000669', 'AZIZ'],
  ['Casablanca', '2803943', 'SM FATIMA ZAHRA'],
  ['Casablanca', '2850499', 'MIMOUZA NMARKET'],
  ['Casablanca', '2850502', 'PALM MARKET'],
  ['Casablanca', '2800075', 'HASSAN ADRINE'],
  ['Casablanca', '2804196', 'SUPERTTE FATHE'],
  ['Casablanca', '2800111', 'SUPER M OUSSAMA (BOURHIM EL MAHFOU)'],
  ['Casablanca', '2802530', 'STE BR NEGOCE'],
  ['Casablanca', '2805401', 'SUPER MARCHER ISWAN'],
  ['Casablanca', '2805610', 'SUPREME MARKET'],
  ['Tanger', 'TANR000045', 'Trescaminos'],
  ['Tanger', 'TANR000048', 'Centro'],
  ['Tanger', 'TANR000008', 'Aourik lahcen'],
  ['Tanger', 'TANR000573', 'amzil'],
  ['Tanger', 'TANR000900', 'abdellah mogadour'],
];

export const INITIAL_DB_SEED: AppDatabase = {
  version: "5.0.0",
  malls: RETAIL_STORES.map(([city, sfa, name], i) => ({
    id: `c${i + 1}`,
    name,
    password: String(1001 + i),
    activeWheels: 2,
    city,
    sfa: sfa || undefined,
    number: i + 1
  })),
  stocks: {}, // Will be initialized by the engine if empty
  logs: [],
  cycles: {}
};
