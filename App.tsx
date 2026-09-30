import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Wheel from './components/Wheel';
import { Mall, LotConfig, LotType, SpinLog, AdminView, WheelKind, PromoTier, CycleState, SpinStage } from './types';
import { LOTS, TIERS, SPIN_STAGES, CYCLE_POOLS, getTier, getSpinLots, wheelForSpin, spinOfWheel, cityAr, storesCountAr, ADMIN_PASSWORD, GREETINGS, ASSETS, STARTING_STOCK } from './constants';
import { DB } from './services/databaseService';
import { downloadExcel } from './services/excelExport';
import { CITIES } from './database';

const OTHER_CITY = 'Autres';

// Groups stores by city, cities in CITIES order (unknown cities last), stores by number.
const groupByCity = (malls: Mall[]): { city: string; malls: Mall[] }[] => {
  const groups = new Map<string, Mall[]>();
  malls.forEach(mall => {
    const city = mall.city || OTHER_CITY;
    if (!groups.has(city)) groups.set(city, []);
    groups.get(city)!.push(mall);
  });
  const rank = (city: string) => {
    const i = CITIES.indexOf(city);
    return i === -1 ? CITIES.length : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([city, list]) => ({
      city,
      malls: [...list].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity))
    }));
};

// "City · SFA · N°" line identifying a store in the admin panel.
const StoreTag: React.FC<{ mall?: Mall; className?: string }> = ({ mall, className = '' }) => {
  if (!mall) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs font-black uppercase tracking-wider ${className}`}>
      <span className="px-2 py-0.5 rounded-full bg-[#D70B0E] text-white">{mall.city || OTHER_CITY}</span>
      <span className="px-2 py-0.5 rounded-full bg-black/5 text-black/60 font-mono">SFA {mall.sfa || '—'}</span>
      <span className="px-2 py-0.5 rounded-full bg-[#D70B0E]/10 text-[#D70B0E]">N° {mall.number ?? '—'}</span>
    </div>
  );
};

// Tablet connection pill (bottom-left): hidden when online with nothing waiting.
const SyncBadge: React.FC<{ online: boolean; pending: number }> = ({ online, pending }) => {
  if (online && pending === 0) return null;
  return (
    <div dir="rtl" className={`font-arabic fixed bottom-3 left-3 z-[300] flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-white shadow-lg text-xs md:text-sm font-black text-white ${online ? 'bg-black' : 'bg-[#D70B0E]'}`}>
      <span className={`w-2 h-2 rounded-full ${online ? 'bg-yellow-300 animate-pulse' : 'bg-white'}`} />
      {online
        ? `كنصيفطو ${pending} دورة…`
        : pending > 0 ? `بلا انترنت · ${pending} دورة محفوظة ف التابليت` : 'بلا انترنت · اللعبة خدامة عادي'}
    </div>
  );
};

// Admin background (admin bg.png: white with Nutella jars on the right), on its own
// fixed layer above the tablet's red background.
const AdminBackdrop: React.FC = () => (
  <div className="fixed inset-0 z-0 bg-white pointer-events-none"
    style={{ backgroundImage: "url('/assets/images/admin%20bg.png')", backgroundSize: 'cover', backgroundPosition: 'right center', backgroundRepeat: 'no-repeat' }} />
);

// Line icons for the admin panel (24x24, drawn with the current text colour).
const ICON_PATHS: Record<string, React.ReactNode> = {
  store: <><path d="M3 10l2-6h14l2 6z" /><path d="M4 10v10h16V10" /><path d="M10 20v-5h4v5" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  box: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  alert: <><path d="M12 3L2 20h20L12 3z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>,
  empty: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  wheel: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M12 3v7M12 14v7M3 12h7M14 12h7M5.6 5.6l5 5M13.4 13.4l5 5M18.4 5.6l-5 5M10.6 13.4l-5 5" /></>,
  gift: <><path d="M4 11h16v10H4z" /><path d="M3 7h18v4H3z" /><path d="M12 7v14" /><path d="M12 7C10 3 6 4 7 7M12 7c2-4 6-3 5 0" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" /></>,
  flame: <path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.8 2-6 1.5 1 2.5 2.5 2.5 2.5S13 6.5 12 3z" />,
  download: <><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  chart: <><path d="M4 20V11M10 20V4M16 20v-7" /><path d="M2 20h20" /></>,
  file: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>,
  logout: <><path d="M9 21H5V3h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  ticket: <path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

const Icon: React.FC<{ name: string; className?: string; strokeWidth?: number }> = ({ name, className = 'w-5 h-5', strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {ICON_PATHS[name]}
  </svg>
);

// Section title used on admin pages: icon tile + title + subtitle.
const AdminSectionTitle: React.FC<{ icon: string; title: string; subtitle?: string; tone?: 'red' | 'black'; live?: boolean }> = ({ icon, title, subtitle, tone = 'black', live }) => (
  <div className="flex items-center gap-3">
    <div className={`relative w-11 h-11 rounded-xl border-2 border-white shadow-md flex items-center justify-center text-white ${tone === 'red' ? 'bg-[#D70B0E]' : 'bg-black'}`}>
      <Icon name={icon} className="w-5 h-5" />
      {live && (
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center border-2 border-[#D70B0E]">
          <span className="w-1.5 h-1.5 bg-[#D70B0E] rounded-full animate-ping" />
        </span>
      )}
    </div>
    <div>
      <h3 className="text-lg md:text-xl text-black font-black uppercase tracking-wider leading-tight">{title}</h3>
      {subtitle && <p className="text-[11px] md:text-xs text-black/45 font-bold">{subtitle}</p>}
    </div>
  </div>
);

const ADMIN_PAGES: { id: AdminView; label: string; icon: string; subtitle: string }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: 'chart', subtitle: 'Vue d’ensemble et gains en direct' },
  { id: 'performance', label: 'Performance', icon: 'trend', subtitle: 'Gains et cycles par magasin' },
  { id: 'malls', label: 'Magasins', icon: 'store', subtitle: 'Noms, codes SFA et codes d’accès' },
  { id: 'inventory', label: 'Stocks', icon: 'box', subtitle: 'Stock de lots par magasin' },
  { id: 'reports', label: 'Rapports', icon: 'file', subtitle: 'Exports Excel et réinitialisation' },
  { id: 'settings', label: 'Réglages', icon: 'gear', subtitle: 'Boutons visibles sur les tablettes' },
];

// Title block for the tablet's city -> store -> code steps.
const StepHeader: React.FC<{ step: number; title: React.ReactNode; onBack?: () => void; backLabel?: string }> = ({ step, title, onBack, backLabel }) => (
  <div className="flex flex-col items-center gap-3 mb-8 md:mb-10">
    {onBack && (
      <button onClick={onBack} className="btn-3d btn-black mb-2 px-6 py-2.5 rounded-full text-sm md:text-base font-black">→ {backLabel}</button>
    )}
    <span className="px-4 py-1 rounded-full bg-[#D70B0E] border-2 border-white text-white text-xs md:text-sm font-black shadow-md">المرحلة {step} من 3</span>
    <h2 className="px-6 py-2 rounded-2xl bg-white/80 backdrop-blur text-2xl md:text-4xl font-montserrat text-[#D70B0E] uppercase tracking-[0.15em] md:tracking-[0.2em] font-black text-center shadow-sm">{title}</h2>
  </div>
);

const CityHeader: React.FC<{ city: string; count: number }> = ({ city, count }) => (
  <div className="mt-4 inline-flex items-center gap-3 pl-2 pr-4 py-2 bg-white rounded-2xl border border-black/5 shadow-[0_6px_18px_rgba(0,0,0,0.06)]">
    <span className="w-9 h-9 rounded-xl bg-black border-2 border-white shadow flex items-center justify-center text-white"><Icon name="pin" className="w-4 h-4" /></span>
    <h3 className="text-lg md:text-xl font-black uppercase tracking-[0.12em] text-black">{city}</h3>
    <span className="px-3 py-1 rounded-full bg-[#D70B0E] text-white text-[10px] md:text-xs font-black uppercase">{count} magasin{count > 1 ? 's' : ''}</span>
  </div>
);

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const getValidTotalStock = (mallStocks: Record<string, number | null | undefined>): number => {
  if (!mallStocks) return 0;
  return LOTS.reduce((acc, lot) => {
    const qty = mallStocks[lot.id];
    return acc + (typeof qty === 'number' && qty > 0 ? qty : 0);
  }, 0);
};

const parseLogDate = (dateStr: string): Date => {
  try {
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour, min, sec] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hour, min, sec);
  } catch (e) {
    return new Date();
  }
};

const WinCelebration: React.FC<{ active: boolean }> = ({ active }) => {
  const elements = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 5}s`,
      duration: `${4 + Math.random() * 4}s`,
      size: `${16 + Math.random() * 24}px`,
      type: ['star', 'sparkle', 'confetti'][Math.floor(Math.random() * 3)],
      sway: `${(Math.random() - 0.5) * 120}px`
    }));
  }, []);
  if (!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-[210] overflow-hidden">
      {elements.map((el) => {
        let content;
        if (el.type === 'star') {
          content = <svg viewBox="0 0 24 24" width="1em" height="1em" fill="white"><polygon points="12,2 15,8 22,9 17,14 18,21 12,17 6,21 7,14 2,9 9,8" /></svg>;
        } else if (el.type === 'sparkle') {
          content = <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" /></svg>;
        } else {
          content = <svg viewBox="0 0 24 24" width="1em" height="1em" fill="#D70B0E"><rect x="4" y="4" width="16" height="16" rx="3" /></svg>;
        }

        return (
          <div key={el.id} className="absolute animate-fall-sway drop-shadow-lg" style={{
            left: el.left, top: '-50px', animationDelay: el.delay, animationDuration: el.duration,
            fontSize: el.size, zIndex: 211, '--sway-amount': el.sway
          } as any}>
            {content}
          </div>
        );
      })}
    </div>
  );
};

const TIER_BADGE_STYLES: Record<PromoTier, string> = {
  '180g': 'bg-black/5 text-black',
  '350g': 'bg-[#D70B0E]/10 text-[#D70B0E]',
  '600g': 'bg-[#000000]/10 text-[#000000]',
};

const SPIN_BADGE_STYLES: Record<SpinStage, string> = {
  1: 'bg-[#D70B0E]/10 text-[#D70B0E]',
  2: 'bg-black/5 text-black',
  3: 'bg-black text-white',
};

// Which promotions play a given spin number, for admin labels.
const SPIN_STAGE_HINT: Record<SpinStage, string> = {
  1: 'Toutes les formules',
  2: 'Nutella 350g et 600g / 750g',
  3: 'Nutella 600g / 750g',
};

// Prize photo if its file exists yet, otherwise a gift icon.
const LotThumb: React.FC<{ lot: LotConfig; className?: string }> = ({ lot, className = '' }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`bg-[#D70B0E]/10 rounded-xl flex items-center justify-center p-2 shadow-inner ${className}`}>
      {lot.image && !failed
        ? <img src={lot.image} onError={() => setFailed(true)} className="w-full h-full object-contain drop-shadow-md" alt="" />
        : <span className="text-2xl md:text-3xl">🎁</span>}
    </div>
  );
};

// Prize visual on the result popups: the prize photo (or a gift icon until one is added).
// Its height is given by the caller so the popup always fits on screen.
const PrizeVisual: React.FC<{ lot: LotConfig; className: string }> = ({ lot, className }) => {
  const [failed, setFailed] = useState(false);
  return lot.image && !failed
    ? <img src={lot.image} onError={() => setFailed(true)} className={`${className} w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.35)]`} alt="" />
    : <div className={`${className} w-full flex items-center justify-center`}><span className="text-6xl md:text-7xl">🎁</span></div>;
};

// Shows which promotion (Nutella jar size) a spin came from, and which of its spins it was.
const PromoBadge: React.FC<{ log: SpinLog }> = ({ log }) => {
  const tier = log.promo ? TIERS.find(t => t.id === log.promo) : undefined;
  if (!tier) {
    return <span className="inline-block px-2 py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-wide bg-gray-200 text-gray-600 whitespace-nowrap">{log.promo ?? '—'}</span>;
  }
  return (
    <span className={`inline-block px-2 py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-wide whitespace-nowrap ${TIER_BADGE_STYLES[tier.id]}`}>
      {tier.label}{tier.spins > 1 && log.spinNumber ? <> &middot; Tour {log.spinNumber}/{tier.spins}</> : null}
    </span>
  );
};

const App: React.FC = () => {
  // Sync UI with DB Engine (Real-time Updates)
  const [, setDbTick] = useState(0);
  useEffect(() => DB.subscribe(() => setDbTick(t => t + 1)), []);

  // Database Data (Always fresh from DB Service)
  const malls = DB.getMalls();
  const stocks = DB.getStocks();
  const logs = DB.getLogs();
  const cycles = DB.getCycles();
  const settings = DB.getSettings();

  // Navigation & Session States
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [adminView, setAdminView] = useState<AdminView>('dashboard');
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [selectedLogIndex, setSelectedLogIndex] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualRefresh = async () => {
    setIsSyncing(true);
    try {
      await DB.fetchAll();
    } finally {
      setIsSyncing(false);
    }
  };

  // Load persistent session
  const [isMallLoggedIn, setIsMallLoggedIn] = useState(() => localStorage.getItem('ferrero_mall_logged_in') === 'true');
  const [currentMall, setCurrentMall] = useState<Mall | null>(() => {
    const savedId = localStorage.getItem('ferrero_current_mall_id');
    return savedId ? malls.find(m => m.id === savedId) || null : null;
  });

  // Tablet login flow: city -> store -> access code.
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  // Not memoized: DB.updateMall edits the malls array in place, so its reference doesn't change.
  const mallById = new Map(malls.map(m => [m.id, m]));
  const mallsByCity = groupByCity(malls);

  // Sync session to localStorage
  useEffect(() => {
    if (currentMall) localStorage.setItem('ferrero_current_mall_id', currentMall.id);
    else localStorage.removeItem('ferrero_current_mall_id');

    localStorage.setItem('ferrero_mall_logged_in', isMallLoggedIn.toString());
  }, [currentMall, isMallLoggedIn]);

  // UI States
  const [passwordInput, setPasswordInput] = useState('');
  const [promoTier, setPromoTier] = useState<PromoTier | null>(null);
  const [spinNumber, setSpinNumber] = useState(1);
  const [spinResults, setSpinResults] = useState<{ lot: LotConfig; aiMessage: string }[]>([]);
  const [ticketId, setTicketId] = useState('');
  const [ticketPhoto, setTicketPhoto] = useState<string | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const winSoundRef = useRef<HTMLAudioElement>(null);

  // Asset Preloading Logic
  useEffect(() => {
    let loadedAssets = new Set<string>();
    const totalAssets = ASSETS.length;

    const updateProgress = (path: string) => {
      if (loadedAssets.has(path)) return;
      loadedAssets.add(path);

      const count = loadedAssets.size;
      setLoadProgress(Math.round((count / totalAssets) * 100));

      if (count === totalAssets) {
        setTimeout(() => setAssetsLoaded(true), 500);
      }
    };

    ASSETS.forEach(path => {
      if (path.endsWith('.mp3')) {
        const audio = new Audio();
        audio.src = path;
        audio.oncanplaythrough = () => updateProgress(path);
        audio.onerror = () => updateProgress(path);
        // iOS safety: skip blocking if audio takes too long to respond
        setTimeout(() => {
          if (audio.readyState < 3) updateProgress(path);
        }, 2000);
      } else {
        const img = new Image();
        img.src = path;
        img.onload = () => updateProgress(path);
        img.onerror = () => updateProgress(path);
      }
    });

    winSoundRef.current = new Audio('/assets/sounds/kids_cheering.mp3');
  }, []);

  // Dashboard Specific Filters
  const [dbCityFilter, setDbCityFilter] = useState('all');
  const [dbMallFilter, setDbMallFilter] = useState('all');
  const [dbTimeframeFilter, setDbTimeframeFilter] = useState('1');
  const [dbPromoFilter, setDbPromoFilter] = useState('all');

  // Ticket Validation Logic (The "Same Mall" Rule)
  const isTicketUsedInCurrentMall = useMemo(() => {
    if (!currentMall || ticketId.length < 5) return false;
    return logs.some(log => log.mallId === currentMall.id && log.ticketId === ticketId);
  }, [logs, currentMall, ticketId]);

  // Combined Mall Filtering (Search)
  const filteredMalls = (() => {
    if (!searchQuery.trim()) return malls;
    const query = searchQuery.toLowerCase().trim();
    return malls.filter(mall =>
      mall.name.toLowerCase().includes(query) ||
      mall.id.toLowerCase().includes(query) ||
      (mall.city ?? '').toLowerCase().includes(query) ||
      (mall.sfa ?? '').toLowerCase().includes(query) ||
      String(mall.number ?? '') === query
    );
  })();

  const generateNextCycle = useCallback((mallId: string, wheel: WheelKind): CycleState => {
    const mallStocks: Record<string, number> | undefined = DB.getStocks()[mallId];
    const pool = CYCLE_POOLS[wheel];
    const eligibleIds: LotType[] = getSpinLots(spinOfWheel(wheel)).map(l => l.id);

    if (!mallStocks) return { sequence: shuffleArray(pool), index: 0, completed: 0 };

    const eligibleStock: Record<string, number | null | undefined> = {};
    eligibleIds.forEach(id => { eligibleStock[id] = mallStocks[id]; });
    const totalStock = getValidTotalStock(eligibleStock);
    let bag: LotType[] = [];

    // If we have any physical stock, generate a sequence based on availability
    if (totalStock > 0) {
      // Build the bag ONLY from items currently in stock to match probabilities
      eligibleIds.forEach(lotId => {
        const count = mallStocks[lotId];
        if (typeof count === 'number' && count > 0) {
          // We use the original pool to find the baseline ratio.
          const originalCountInPool = pool.filter(l => l === lotId).length;
          // Cap items by their physical stock so we never add more to the bag than physically exist.
          const amountToAdd = Math.min(originalCountInPool || 1, count);

          for (let i = 0; i < amountToAdd; i++) {
            bag.push(lotId);
          }
        }
      });

      // If the resulting bag is empty for some reason, fallback to adding directly
      if (bag.length === 0) {
        eligibleIds.forEach(lotId => {
          const count = mallStocks[lotId];
          if (typeof count === 'number' && count > 0) {
            // Add up to 3 of each available item to create a mini cycle
            const amountToAdd = Math.min(3, count);
            for (let i = 0; i < amountToAdd; i++) {
              bag.push(lotId);
            }
          }
        });
      }
      bag = shuffleArray(bag);
    } else {
      bag = [];
    }

    const prevCycle = DB.getCycles()[mallId]?.[wheel];
    return {
      sequence: bag,
      index: 0,
      completed: prevCycle ? prevCycle.completed + 1 : 0
    };
  }, []);

  const getMallWheelCycle = useCallback((mallId: string, wheel: WheelKind): CycleState => {
    let cycle = cycles[mallId]?.[wheel];
    if (!cycle || cycle.index >= cycle.sequence.length) {
      cycle = generateNextCycle(mallId, wheel);
    }
    return cycle;
  }, [cycles, generateNextCycle]);

  // The prize group follows the spin number (1st, 2nd, 3rd), whatever the promotion.
  const currentWheel: WheelKind = wheelForSpin(spinNumber as SpinStage);

  // Ghost Stock Skip Hook (Top Level to follow React rules)
  useEffect(() => {
    if (isMallLoggedIn && currentMall && promoTier && isValidated && !isSpinning) {
      const mallId = currentMall.id;
      const wheel = currentWheel;
      const mallCycle = getMallWheelCycle(mallId, wheel);
      const currentStocks: Record<string, number> | undefined = stocks[mallId];
      if (currentStocks) {
        let currentIndex = mallCycle.index;
        let modified = false;

        while (currentIndex < mallCycle.sequence.length && currentStocks[mallCycle.sequence[currentIndex]] <= 0) {
          currentIndex++;
          modified = true;
        }

        if (modified) {
          DB.atomicUpdate(data => {
            if (!data.cycles[mallId]) data.cycles[mallId] = {} as any;
            if (currentIndex >= mallCycle.sequence.length) {
              data.cycles[mallId][wheel] = generateNextCycle(mallId, wheel);
            } else {
              data.cycles[mallId][wheel] = { ...mallCycle, index: currentIndex };
            }
          }, mallId);
        }
      }
    }
  }, [isMallLoggedIn, currentMall, promoTier, spinNumber, isValidated, isSpinning, stocks, cycles, currentWheel, getMallWheelCycle, generateNextCycle]);

  // --- Client Logic ---
  const handleMallLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentMall && passwordInput === currentMall.password) {
      setIsMallLoggedIn(true);
      setPasswordInput('');
    } else {
      alert('الكود غالط، عاود جرّب');
    }
  };

  // Lets the tablet return to the store list (of the same city) without clearing browser storage by hand.
  const handleMallLogout = () => {
    setIsMallLoggedIn(false);
    setSelectedCity(currentMall?.city ?? null);
    setCurrentMall(null);
    setPromoTier(null);
    setSpinNumber(1);
    setSpinResults([]);
    setTicketId('');
    setTicketPhoto(null);
    setIsValidated(false);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Compress heavily to prevent hitting JSON save limits
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);
        setTicketPhoto(compressedBase64);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSpinEnd = async (lot: LotConfig) => {
    setLoadingMsg(true);
    try {
      const mallId = currentMall!.id;
      const wheel = currentWheel;
      const currentStocks: Record<string, number> | undefined = DB.getStocks()[mallId];

      // Advisory check against this tab's local copy -- the real guard against
      // overselling is the atomic DB-level decrement below (clamped at 0).
      if (!currentStocks || currentStocks[lot.id] <= 0) {
        console.error("Ghost Stock detected at spin end!");
        setIsSpinning(false);
        setIsValidated(false);
        return;
      }

      const randomGreeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

      const newLog: SpinLog = {
        id: `${Date.now()}-${mallId}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleString('fr-FR'),
        mallId, mallName: currentMall!.name, ticketId,
        // Attach the same ticket photo to every spin's log so admin can see proof on any row.
        ticketPhoto: ticketPhoto || undefined,
        lotWon: lot.id, status: 'Gagné',
        promo: promoTier ?? undefined, spinNumber
      };

      // Saved on the tablet first (survives no-wifi, reloads and restarts), then sent
      // to Supabase in the background: stock -1 as an atomic delta + history row.
      await DB.recordSpin(newLog, data => {
        // Advance the active wheel's cycle
        if (!data.cycles[mallId]) data.cycles[mallId] = {} as any;
        const currentCycle = data.cycles[mallId][wheel] || getMallWheelCycle(mallId, wheel);
        let nextIndex = currentCycle.index + 1;
        let nextCompleted = currentCycle.completed;
        let nextSequence = currentCycle.sequence;

        if (nextIndex >= nextSequence.length) {
          const next = generateNextCycle(mallId, wheel);
          nextSequence = next.sequence;
          nextIndex = next.index;
          nextCompleted = next.completed;
        }

        data.cycles[mallId][wheel] = { sequence: nextSequence, index: nextIndex, completed: nextCompleted };
      });

      // Play win sound
      winSoundRef.current?.play().catch(e => console.log("Audio play failed:", e));
      setSpinResults(prev => [...prev, { lot, aiMessage: randomGreeting }]);
      // For multi-spin promotions, the next spin only starts once the player
      // taps the "spin next prize" button on the intermediate results popup.
    } catch (error) {
      console.error("Error in handleSpinEnd:", error);
    } finally {
      setLoadingMsg(false);
    }
  };

  // Resets the whole session and sends the tablet back to the promo-tier selection screen for the next customer.
  const resetForm = () => {
    setSpinResults([]);
    setPromoTier(null);
    setSpinNumber(1);
    setTicketId(''); setTicketPhoto(null); setIsValidated(false); setIsSpinning(false);
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setAdminLoggedIn(true);
      setPasswordInput('');
    } else {
      alert("Mot de passe administrateur incorrect");
    }
  };

  const dashboardStats = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('fr-FR');
    const todaySpins = logs.filter(l => l.timestamp.startsWith(todayStr)).length;
    const totalStock = Object.values(stocks).reduce((acc, mallStock) => acc + getValidTotalStock(mallStock), 0);
    const alertsCount = Object.values(stocks).reduce((acc, mallStock) =>
      acc + LOTS.filter(l => (mallStock[l.id] || 0) > 0 && (mallStock[l.id] || 0) < 10).length, 0);
    const exhaustedCount = Object.values(stocks).reduce((acc, mallStock) =>
      acc + LOTS.filter(l => (mallStock[l.id] || 0) <= 0).length, 0);
    const totalWheels = malls.reduce((acc, m) => acc + (m.activeWheels || 0), 0);
    return { todaySpins, totalStock, alertsCount, exhaustedCount, totalWheels };
  }, [logs, stocks, malls]);

  const filteredAnalyticsLogs = useMemo(() => {
    const now = new Date();
    const timeframeMs = parseInt(dbTimeframeFilter) * 24 * 60 * 60 * 1000;
    const threshold = new Date(now.getTime() - timeframeMs);
    return logs.filter(log => {
      const logDate = parseLogDate(log.timestamp);
      const passesCity = dbCityFilter === 'all' || (DB.getMalls().find(m => m.id === log.mallId)?.city || OTHER_CITY) === dbCityFilter;
      const passesMall = dbMallFilter === 'all' || log.mallId === dbMallFilter;
      const passesTime = logDate >= threshold;
      const passesPromo = dbPromoFilter === 'all' || log.promo === dbPromoFilter;
      return passesCity && passesMall && passesTime && passesPromo;
    });
  }, [logs, malls, dbCityFilter, dbMallFilter, dbTimeframeFilter, dbPromoFilter]);

  // One spreadsheet row per win: same columns for the Excel export and for copy-paste.
  const EXPORT_HEADERS = ['Date', 'Heure', 'Ville', 'N° magasin', 'Magasin', 'Code SFA', 'Formule', 'Tour', 'Lot gagné', 'N° ticket', 'Photo ticket'];
  const EXPORT_WIDTHS = [12, 10, 14, 11, 34, 16, 20, 8, 32, 12, 14];
  const logToRow = (l: SpinLog) => {
    const mall = mallById.get(l.mallId);
    const tier = TIERS.find(t => t.id === l.promo);
    const [date, time] = l.timestamp.split(' ');
    return {
      date: date ?? '', time: time ?? '', city: mall?.city ?? '', number: mall?.number ?? '',
      store: mall?.name ?? l.mallName, sfa: mall?.sfa ?? '', formula: tier?.label ?? l.promo ?? '',
      tour: tier && l.spinNumber ? `${l.spinNumber}/${tier.spins}` : '', lot: l.lotWon, ticket: String(l.ticketId ?? ''),
      photo: l.ticketPhoto && /^https?:/.test(l.ticketPhoto) ? l.ticketPhoto : '',
    };
  };

  const exportExcel = (data: SpinLog[], filename: string) => {
    const rows = data.map(l => {
      const r = logToRow(l);
      return [r.date, r.time, r.city, typeof r.number === 'number' ? r.number : r.number, r.store, r.sfa, r.formula, r.tour, r.lot, r.ticket,
        r.photo ? { text: 'Voir photo', url: r.photo } : ''];
    });
    downloadExcel(filename, 'Gains', EXPORT_HEADERS, rows, EXPORT_WIDTHS);
  };

  // Copying rows from an admin table puts clean spreadsheet rows on the clipboard
  // (one line per win, one value per column, no images or colours).
  const copyRowsAsTable = (e: React.ClipboardEvent, data: SpinLog[]) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const picked = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLTableRowElement>('tr[data-row]'))
      .filter(tr => range.intersectsNode(tr))
      .map(tr => data[Number(tr.dataset.row)])
      .filter(Boolean);
    if (picked.length === 0) return;
    const rows = picked.map(l => {
      const r = logToRow(l);
      return [r.date, r.time, r.city, String(r.number), r.store, r.sfa, r.formula, r.tour, r.lot, r.ticket, r.photo];
    });
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const tsv = [EXPORT_HEADERS, ...rows].map(r => r.map(c => c.replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
    const html = `<table><tr>${EXPORT_HEADERS.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    e.clipboardData.setData('text/plain', tsv);
    e.clipboardData.setData('text/html', html);
    e.preventDefault();
  };

  const logsWithPhotos = useMemo(() => logs.filter(l => !!l.ticketPhoto), [logs]);

  const nextImage = () => setSelectedLogIndex(prev => (prev + 1) % logsWithPhotos.length);
  const prevImage = () => setSelectedLogIndex(prev => (prev - 1 + logsWithPhotos.length) % logsWithPhotos.length);
  const openGallery = (logId: string) => {
    const index = logsWithPhotos.findIndex(l => l.id === logId);
    if (index !== -1) {
      setSelectedLogIndex(index);
      setIsGalleryOpen(true);
    }
  };

  // --- Admin Views ---
  // Wins table shared by "Gains en direct" and "Historique des gains".
  // First column = date/time with a small green check (authenticated); store names wrap in full.
  const renderWinsTable = (rows: SpinLog[], opts: { maxHeight: string; timeOnly?: boolean; highlightFirst?: boolean }) => (
    <div className="admin-card rounded-2xl overflow-hidden" onCopy={(e) => copyRowsAsTable(e, rows)}>
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: opts.maxHeight }}>
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-black text-white text-[10px] md:text-[11px] uppercase tracking-[0.14em] font-black sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3.5 whitespace-nowrap">{opts.timeOnly ? 'Heure' : 'Date'}</th>
              <th className="px-4 py-3.5">Point de vente</th>
              <th className="px-4 py-3.5">Formule</th>
              <th className="px-4 py-3.5">Lot gagné</th>
              <th className="px-4 py-3.5 text-center">Ticket</th>
              <th className="px-4 py-3.5 text-center">Preuve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-black/35 font-bold text-sm">Aucun gain pour le moment</td></tr>
            )}
            {rows.map((log, i) => {
              const mall = mallById.get(log.mallId);
              const lot = LOTS.find(l => l.id === log.lotWon);
              const [datePart, timePart] = log.timestamp.split(' ');
              return (
                <tr key={log.id ?? i} data-row={i} className={`hover:bg-black/[0.03] transition-colors ${opts.highlightFirst && i === 0 ? 'bg-[#D70B0E]/[0.04]' : ''}`}>
                  <td className="px-4 py-3 whitespace-nowrap align-middle">
                    <div className="flex items-center gap-2.5">
                      <span title="Authentifié" className="shrink-0 w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center shadow-sm">
                        <Icon name="check" className="w-3 h-3" strokeWidth={3.5} />
                      </span>
                      <div className="leading-tight">
                        {!opts.timeOnly && <div className="text-[11px] text-black/45 font-bold">{datePart}</div>}
                        <div className={`font-mono font-black text-sm ${opts.highlightFirst && i === 0 ? 'text-[#D70B0E]' : 'text-black'}`}>{timePart}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[200px] align-middle">
                    <div className="font-black text-black text-sm leading-snug break-words">{mall?.name ?? log.mallName}</div>
                    <StoreTag mall={mall} className="mt-1" />
                  </td>
                  <td className="px-4 py-3 align-middle"><PromoBadge log={log} /></td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2.5 min-w-[150px]">
                      {lot && <LotThumb lot={lot} className="w-10 h-10 shrink-0 !p-1 !bg-black/[0.04]" />}
                      <span className="font-black text-[#D70B0E] text-sm leading-tight">{log.lotWon}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center align-middle"><span className="inline-block bg-black/5 rounded-lg px-2.5 py-1 font-mono font-black text-black/70 text-xs">#{log.ticketId}</span></td>
                  <td className="px-4 py-3 text-center align-middle">
                    {log.ticketPhoto ? (
                      <button onClick={() => openGallery(log.id)} title="Voir la photo du ticket" className="inline-block rounded-lg ring-2 ring-black/10 hover:ring-[#D70B0E] transition overflow-hidden">
                        <img src={log.ticketPhoto} alt="Ticket" className="w-10 h-10 object-cover" />
                      </button>
                    ) : (
                      <span className="text-black/25 text-[10px] uppercase font-black tracking-widest">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDashboard = () => {
    // Highlight cards first (solid red / black), then the rest in white.
    const stats: { label: string; val: number; icon: string; tone: 'red' | 'black' | 'light'; tile?: 'red' | 'black' }[] = [
      { label: "Gains aujourd'hui", val: dashboardStats.todaySpins, icon: 'trend', tone: 'red' },
      { label: 'Stock global', val: dashboardStats.totalStock, icon: 'box', tone: 'black' },
      { label: 'Alertes stock', val: dashboardStats.alertsCount, icon: 'alert', tone: 'light', tile: 'red' },
      { label: 'Épuisés', val: dashboardStats.exhaustedCount, icon: 'empty', tone: 'light', tile: 'red' },
      { label: 'Magasins', val: malls.length, icon: 'store', tone: 'light', tile: 'black' },
      { label: 'Villes', val: mallsByCity.length, icon: 'pin', tone: 'light', tile: 'black' },
      { label: 'Roues live', val: dashboardStats.totalWheels, icon: 'wheel', tone: 'light', tile: 'black' },
    ];
    const toneClass = { red: 'bg-[#D70B0E] text-white border-2 border-white shadow-[0_12px_28px_rgba(215,11,14,0.35)]', black: 'bg-black text-white border-2 border-white shadow-[0_12px_28px_rgba(0,0,0,0.3)]', light: 'admin-card text-black' };

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
          {stats.map((s, i) => (
            <div key={i} className={`relative overflow-hidden rounded-2xl p-4 md:p-5 group hover:-translate-y-0.5 transition-transform ${toneClass[s.tone]}`}>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.tone !== 'light' ? 'bg-white/20 text-white' : s.tile === 'red' ? 'bg-[#D70B0E] text-white' : 'bg-black text-white'}`}>
                <Icon name={s.icon} className="w-5 h-5" />
              </span>
              <div className="mt-4 text-3xl md:text-[2rem] font-black leading-none">{s.val.toLocaleString('fr-FR')}</div>
              <div className={`mt-1.5 text-[10px] md:text-[11px] uppercase tracking-[0.12em] font-black ${s.tone === 'light' ? 'text-black/45' : 'text-white/75'}`}>{s.label}</div>
              <Icon name={s.icon} className={`absolute -right-4 -bottom-4 w-24 h-24 pointer-events-none ${s.tone === 'light' ? 'text-black/[0.05]' : 'text-white/[0.12]'}`} strokeWidth={1.5} />
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="inline-flex bg-white rounded-2xl border border-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] px-4 py-3">
            <AdminSectionTitle icon="gift" tone="red" live title="Gains en direct" subtitle="Les 30 derniers gains, tous magasins, mis à jour en temps réel" />
          </div>
          {renderWinsTable(logs.slice(0, 30), { maxHeight: '420px', timeOnly: true, highlightFirst: true })}
        </div>

        <div className="space-y-4">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 md:p-5 rounded-2xl border border-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
            <AdminSectionTitle icon="history" title="Historique des gains" subtitle={`${filteredAnalyticsLogs.length} gain(s) · filtrer par période, ville, magasin et formule`} />
            <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
              <select value={dbTimeframeFilter} onChange={(e) => setDbTimeframeFilter(e.target.value)} className="admin-select !w-auto">
                <option value="1">Aujourd'hui</option><option value="3">3 jours</option><option value="7">7 jours</option><option value="15">15 jours</option><option value="30">30 jours</option>
              </select>
              <select value={dbCityFilter} onChange={(e) => { setDbCityFilter(e.target.value); setDbMallFilter('all'); }} className="admin-select !w-auto">
                <option value="all">Toutes les villes</option>
                {mallsByCity.map(g => <option key={g.city} value={g.city}>{g.city}</option>)}
              </select>
              <select value={dbMallFilter} onChange={(e) => setDbMallFilter(e.target.value)} className="admin-select !w-auto max-w-[260px]">
                <option value="all">Tous les magasins</option>
                {mallsByCity.filter(g => dbCityFilter === 'all' || g.city === dbCityFilter).map(g => (
                  <optgroup key={g.city} label={g.city}>
                    {g.malls.map(m => <option key={m.id} value={m.id}>N°{m.number ?? '—'} · {m.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <select value={dbPromoFilter} onChange={(e) => setDbPromoFilter(e.target.value)} className="admin-select !w-auto">
                <option value="all">Toutes les formules</option>
                {TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <button onClick={() => exportExcel(filteredAnalyticsLogs, `gains_${dbCityFilter === 'all' ? 'toutes-villes' : dbCityFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`)}
                className="btn-3d btn-black px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <Icon name="download" className="w-4 h-4" /> Export Excel
              </button>
            </div>
          </div>
          {renderWinsTable(filteredAnalyticsLogs, { maxHeight: '620px' })}
        </div>
      </div>
    );
  };

  const renderSearchBar = (placeholder: string, extra?: React.ReactNode) => (
    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <div className="relative w-full md:w-96">
        <Icon name="search" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40" />
        <input type="text" placeholder={placeholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="admin-input !pl-10" />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/35 hover:text-black text-[10px] font-black uppercase">Effacer</button>
        )}
      </div>
      <div className="text-[11px] uppercase font-black text-black/40 tracking-[0.15em]">{extra ?? `${filteredMalls.length} magasin(s)`}</div>
    </div>
  );

  const renderPerformance = () => (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {renderSearchBar('Rechercher un magasin, une ville, un code SFA…')}

      <div className="space-y-8">
        {groupByCity(filteredMalls).map(({ city, malls: cityMalls }) => (
          <div key={city} className="space-y-4">
            <CityHeader city={city} count={cityMalls.length} />
            <div className="grid grid-cols-1 gap-5">
              {cityMalls.map(mall => {
                const mallLogs = logs.filter(l => l.mallId === mall.id);
                return (
                  <div key={mall.id} className="admin-card p-5 md:p-6 rounded-2xl">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-5 pb-5 border-b border-black/5">
                      <div className="min-w-0">
                        <h3 className="text-lg md:text-xl text-black font-black uppercase tracking-wide break-words">{mall.name}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StoreTag mall={mall} />
                          <span className="px-2.5 py-0.5 rounded-full bg-black text-white text-[10px] md:text-xs font-black uppercase">{mallLogs.length} gain(s)</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {SPIN_STAGES.map(spin => {
                          const wheel = wheelForSpin(spin);
                          const cycle = getMallWheelCycle(mall.id, wheel);
                          return (
                            <div key={wheel} className="flex items-center gap-3 pl-4 pr-2 py-2 rounded-xl bg-black/[0.04] border border-black/5">
                              <div className="leading-tight">
                                <div className="text-[10px] text-black/45 font-black uppercase tracking-wider">Cycle tour {spin}</div>
                                <div className="text-lg font-mono font-black text-black">{cycle.index}<span className="text-black/25">/{cycle.sequence.length}</span></div>
                              </div>
                              <button
                                onClick={() => { if (confirm(`Réinitialiser le cycle du tour ${spin} pour ce magasin ?`)) DB.updateCycle(mall.id, wheel, { ...cycle, index: 0, completed: 0 }); }}
                                className="w-8 h-8 rounded-lg bg-white border border-black/10 flex items-center justify-center text-black/40 hover:text-white hover:bg-[#D70B0E] hover:border-[#D70B0E] transition-colors"
                                title={`Réinitialiser le cycle du tour ${spin}`}
                              >
                                <Icon name="reset" className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                      {LOTS.map(lot => {
                        const itemsWon = mallLogs.filter(log => log.lotWon === lot.id).length;
                        return (
                          <div key={lot.id} className="relative p-3 rounded-xl border border-black/5 bg-black/[0.02] flex flex-col items-center text-center">
                            <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase ${SPIN_BADGE_STYLES[lot.spin]}`}>T{lot.spin}</span>
                            <LotThumb lot={lot} className="w-14 h-14 mb-2 !bg-transparent !shadow-none" />
                            <span className={`text-2xl font-mono font-black ${itemsWon > 0 ? 'text-[#D70B0E]' : 'text-black/25'}`}>{itemsWon}</span>
                            <span className="text-[10px] uppercase text-black/50 font-black mt-1 leading-tight">{lot.label.replace('\n', ' ')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderMalls = () => (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {renderSearchBar('Rechercher un magasin, une ville, un code SFA…')}

      <div className="space-y-8">
        {groupByCity(filteredMalls).map(({ city, malls: cityMalls }) => (
          <div key={city} className="space-y-4">
            <CityHeader city={city} count={cityMalls.length} />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {cityMalls.map((mall) => (
                <div key={mall.id} className="admin-card p-5 rounded-2xl hover:-translate-y-0.5 transition-transform">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="shrink-0 w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center"><Icon name="store" className="w-5 h-5" /></span>
                    <div className="min-w-0 flex-1">
                      <StoreTag mall={mall} />
                      <input type="text" value={mall.name} onChange={(e) => DB.updateMall({ ...mall, name: e.target.value })}
                        className="mt-1.5 w-full bg-transparent text-base md:text-lg text-black font-black outline-none border-b-2 border-transparent hover:border-black/10 focus:border-[#D70B0E] transition-colors" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="flex items-center gap-1.5 text-[10px] uppercase text-black/45 font-black tracking-wider mb-1"><Icon name="key" className="w-3.5 h-3.5" /> Code d’accès</span>
                      <input type="text" value={mall.password} onChange={(e) => DB.updateMall({ ...mall, password: e.target.value })} className="admin-input font-mono !text-[#D70B0E] text-center" />
                    </label>
                    <label className="block">
                      <span className="flex items-center gap-1.5 text-[10px] uppercase text-black/45 font-black tracking-wider mb-1"><Icon name="ticket" className="w-3.5 h-3.5" /> Code SFA</span>
                      <input type="text" value={mall.sfa ?? ''} placeholder="—" onChange={(e) => DB.updateMall({ ...mall, sfa: e.target.value || undefined })} className="admin-input font-mono text-center" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderInventory = () => (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {renderSearchBar('Rechercher un magasin, une ville, un code SFA…')}

      <div className="space-y-8">
        {groupByCity(filteredMalls).map(({ city, malls: cityMalls }) => (
          <div key={city} className="space-y-4">
            <CityHeader city={city} count={cityMalls.length} />
            <div className="grid grid-cols-1 gap-5">
              {cityMalls.map(mall => {
                const mallTotal = LOTS.reduce((sum, l) => sum + Math.max(0, stocks[mall.id]?.[l.id] ?? 0), 0);
                return (
                  <div key={mall.id} className="admin-card p-5 md:p-6 rounded-2xl">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-black/5">
                      <div className="min-w-0">
                        <h3 className="text-lg md:text-xl text-black font-black uppercase tracking-wide break-words">{mall.name}</h3>
                        <StoreTag mall={mall} className="mt-1.5" />
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black text-white">
                        <Icon name="box" className="w-4 h-4" />
                        <span className="text-sm font-black">{mallTotal}</span>
                        <span className="text-[10px] uppercase font-black text-white/60">lots en stock</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                      {SPIN_STAGES.map(spin => (
                        <div key={spin} className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${SPIN_BADGE_STYLES[spin]}`}>Tour {spin}</span>
                            <span className="text-[10px] text-black/45 font-bold">{SPIN_STAGE_HINT[spin]}</span>
                          </div>
                          {getSpinLots(spin).map(lot => {
                            const currentStock = stocks[mall.id]?.[lot.id] || 0;
                            const state = currentStock <= 0 ? 'out' : currentStock <= 2 ? 'low' : 'ok';
                            return (
                              <div key={lot.id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${state === 'out' ? 'border-[#D70B0E]/40 bg-[#D70B0E]/[0.04]' : 'border-black/5 bg-black/[0.02]'}`}>
                                <LotThumb lot={lot} className="w-11 h-11 shrink-0 !p-1 !bg-white !shadow-none" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-black text-black leading-tight">{lot.label.replace('\n', ' ')}</div>
                                  {state === 'out' && <span className="text-[10px] font-black uppercase text-[#D70B0E]">Épuisé</span>}
                                  {state === 'low' && <span className="text-[10px] font-black uppercase text-black/50">Presque épuisé</span>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => DB.adjustStock(mall.id, lot.id as LotType, -1)}
                                    className="w-8 h-8 rounded-lg bg-white border border-black/10 flex items-center justify-center text-black/50 hover:bg-black hover:text-white transition-colors text-lg leading-none">−</button>
                                  <input type="number" value={currentStock}
                                    onChange={(e) => DB.updateStock(mall.id, lot.id as LotType, parseInt(e.target.value) || 0)}
                                    className={`w-14 text-center text-lg font-mono font-black bg-transparent outline-none border-b-2 border-transparent focus:border-[#D70B0E] ${state === 'out' ? 'text-[#D70B0E]' : 'text-black'}`} />
                                  <button onClick={() => DB.adjustStock(mall.id, lot.id as LotType, 1)}
                                    className="w-8 h-8 rounded-lg bg-white border border-black/10 flex items-center justify-center text-black/50 hover:bg-[#D70B0E] hover:text-white hover:border-[#D70B0E] transition-colors text-lg leading-none">+</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {[
          { title: 'Aujourd’hui', days: 1 },
          { title: '7 derniers jours', days: 7 },
          { title: '30 derniers jours', days: 30 },
        ].map(({ title, days }) => {
          const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
          const rows = logs.filter(l => parseLogDate(l.timestamp).getTime() >= threshold);
          return (
            <div key={title} className="admin-card p-6 rounded-2xl flex flex-col">
              <span className="w-11 h-11 rounded-xl bg-black text-white flex items-center justify-center mb-4"><Icon name="file" className="w-5 h-5" /></span>
              <h3 className="text-lg text-black font-black uppercase tracking-wide">{title}</h3>
              <p className="text-xs text-black/45 font-bold mb-5">{rows.length} gain(s) · tous magasins</p>
              <button onClick={() => exportExcel(rows, `gains_${days}j_${new Date().toISOString().slice(0, 10)}.xlsx`)} className="mt-auto btn-3d btn-black w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2">
                <Icon name="download" className="w-4 h-4" /> Télécharger Excel
              </button>
            </div>
          );
        })}
        <div className="p-6 rounded-2xl flex flex-col bg-[#D70B0E] text-white border-2 border-white shadow-[0_12px_28px_rgba(215,11,14,0.35)]">
          <span className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center mb-4"><Icon name="flame" className="w-5 h-5" /></span>
          <h3 className="text-lg font-black uppercase tracking-wide">Réinitialisation</h3>
          <p className="text-xs text-white/75 font-bold mb-5">Efface TOUTES les données : gains, stocks et cycles.</p>
          <button onClick={() => { if (confirm("⚠️ ATTENTION: Voulez-vous vraiment réinitialiser TOUT le système ? (Stocks, Logs, Cycles)")) DB.factoryReset(); }}
            className="mt-auto btn-3d btn-black w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider">Tout réinitialiser</button>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => {
    const toggles: { key: 'showChangeStore' | 'showChangeCity'; title: string; label: string; where: string }[] = [
      { key: 'showChangeStore', title: 'Bouton « Changer de magasin »', label: 'بدّل المحل', where: 'Écran des 3 offres (en bas) et écran du code d’accès' },
      { key: 'showChangeCity', title: 'Bouton « Changer de ville »', label: 'بدّل المدينة', where: 'Écran de choix du magasin' },
    ];
    return (
      <div className="space-y-5 animate-in fade-in duration-500 pb-20 max-w-3xl">
        {!DB.settingsAvailable && (
          <div className="p-4 rounded-2xl bg-[#D70B0E] text-white border-2 border-white shadow-md text-sm font-bold">
            ⚠️ Réglages non enregistrables : exécutez une fois <span className="font-mono">supabase/add_app_settings.sql</span> dans Supabase → SQL Editor. En attendant, tous les boutons restent visibles.
          </div>
        )}
        {toggles.map(t => {
          const on = settings[t.key];
          return (
            <div key={t.key} className="admin-card p-5 rounded-2xl flex items-center gap-4">
              <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white ${on ? 'bg-black' : 'bg-black/25'}`}><Icon name="store" className="w-5 h-5" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base md:text-lg text-black font-black leading-tight">{t.title}</h3>
                <p className="text-xs text-black/45 font-bold mt-0.5">{t.where}</p>
                <span dir="rtl" className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-black font-arabic ${on ? 'bg-black text-white' : 'bg-black/10 text-black/40 line-through'}`}>{t.label}</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button role="switch" aria-checked={on} aria-label={t.title}
                  onClick={async () => { if (!(await DB.setSetting(t.key, !on))) alert('❌ Échec de l’enregistrement. Vérifiez que supabase/add_app_settings.sql a été exécuté.'); }}
                  className={`relative w-16 h-9 rounded-full border-2 border-white shadow-md transition-colors ${on ? 'bg-green-500' : 'bg-black/30'}`}>
                  <span className={`absolute top-0.5 w-7 h-7 rounded-full bg-white shadow transition-all ${on ? 'left-[calc(100%-1.9rem)]' : 'left-0.5'}`} />
                </button>
                <span className={`text-[10px] font-black uppercase tracking-wider ${on ? 'text-green-600' : 'text-black/40'}`}>{on ? 'Affiché' : 'Masqué'}</span>
              </div>
            </div>
          );
        })}
        <p className="text-xs text-black/45 font-bold px-1">Les tablettes appliquent le changement en quelques secondes, sans recharger la page.</p>
      </div>
    );
  };

  const renderGalleryModal = () => {
    if (!isGalleryOpen || logsWithPhotos.length === 0) return null;
    const currentLog = logsWithPhotos[selectedLogIndex];

    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-white/95 backdrop-blur-3xl animate-in fade-in transition-all duration-300">
        <div className="absolute top-8 right-8 z-[1010] flex gap-4">
          <button onClick={() => setIsGalleryOpen(false)} className="w-12 h-12 rounded-full bg-[#D70B0E]/10 hover:bg-red-500 hover:text-white text-black flex items-center justify-center transition-all border-2 border-[#D70B0E]/40 hover:scale-110">
            <span className="text-2xl">✕</span>
          </button>
        </div>

        <button onClick={prevImage} className="absolute left-4 md:left-8 z-[1010] w-14 h-14 rounded-full bg-[#D70B0E]/10 hover:bg-[#D70B0E] text-black hover:text-white flex items-center justify-center transition-all border-2 border-[#D70B0E]/30 group">
          <span className="text-3xl group-hover:scale-125 transition-transform">←</span>
        </button>

        <div className="relative w-full max-w-4xl h-full flex flex-col items-center justify-center p-4 md:p-8">
          <div className="relative group w-full h-[45vh] md:h-[50vh] flex items-center justify-center">
            <img
              key={currentLog.id}
              src={currentLog.ticketPhoto}
              alt={`Ticket ${currentLog.ticketId}`}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 fade-in duration-500 border-2 border-[#D70B0E]/10"
            />
          </div>

          <div className="mt-4 md:mt-6 text-center space-y-2 bg-white/80 backdrop-blur-xl p-4 md:p-6 rounded-3xl border-2 border-[#D70B0E]/50 shadow-2xl animate-in slide-in-from-bottom-4 duration-700 max-w-xl w-full">
            <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
              <span className="px-4 py-1.5 bg-[#D70B0E]/20 text-[#D70B0E] rounded-full text-[10px] md:text-xs font-black uppercase tracking-[0.2em] border-2 border-[#D70B0E]/50">Photo {selectedLogIndex + 1} / {logsWithPhotos.length}</span>
              <span className="px-4 py-1.5 bg-green-500/20 text-green-400 rounded-full text-[10px] md:text-xs font-black uppercase tracking-[0.2em] border border-green-500/30">Authentifié</span>
              <PromoBadge log={currentLog} />
            </div>

            <h3 className="text-2xl md:text-3xl font-mono font-black text-black tracking-widest drop-shadow-md pb-1 border-b-2 border-[#D70B0E]/30 mb-2">
              #{currentLog.ticketId}
            </h3>

            <div className="grid grid-cols-2 gap-3 text-left pt-1">
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase text-black/30 font-black tracking-widest">Magasin</span>
                <p className="text-xs md:text-sm font-bold text-black uppercase">{currentLog.mallName}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase text-black/30 font-black tracking-widest">Lot Gagner</span>
                <p className="text-xs md:text-sm font-bold text-[#D70B0E] uppercase">{currentLog.lotWon}</p>
              </div>
              <div className="col-span-2 space-y-0.5 pt-1">
                <span className="text-[9px] uppercase text-black/30 font-black tracking-widest">Date & Heure</span>
                <p className="text-xs md:text-sm font-mono text-black/70">{currentLog.timestamp}</p>
              </div>
            </div>
          </div>
        </div>

        <button onClick={nextImage} className="absolute right-4 md:right-8 z-[1010] w-14 h-14 rounded-full bg-[#D70B0E]/10 hover:bg-[#D70B0E] text-black hover:text-white flex items-center justify-center transition-all border-2 border-[#D70B0E]/30 group">
          <span className="text-3xl group-hover:scale-125 transition-transform">→</span>
        </button>
      </div>
    );
  };

  // --- Main Views (Render Functions to avoid remounting bug) ---
  const renderClientView = () => {
    if (!assetsLoaded) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <div className="w-full max-w-md space-y-6 md:space-y-8 animate-in fade-in zoom-in-95 duration-700">
            <div className="relative w-full h-2.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-white rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.6)]"
                style={{ width: `${loadProgress}%` }}
              ></div>
            </div>
            <p dir="rtl" className="font-arabic text-sm md:text-base text-white font-black" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>كنوجدو اللعبة... {loadProgress}%</p>
          </div>
        </div>
      );
    }

    if (!isMallLoggedIn || !currentMall) {
      return (
        <div dir="rtl" className="font-arabic min-h-screen flex justify-center px-4 pb-8 md:px-8 relative overflow-hidden">
          <div className="w-full max-w-6xl z-10 flex flex-col items-center">
            <div className="bg-title-space" />
            {!currentMall && !selectedCity ? (
              // Step 1: choose the city
              <div className="w-full max-w-5xl px-2 md:px-0">
                <StepHeader step={1} title="ختار المدينة ديالك" />
                <div className="flex flex-wrap justify-center gap-4 md:gap-6">
                  {mallsByCity.map(({ city, malls: cityMalls }, i) => (
                    <button key={city} onClick={() => setSelectedCity(city)}
                      style={{ animationDelay: `${i * 60}ms` }}
                      className="animate-pop-in group relative overflow-hidden basis-[calc(50%-8px)] md:basis-[calc(33.333%-16px)] lg:basis-[calc(25%-18px)] rounded-[2rem] bg-white/95 backdrop-blur px-4 pt-7 pb-5 md:pt-8 md:pb-6 flex flex-col items-center text-center ring-2 ring-[#D70B0E]/15 shadow-[0_10px_30px_rgba(215,11,14,0.18)] hover:ring-[#D70B0E] hover:-translate-y-1.5 hover:shadow-[0_18px_40px_rgba(215,11,14,0.32)] active:scale-[0.97] transition-all duration-300">
                      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#D70B0E]/15 to-transparent pointer-events-none" />
                      <span className="absolute top-3 left-3 w-8 h-8 rounded-full bg-[#D70B0E]/10 text-[#D70B0E] flex items-center justify-center font-black text-sm group-hover:bg-[#D70B0E] group-hover:text-white transition-colors">←</span>
                      <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full bg-white p-1 shadow-[0_8px_20px_rgba(0,0,0,0.18)] mb-4 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                        <img src="/assets/images/morocco.webp" alt="" className="w-full h-full object-contain" />
                      </div>
                      <span className="relative text-black font-black text-xl md:text-3xl leading-tight">{cityAr(city)}</span>
                      <span className="relative mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D70B0E]/10 text-[#D70B0E] text-xs md:text-sm font-black group-hover:bg-[#D70B0E] group-hover:text-white transition-colors">
                        {storesCountAr(cityMalls.length)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : !currentMall ? (
              // Step 2: choose the store in that city
              <div className="w-full max-w-5xl px-2 md:px-0">
                <StepHeader step={2} title={cityAr(selectedCity ?? undefined)} onBack={settings.showChangeCity ? () => setSelectedCity(null) : undefined} backLabel="بدّل المدينة" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                  {(mallsByCity.find(g => g.city === selectedCity)?.malls ?? []).map((mall, i) => (
                    <button key={mall.id} onClick={() => setCurrentMall(mall)}
                      style={{ animationDelay: `${i * 50}ms` }}
                      className="animate-pop-in group relative flex items-center gap-4 text-right rounded-[1.75rem] bg-white/95 backdrop-blur p-3 pl-4 md:p-4 md:pl-5 ring-2 ring-[#D70B0E]/15 shadow-[0_10px_30px_rgba(215,11,14,0.15)] hover:ring-[#D70B0E] hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(215,11,14,0.3)] active:scale-[0.98] transition-all duration-300">
                      <div className="shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-[#FFFFFF] to-[#FDE2E3] flex items-center justify-center p-2 group-hover:scale-105 transition-transform duration-300">
                        <img src="/assets/images/storeimage.webp" alt="" className="w-full h-full object-contain drop-shadow-md" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-xs md:text-sm font-black text-[#D70B0E]">المحل رقم {mall.number ?? '—'}</span>
                        <span dir="ltr" className="block mt-1 text-black font-black text-sm md:text-base leading-tight break-words text-right">{mall.name}</span>
                        {mall.sfa && <span dir="ltr" className="inline-block mt-2 px-2 py-0.5 rounded-md bg-black/5 text-black/50 font-mono font-bold text-[10px] md:text-xs">{mall.sfa}</span>}
                      </div>
                      <span className="shrink-0 w-9 h-9 rounded-full bg-[#D70B0E]/10 text-[#D70B0E] flex items-center justify-center font-black text-sm group-hover:bg-[#D70B0E] group-hover:text-white transition-colors">←</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // Step 3: access code
              <div className="w-full max-w-sm md:max-w-md bg-white p-10 md:p-16 rounded-[3rem] md:rounded-[4rem] border-4 md:border-[6px] border-[#D70B0E] text-center shadow-2xl">
                {settings.showChangeStore && (
                  <>
                    <button onClick={() => { setSelectedCity(currentMall.city ?? null); setCurrentMall(null); }} className="btn-3d btn-black mb-8 md:mb-10 px-8 py-3 rounded-full text-sm md:text-base font-black">→ بدّل المحل</button>
                    <br />
                  </>
                )}
                <span className="inline-block mb-5 px-4 py-1 rounded-full bg-[#D70B0E] text-white text-xs md:text-sm font-black shadow-md">المرحلة 3 من 3</span>
                <div className="w-24 h-24 md:w-28 md:h-28 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-[#FFFFFF] to-[#FDE2E3] flex items-center justify-center p-3">
                  <img src="/assets/images/storeimage.webp" alt="" className="w-full h-full object-contain drop-shadow-md" />
                </div>
                {currentMall.city && <p className="text-[#D70B0E] font-black text-sm md:text-base mb-1">{cityAr(currentMall.city)}</p>}
                <h2 dir="ltr" className="text-xl md:text-2xl text-black mb-8 md:mb-10 font-black">{currentMall.name}</h2>
                <form onSubmit={handleMallLogin} className="space-y-6 md:space-y-10">
                  <input type="password" inputMode="numeric" value={passwordInput} autoFocus onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="كود الدخول" className="w-full bg-white border-2 md:border-4 border-[#D70B0E]/40 p-4 md:p-6 rounded-2xl text-black text-center text-2xl md:text-3xl outline-none focus:border-[#D70B0E]" />
                  <button type="submit" className="btn-3d w-full py-4 md:py-5 nutella-gradient text-white font-black rounded-2xl shadow-xl text-lg md:text-xl">دخول</button>
                </form>
              </div>
            )}
          </div>
        </div>
      );
    }

    const mallId = currentMall.id;
    const currentStocks: Record<string, number> | undefined = stocks[mallId];
    const mallCycle = getMallWheelCycle(mallId, currentWheel);
    const currentTier = getTier(promoTier ?? TIERS[0].id);
    const eligibleLotIds: LotType[] = getSpinLots(spinOfWheel(currentWheel)).map(l => l.id);

    // Prizes left in this store for a given spin number.
    const spinStock = (spin: SpinStage) =>
      getSpinLots(spin).reduce((sum, lot) => sum + Math.max(0, currentStocks?.[lot.id] ?? 0), 0);
    // How many more customers a promotion can serve: every one of its spins needs a prize,
    // so it's limited by the emptiest spin group among spins 1..N.
    const tierStock = (tierId: PromoTier) =>
      Math.min(...SPIN_STAGES.filter(s => s <= getTier(tierId).spins).map(spinStock));
    const tierAvailable = (tierId: PromoTier) => tierStock(tierId) > 0;
    const promoHasStock = promoTier ? tierAvailable(promoTier) : false;

    // Dynamic target lot calculation
    let targetLotId = eligibleLotIds[0];

    if (currentStocks) {
      let currentValidIndex = mallCycle.index;
      while (currentValidIndex < mallCycle.sequence.length && currentStocks[mallCycle.sequence[currentValidIndex]] <= 0) {
        currentValidIndex++;
      }

      if (currentValidIndex < mallCycle.sequence.length) {
        targetLotId = mallCycle.sequence[currentValidIndex];
      } else {
        // Fallback: cycle is completely exhausted but UI hasn't regenerated next cycle yet.
        // Guarantee we pick an item that physically holds stock, restricted to this wheel's pool.
        const availableLot = eligibleLotIds.find(id => currentStocks[id] > 0);
        targetLotId = availableLot ?? targetLotId;
      }
    }

    const totalSpins = currentTier.spins;
    const showIntermediateResult = !!promoTier && spinResults.length === spinNumber && spinResults.length < totalSpins;
    const showFinalResult = !!promoTier && spinResults.length > 0 && spinResults.length === totalSpins;

    return (
      <div dir="rtl" className="font-arabic min-h-screen flex flex-col items-center pb-6 md:pb-8 px-4 md:px-8 relative overflow-x-hidden">
        <WinCelebration active={showIntermediateResult || showFinalResult} />
        <header className="text-center mb-3 md:mb-6 z-10 w-full px-4">
          <div className="bg-title-space" />
          <p className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/90 shadow-md text-sm md:text-base text-[#D70B0E] font-black">
            <span dir="ltr">{currentMall?.name}</span>
            {currentMall?.city && <><span>·</span><span>{cityAr(currentMall.city)}</span></>}
          </p>
        </header>
        <main className="z-10 w-full flex-grow flex flex-col items-center justify-start max-w-full">
          {!promoTier ? (
            <div className="w-full max-w-5xl mx-auto text-center flex-grow flex flex-col">
              <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 items-stretch">
                {TIERS.map((tier, i) => {
                  const available = tierAvailable(tier.id);
                  const left = tierStock(tier.id);
                  // The more spins a promotion gives, the bigger its jar.
                  const jarHeight = ['52%', '76%', '100%'][i] ?? '100%';
                  return (
                    <button key={tier.id} dir="rtl"
                      onClick={() => available && setPromoTier(tier.id)}
                      disabled={!available}
                      style={{ animationDelay: `${i * 0.1}s` }}
                      className={`font-arabic animate-pop-in group relative overflow-hidden flex flex-col items-center text-center rounded-2xl sm:rounded-[2rem] md:rounded-[2.5rem] p-2.5 sm:p-5 md:p-7 transition-all duration-300 ${available
                        ? 'bg-white ring-2 ring-[#D70B0E]/20 shadow-[0_12px_32px_rgba(215,11,14,0.18)] hover:ring-[#D70B0E] hover:-translate-y-1.5 hover:shadow-[0_20px_44px_rgba(215,11,14,0.3)] active:scale-[0.98]'
                        : 'bg-gray-100 ring-2 ring-gray-300 opacity-70 cursor-not-allowed'}`}
                    >
                      <div className={`absolute inset-x-0 top-0 h-40 pointer-events-none bg-gradient-to-b ${available ? 'from-[#D70B0E]/12' : 'from-gray-300/40'} to-transparent`} />
                      <span className={`absolute top-2 left-2 sm:top-3 sm:left-3 z-10 text-[9px] sm:text-[11px] md:text-xs font-black px-2 sm:px-3 py-1 rounded-full ${available ? 'bg-green-500/10 text-green-700' : 'bg-gray-300 text-gray-500'}`}>
                        {available ? `باقي ${left} فرصة` : 'سالا الستوك'}
                      </span>

                      {/* Jar grows with the number of spins */}
                      <div className="relative w-full h-24 sm:h-36 md:h-52 flex items-end justify-center mb-3 sm:mb-4 mt-6 sm:mt-4">
                        <div className="absolute bottom-0 w-2/3 h-4 rounded-[50%] bg-black/15 blur-md" />
                        <img src="/assets/images/Nutella-PNG-Images-HD.webp" alt="Nutella"
                          style={{ height: jarHeight }}
                          className={`relative w-auto object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.25)] transition-transform duration-300 ${available ? 'group-hover:scale-105 group-hover:-rotate-3' : 'grayscale'}`} />
                      </div>

                      <h3 className={`relative text-sm sm:text-xl md:text-2xl font-black leading-snug mb-2 sm:mb-3 ${available ? 'text-[#000000]' : 'text-gray-400'}`}>{tier.titleAr}</h3>

                      <div className={`relative inline-flex flex-wrap justify-center items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 rounded-full mb-3 sm:mb-5 text-[11px] sm:text-sm md:text-base font-black ${available ? 'bg-[#D70B0E] text-white' : 'bg-gray-300 text-gray-500'}`}>
                        <span>{tier.spinsAr}</span>
                        <span className="flex gap-1" dir="ltr">
                          {Array.from({ length: tier.spins }).map((_, s) => (
                            <span key={s} className={`w-2.5 h-2.5 rounded-full ${available ? 'bg-white' : 'bg-gray-400'}`} />
                          ))}
                        </span>
                      </div>

                      <span className={`relative mt-auto btn-3d w-full py-2.5 md:py-4 font-black rounded-xl md:rounded-2xl text-center text-sm md:text-lg transition-transform ${available ? 'nutella-gradient text-white group-hover:scale-105' : 'bg-gray-300 text-gray-500'}`}>
                        {available ? 'اختار' : 'ما متوفرش'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Pushed to the very bottom of the screen, away from the boxes */}
              {settings.showChangeStore && (
                <button onClick={handleMallLogout} className="btn-3d btn-black mt-auto self-center translate-y-0 px-6 py-2.5 rounded-full text-sm md:text-base font-black">بدّل المحل</button>
              )}
            </div>
          ) : !isValidated ? (
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 md:p-8 animate-in fade-in zoom-in-95 duration-500">
              <div className="w-full max-w-lg md:max-w-xl bg-white rounded-[3rem] md:rounded-[4rem] p-10 md:p-14 border-4 md:border-[6px] border-[#D70B0E] text-center shadow-2xl relative overflow-hidden">
                <div className="absolute -top-32 -left-32 w-64 h-64 bg-[#D70B0E] rounded-full mix-blend-multiply filter blur-[100px] opacity-10"></div>
                <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#D70B0E] rounded-full mix-blend-multiply filter blur-[100px] opacity-10"></div>

                <div className="relative z-10">
                  <div className="inline-block bg-[#D70B0E]/10 px-6 py-2 rounded-full border-2 border-[#D70B0E]/30 mb-8 md:mb-10">
                    <span className="text-sm md:text-base text-[#D70B0E] font-black">رقم التيكي</span>
                  </div>

                  <div className="bg-white p-5 md:p-6 rounded-[2rem] border-2 md:border-4 border-[#D70B0E] mb-8 shadow-inner">
                    <input type="text" dir="ltr" inputMode="numeric" maxLength={5} value={ticketId} autoFocus onChange={(e) => setTicketId(e.target.value.replace(/\D/g, ''))}
                      placeholder="00000" className={`w-full text-center text-5xl md:text-7xl placeholder:text-black/15 tracking-[0.3em] md:tracking-[0.4em] font-mono bg-transparent outline-none transition-all font-light ${isTicketUsedInCurrentMall ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'text-black focus:text-[#D70B0E] focus:drop-shadow-[0_0_25px_rgba(215,11,14,0.4)]'}`} />
                  </div>

                  {isTicketUsedInCurrentMall && (
                    <div className="bg-red-500/10 border-2 border-red-500/30 rounded-2xl py-3 px-4 mb-8">
                      <p className="text-red-500 text-sm md:text-base font-black flex items-center justify-center gap-2">
                        <span className="text-base animate-pulse">⚠️</span> هاد التيكي تخدم من قبل ف هاد المحل
                      </p>
                    </div>
                  )}

                  <div className="mb-10 md:mb-12 flex flex-col items-center">
                    <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handlePhotoCapture} className="hidden" />

                    {!ticketPhoto ? (
                      <button onClick={() => fileInputRef.current?.click()} className="group flex flex-col items-center justify-center gap-3 w-full bg-white hover:bg-[#D70B0E]/5 border-2 border-dashed border-[#D70B0E]/50 hover:border-[#D70B0E] rounded-[2rem] py-8 transition-all shadow-inner">
                        <div className="w-16 h-16 rounded-full bg-[#D70B0E]/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(215,11,14,0.2)]">
                          <span className="text-3xl filter drop-shadow-md">📷</span>
                        </div>
                        <span className="text-base md:text-lg font-black text-[#D70B0E] group-hover:text-[#A8080B] transition-colors">صوّر التيكي</span>
                        <span className="text-xs md:text-sm text-black/40 font-bold">كليكي هنا باش تحل الكاميرا</span>
                      </button>
                    ) : (
                      <div className="relative group rounded-[2rem] overflow-hidden border-[3px] border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.3)] w-full max-w-[280px] mx-auto transition-all">
                        <img src={ticketPhoto} alt="Ticket Proof" className="h-40 md:h-48 w-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                        <button onClick={() => setTicketPhoto(null)} className="absolute top-3 right-3 bg-white rounded-full w-8 h-8 flex items-center justify-center text-black/80 hover:bg-red-500 hover:text-white transition-all text-sm backdrop-blur-md border-2 border-[#D70B0E]/30 z-10 shadow-lg">✕</button>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#E8F5E8]/95 via-[#E8F5E8]/85 to-transparent pt-8 pb-3">
                          <span className="text-sm md:text-base font-black text-black drop-shadow-sm flex items-center justify-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-black block animate-pulse"></span>
                            تصوّر التيكي ✓
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {promoHasStock ? (
                    <button disabled={ticketId.length !== 5 || isTicketUsedInCurrentMall || !ticketPhoto} onClick={() => setIsValidated(true)}
                      className="btn-modern w-full py-4 md:py-5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white font-black rounded-[2rem] disabled:opacity-30 disabled:from-black/5 disabled:to-black/5 disabled:text-black/30 disabled:border disabled:border-[#D70B0E]/10 text-lg md:text-xl shadow-2xl transition-all">أكّد وكمّل</button>
                  ) : (
                    <div className="w-full py-4 md:py-5 bg-red-600/10 border-2 border-red-600/30 rounded-[1.5rem] text-red-500 font-black text-base md:text-lg flex flex-row items-center justify-center gap-3 shadow-inner">
                      <span className="text-xl md:text-2xl filter drop-shadow-md">🚫</span>
                      <span>سالا الستوك</span>
                    </div>
                  )}

                  <button onClick={() => { setPromoTier(null); setTicketId(''); setTicketPhoto(null); }} className="mt-5 text-sm md:text-base font-black text-black/40 hover:text-[#D70B0E] underline underline-offset-4">→ رجع للعروض</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[720px] transition-all duration-1000 animate-in zoom-in-95 fade-in">
              {totalSpins > 1 && (
                <div className="flex justify-center mb-2">
                  <span className="px-5 py-1.5 rounded-full bg-white/90 shadow-md text-[#D70B0E] text-sm md:text-base font-black">الدورة {spinNumber} من {totalSpins}</span>
                </div>
              )}
              <Wheel key={`${currentWheel}-${spinNumber}`} lots={LOTS} isSpinning={isSpinning} setIsSpinning={setIsSpinning} onSpinEnd={handleSpinEnd} targetLotId={targetLotId} />
            </div>
          )}
        </main>
        {showIntermediateResult && (
          // Compact, always fits the screen: the photo's height follows the screen height.
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 md:p-6 bg-white/90 backdrop-blur-xl animate-in fade-in">
            <div className="animate-pop-in w-full max-w-md glass-card rounded-[2rem] md:rounded-[2.5rem] border-4 border-[#D70B0E]/40 p-5 md:p-7 text-center flex flex-col items-center shadow-2xl max-h-[calc(100dvh-1.5rem)]">
              <h2 className="text-2xl md:text-4xl nutella-text font-black leading-tight">🎉 مبروك! الهدية {spinResults.length}</h2>
              <span className="mt-1 text-sm text-[#D70B0E]/70 font-black">الدورة {spinResults.length} من {totalSpins}</span>
              <PrizeVisual lot={spinResults[spinResults.length - 1].lot} className="my-3 h-[min(34dvh,260px)] min-h-0" />
              <h3 className="text-xl md:text-3xl text-black font-black leading-tight">{spinResults[spinResults.length - 1].lot.labelAr.replace('\n', ' ')}</h3>
              <p className="mt-2 text-black/60 text-sm md:text-base font-black">
                {totalSpins - spinResults.length === 1 ? 'باقي ليك دورة وحدة للهدية الأخيرة!' : `باقي ليك ${totalSpins - spinResults.length} دورات!`}
              </p>
              <button onClick={() => setSpinNumber(spinResults.length + 1)} className="btn-3d shrink-0 mt-4 w-full py-3 md:py-4 nutella-gradient text-white font-black rounded-2xl text-xl md:text-2xl">🎡 دوّر للهدية {spinResults.length + 1}</button>
            </div>
          </div>
        )}
        {showFinalResult && (
          // Compact, always fits the screen: prizes sit side by side and the photos'
          // height follows the screen height, so the button is always visible.
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 md:p-6 bg-white/90 backdrop-blur-xl animate-in fade-in">
            <div className={`animate-pop-in w-full ${spinResults.length > 1 ? 'max-w-2xl' : 'max-w-md'} glass-card rounded-[2rem] md:rounded-[2.5rem] border-4 border-[#D70B0E]/40 p-5 md:p-7 text-center flex flex-col items-center shadow-2xl max-h-[calc(100dvh-1.5rem)]`}>
              <h2 className="text-2xl md:text-4xl nutella-text font-black leading-tight mb-3 md:mb-4">
                🎉 {spinResults.length > 1 ? 'مبروك! ها الهدايا ديالك' : 'مبروك! ها الهدية ديالك'}
              </h2>
              <div className={`grid w-full gap-2 md:gap-4 ${spinResults.length > 2 ? 'grid-cols-3' : spinResults.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {spinResults.map((r, i) => (
                  <div key={i} className="animate-pop-in flex flex-col items-center bg-white/70 rounded-2xl p-2 md:p-4 border-2 border-[#D70B0E]/15" style={{ animationDelay: `${i * 0.15}s` }}>
                    {spinResults.length > 1 && <span className="text-xs md:text-sm text-[#D70B0E]/70 font-black">الدورة {i + 1}</span>}
                    <PrizeVisual lot={r.lot} className={`my-2 min-h-0 ${spinResults.length > 1 ? 'h-[min(20dvh,170px)]' : 'h-[min(36dvh,280px)]'}`} />
                    <h3 className={`text-black font-black leading-tight ${spinResults.length > 2 ? 'text-sm md:text-lg' : 'text-lg md:text-2xl'}`}>{r.lot.labelAr.replace('\n', ' ')}</h3>
                  </div>
                ))}
              </div>
              <p className="mt-3 md:mt-4 text-[#A8080B] text-sm md:text-lg font-bold leading-snug">{spinResults[spinResults.length - 1].aiMessage}</p>
              <button onClick={resetForm} className="btn-3d shrink-0 mt-4 w-full py-3 md:py-4 nutella-gradient text-white font-black rounded-2xl text-xl md:text-2xl">الزبون الجاي</button>
            </div>
          </div>
        )}
        {loadingMsg && (
          <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-white/80 p-8 md:p-12 text-center">
            <div className="relative w-32 h-32 md:w-48 md:h-48 mb-10 md:mb-16">
              <div className="absolute inset-0 border-[4px] md:border-[6px] border-t-[#D70B0E] border-[#D70B0E]/5 rounded-full animate-spin"></div>
            </div>
            <h3 className="text-3xl md:text-5xl nutella-text animate-pulse font-black">لحظة...</h3>
          </div>
        )}
      </div>
    );
  };

  const renderAdminView = () => {
    if (!adminLoggedIn) {
      return (
        <div className="admin-root min-h-screen flex items-center justify-start p-6 md:p-16 relative overflow-hidden">
          <AdminBackdrop />
          <div className="relative z-10 w-full max-w-sm md:max-w-md bg-white rounded-3xl p-8 md:p-12 border border-black/10 text-center shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-[#D70B0E] border-2 border-white flex items-center justify-center text-white shadow-md"><Icon name="lock" className="w-6 h-6" /></div>
            <h1 className="text-2xl md:text-3xl text-black uppercase font-black tracking-widest leading-tight">Admin</h1>
            <p className="mt-1 mb-8 text-xs text-black/40 font-bold uppercase tracking-[0.2em]">Nutella Products</p>
            <form onSubmit={handleAdminLogin} className="space-y-5">
              <input type="password" value={passwordInput} autoFocus onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Mot de passe" className="w-full bg-white border-2 border-black/10 p-4 rounded-2xl text-black text-center text-xl outline-none focus:border-[#D70B0E] transition-colors" />
              <button type="submit" className="btn-3d w-full py-4 nutella-gradient text-white font-black uppercase tracking-[0.3em] rounded-2xl text-xs md:text-sm">Se connecter</button>
              <a href="/" className="text-[10px] md:text-xs uppercase text-black/40 hover:text-[#D70B0E] font-black block mx-auto pt-2 underline underline-offset-4">← Retour au jeu</a>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div className="admin-root min-h-screen flex text-black font-montserrat w-full relative">
        <AdminBackdrop />
        <aside className="relative z-50 w-64 shrink-0 bg-white shadow-[8px_0_30px_rgba(0,0,0,0.08)] flex flex-col p-5 sticky top-0 h-screen border-r border-black/5">
          <div className="mb-8 flex items-center gap-3 px-1">
            <div className="w-11 h-11 rounded-2xl bg-[#D70B0E] border-2 border-white shadow-md flex items-center justify-center text-white"><Icon name="wheel" className="w-6 h-6" /></div>
            <div>
              <h1 className="text-lg text-black uppercase font-black leading-none tracking-wide">Admin</h1>
              <span className="text-[10px] text-black/40 font-black uppercase tracking-[0.15em]">Nutella products</span>
            </div>
          </div>
          <nav className="flex-grow space-y-1.5">
            {ADMIN_PAGES.map(item => (
              <button key={item.id} onClick={() => setAdminView(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-black uppercase transition-all
                  ${adminView === item.id ? 'bg-[#D70B0E] text-white shadow-md' : 'text-black/60 hover:bg-black/5 hover:text-black'}`}>
                <Icon name={item.icon} className="w-5 h-5" /> <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="pt-5 mt-5 border-t border-black/10 space-y-4">
            <div className="flex items-center gap-2 px-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${DB.online ? 'bg-green-500' : 'bg-[#D70B0E]'}`}></div>
              <span className={`text-[10px] uppercase font-black tracking-widest ${DB.online ? 'text-black/50' : 'text-[#D70B0E]'}`}>{DB.online ? 'Synchronisation active' : 'Hors ligne · données locales'}</span>
            </div>
            <button onClick={() => setAdminLoggedIn(false)} className="btn-3d btn-black w-full py-3 rounded-xl text-xs uppercase font-black tracking-widest">Déconnexion</button>
          </div>
        </aside>
        <main className="relative z-10 flex-grow p-6 md:p-8 overflow-y-auto w-full min-w-0">
          <header className="mb-8 flex flex-wrap justify-between items-center gap-4 bg-white rounded-2xl border border-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-[#D70B0E] border-2 border-white shadow-md text-white flex items-center justify-center">
                <Icon name={ADMIN_PAGES.find(p => p.id === adminView)?.icon ?? 'chart'} className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-2xl text-black uppercase font-black tracking-wider leading-tight">{ADMIN_PAGES.find(p => p.id === adminView)?.label}</h2>
                <p className="text-xs text-black/40 font-bold">{ADMIN_PAGES.find(p => p.id === adminView)?.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleManualRefresh}
                disabled={isSyncing}
                className="btn-3d btn-black px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-[#1f1f1f] disabled:opacity-60"
              >
                <Icon name="refresh" className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Actualisation...' : 'Actualiser'}</span>
              </button>
              <button
                onClick={() => { if (confirm("⚠️ ATTENTION: Voulez-vous vraiment réinitialiser TOUT le système ? (Stocks, Logs, Cycles)")) DB.factoryReset(); }}
                className="btn-3d btn-black px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:!bg-[#D70B0E] transition-colors group"
              >
                <Icon name="flame" className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                <span>Reset Système</span>
              </button>
              <button
                onClick={async () => {
                  const q = STARTING_STOCK;
                  if (!confirm(`Remettre le stock de TOUS les magasins (${malls.length}) au quota de départ ?\n\nNutella 15g ${q['Nutella 15g']} · B-Ready ${q['Nutella B-Ready']} · Autocollant ${q['Autocollant']} · Trousse couleur ${q['Trousse + crayons de couleur']} · Trousse non tissé ${q['Trousse non tissé + crayons cire']} · Surligneur ${q['Surligneur 5 pcs']} · Set fluo ${q['Set fluo']}\n\nL'historique des gains est conservé.`)) return;
                  const ok = await DB.restockAll(STARTING_STOCK);
                  alert(ok ? '✅ Stock remis au quota de départ pour tous les magasins.' : '❌ Échec de la mise à jour en base. Vérifiez la connexion et réessayez.');
                }}
                className="btn-3d btn-black px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:!bg-green-600 transition-colors"
              >
                <Icon name="box" className="w-4 h-4" />
                <span>Reset Quota</span>
              </button>
              <div className="pl-4 ml-1 border-l border-black/10 text-right">
                <span className="block text-[10px] uppercase tracking-[0.2em] font-black text-black/40">{new Date().toLocaleDateString('fr-FR')}</span>
                <span className="text-xl font-mono text-black font-black">{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </header>
          {adminView === 'dashboard' && renderDashboard()}
          {adminView === 'performance' && renderPerformance()}
          {adminView === 'malls' && renderMalls()}
          {adminView === 'inventory' && renderInventory()}
          {adminView === 'reports' && renderReports()}
          {adminView === 'settings' && renderSettings()}
          {renderGalleryModal()}
        </main>
      </div>
    );
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<>{renderClientView()}<SyncBadge online={DB.online} pending={DB.pendingSpins()} /></>} />
        <Route path="/admin" element={renderAdminView()} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
