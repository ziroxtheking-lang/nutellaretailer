
import { LotConfig, LotType, PromoTier, SpinStage, TierConfig, WheelKind } from './types';

// All 7 prizes, in the order they appear around the wheel (clockwise from the first slice).
// The wheel always shows all 7, but `spin` decides which spin of a session can land on it:
//   spin 1 (every promotion)        -> Nutella 15g / Nutella B-Ready
//   spin 2 (350g and 600g/750g)     -> Autocollant / Trousse + crayons de couleur / Trousse non tissé + crayons cire
//   spin 3 (600g/750g only)         -> Surligneur 5 pcs / Set fluo
// Photos go in public/assets/images/prizes/ with these exact file names; until a photo
// exists the wheel shows the prize name instead.
export const LOTS: LotConfig[] = [
  // `color` = colour of the slice printed on wheelspin.png; `textColor` is used for the
  // name shown on that slice until the prize photo exists.
  { id: 'Set fluo', label: 'Set\nfluo', labelAr: 'سيت\nفليو', spin: 3, color: '#FFFFFF', textColor: '#000000', image: '/assets/images/prizes/set-fluo.png' },
  { id: 'Nutella B-Ready', label: 'Nutella\nB-Ready', labelAr: 'نوتيلا\nبي ريدي', spin: 1, color: '#D70B0E', textColor: '#ffffff', image: '/assets/images/prizes/nutella-b-ready.png' },
  // Surligneur and Set fluo (both spin-3 prizes) are kept apart on the wheel.
  { id: 'Surligneur 5 pcs', label: 'Surligneur\n5 pcs', labelAr: '5 ستابيلو\nفليو', spin: 3, color: '#FFFFFF', textColor: '#000000', image: '/assets/images/prizes/surligneur-5-pcs.png' },
  { id: 'Trousse non tissé + crayons cire', label: 'Trousse non tissé\n+ crayons cire', labelAr: 'تروس ديال الثوب\n+ أقلام الشمع', spin: 2, color: '#D70B0E', textColor: '#ffffff', image: '/assets/images/prizes/trousse-non-tisse-crayons-cire.png' },
  { id: 'Nutella 15g', label: 'Nutella\n15g', labelAr: 'نوتيلا\n15غ', spin: 1, color: '#FFFFFF', textColor: '#000000', image: '/assets/images/prizes/nutella-15g.png' },
  { id: 'Autocollant', label: 'Autocollant', labelAr: 'لصاقات', spin: 2, color: '#FFFFFF', textColor: '#000000', image: '/assets/images/prizes/autocollant.png' },
  { id: 'Trousse + crayons de couleur', label: 'Trousse +\ncrayons couleur', labelAr: 'تروس +\nأقلام الألوان', spin: 2, color: '#D70B0E', textColor: '#ffffff', image: '/assets/images/prizes/trousse-crayons-couleur.png' },
];

// Arabic names of the cities, shown on the tablet (the database keeps the French names).
export const CITY_AR: Record<string, string> = {
  'Agadir': 'أكادير',
  'Marrakech': 'مراكش',
  'Casablanca': 'الدار البيضاء',
  'Tanger': 'طنجة',
  'Rabat': 'الرباط',
  'Salé': 'سلا',
  'Kénitra': 'القنيطرة',
};
export const cityAr = (city?: string): string => (city ? CITY_AR[city] ?? city : '');

// "N stores" in Darija, with Arabic number agreement.
export const storesCountAr = (n: number): string =>
  n === 1 ? 'محل واحد' : n === 2 ? 'جوج محلات' : n <= 10 ? `${n} محلات` : `${n} محل`;

export const TIERS: TierConfig[] = [
  { id: '180g', spins: 1, label: 'Nutella 180g', titleAr: 'إلى شريتي نوتيلا 180غ', spinsAr: 'دور العجلة مرة وحدة' },
  { id: '350g', spins: 2, label: 'Nutella 350g', titleAr: 'إلى شريتي نوتيلا 350غ', spinsAr: 'دور العجلة جوج مرات' },
  { id: '600g', spins: 3, label: 'Nutella 600g / 750g', titleAr: 'إلى شريتي نوتيلا 600غ أو 750غ', spinsAr: 'دور العجلة 3 مرات' },
];

export const SPIN_STAGES: SpinStage[] = [1, 2, 3];

export const getTier = (id: PromoTier): TierConfig => TIERS.find(t => t.id === id)!;
export const wheelForSpin = (spin: SpinStage): WheelKind => `spin${spin}` as WheelKind;
export const spinOfWheel = (wheel: WheelKind): SpinStage => Number(wheel.slice(4)) as SpinStage;
// Prizes a given spin number can land on.
export const getSpinLots = (spin: SpinStage): LotConfig[] => LOTS.filter(l => l.spin === spin);
// When a spin's own prizes are all out of stock in a store, it hands out another spin's
// prizes instead: spins 2 and 3 fall back to spin 1 (Nutella 15g / B-Ready).
export const FALLBACK_SPIN: Partial<Record<SpinStage, SpinStage>> = { 2: 1, 3: 1 };
const spinHasStock = (spin: SpinStage, stocks?: Record<string, number>) =>
  getSpinLots(spin).some(l => (stocks?.[l.id] ?? 0) > 0);
// The spin whose prizes (and cycle ratio) a given spin actually draws from right now.
export const getPrizeSpin = (spin: SpinStage, stocks?: Record<string, number>): SpinStage => {
  const fallback = FALLBACK_SPIN[spin];
  return fallback && stocks && !spinHasStock(spin, stocks) ? fallback : spin;
};
// Every prize a promotion can give across all of its spins.
export const getTierLots = (id: PromoTier): LotConfig[] => LOTS.filter(l => l.spin <= getTier(id).spins);

// Each spin number's cycle: its prizes are shuffled and handed out in this ratio
// (capped by what's physically in stock). Equal odds for now -- repeat an
// entry to make that prize come up more often.
export const CYCLE_POOLS: Record<WheelKind, LotType[]> = {
  spin1: ['Nutella 15g', 'Nutella 15g', 'Nutella 15g', 'Nutella B-Ready', 'Nutella B-Ready', 'Nutella B-Ready'],
  spin2: ['Autocollant', 'Autocollant', 'Trousse + crayons de couleur', 'Trousse + crayons de couleur', 'Trousse non tissé + crayons cire', 'Trousse non tissé + crayons cire'],
  spin3: ['Surligneur 5 pcs', 'Surligneur 5 pcs', 'Surligneur 5 pcs', 'Set fluo', 'Set fluo', 'Set fluo'],
};

// Starting quota of every store (used by the admin "Reset quota" button and supabase/reset_fresh.sql).
export const STARTING_STOCK: Record<LotType, number> = {
  'Nutella 15g': 22,
  'Nutella B-Ready': 22,
  'Autocollant': 11,
  'Trousse + crayons de couleur': 2,
  'Trousse non tissé + crayons cire': 2,
  'Surligneur 5 pcs': 1,
  'Set fluo': 1,
};

export const ADMIN_PASSWORD = 'Kinder2026*';

export const GREETINGS = [
  "مبروك عليك! دخول مدرسي زوين مع نوتيلا.",
  "برافو! هاد الهدية غادي تفرّح الدراري ف الدخول المدرسي.",
  "مبروك! نوتيلا كتمنى ليك عام دراسي ناجح.",
  "زهر هادا! استمتع بالهدية ديالك.",
  "مبروك! شكرا على الثقة ديالك ف نوتيلا.",
  "برافو عليك! الهدية ديالك وجدات.",
  "مبروك! عام دراسي عامر بالنجاح والفرحة.",
  "هنيئا ليك! بداية زوينة للعام الدراسي مع نوتيلا."
];

export const ASSETS = [
  '/assets/images/bg.png',
  '/assets/images/Nutella-PNG-Images-HD.webp',
  '/assets/images/tringle.png',
  '/assets/images/wheelspin.png',
  ...LOTS.map(l => l.image!),
  '/assets/images/morocco.webp',
  '/assets/images/storeimage.webp',
  '/assets/sounds/spin.mp3',
  '/assets/sounds/kids_cheering.mp3'
];
