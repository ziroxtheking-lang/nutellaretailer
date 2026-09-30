
export type LotType =
  | 'Nutella 15g' | 'Nutella B-Ready'
  | 'Autocollant' | 'Trousse + crayons de couleur' | 'Trousse non tissé + crayons cire'
  | 'Surligneur 5 pcs' | 'Set fluo';

// One promotion per Nutella jar size; each has its own wheel, prizes and number of spins.
export type PromoTier = '180g' | '350g' | '600g';

// Which spin of a session it is. Each spin number has its own prize group,
// whatever the promotion: spin 1 -> Nutella items, spin 2 -> trousse/autocollant,
// spin 3 -> surligneur/set fluo. A promotion with N spins plays spins 1..N.
export type SpinStage = 1 | 2 | 3;

// One prize cycle ("wheel") per spin number, per store.
export type WheelKind = 'spin1' | 'spin2' | 'spin3';

export interface LotConfig {
  id: LotType;
  // French name with line breaks (admin panel).
  label: string;
  // Darija name with line breaks (tablet: wheel, cards, results).
  labelAr: string;
  spin: SpinStage;
  color: string;
  textColor: string;
  image?: string;
}

export interface TierConfig {
  id: PromoTier;
  spins: SpinStage;
  // Arabic (Darija) texts shown on the promotion card.
  titleAr: string;
  spinsAr: string;
  // Short French name used in the admin panel and reports.
  label: string;
}

export interface Mall {
  id: string;
  name: string;
  password?: string;
  activeWheels?: number;
  city?: string;
  // Retailer's SFA client code (e.g. AGAR001182). Missing for a few retailers.
  sfa?: string;
  // Global store number (1, 2, 3...) shown in the admin panel.
  number?: number;
}

export interface StockState {
  [mallId: string]: {
    [lot in LotType]: number;
  };
}

export interface CycleState {
  sequence: LotType[];
  index: number;
  completed: number;
}

export interface SpinLog {
  id: string;
  timestamp: string;
  mallId: string;
  mallName: string;
  ticketId: string;
  ticketPhoto?: string;
  lotWon: LotType;
  status: 'Gagné' | 'Annulé';
  promo?: PromoTier;
  spinNumber?: number;
}

export type AdminView = 'dashboard' | 'performance' | 'malls' | 'inventory' | 'reports' | 'settings';
