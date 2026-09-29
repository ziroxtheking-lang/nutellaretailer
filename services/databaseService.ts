import { createClient } from '@supabase/supabase-js';
import { Mall, LotType, SpinLog, WheelKind, CycleState, PromoTier } from '../types';
import { AppDatabase, INITIAL_DB_SEED } from '../database';

const STORAGE_KEY = 'ferrero_golden_spin_db';
const TICKET_PHOTOS_BUCKET = 'ticket-photos';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
const supabaseKey = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey);

type Listener = () => void;

interface MallRow {
  id: string; name: string; password: string; active_wheels: number;
  city?: string | null; sfa?: string | null; store_number?: number | null;
}
interface StockRow { mall_id: string; lot_type: LotType; quantity: number; }
interface CycleRow { mall_id: string; wheel: WheelKind; sequence: LotType[]; index: number; completed: number; }
interface LogRow {
  id: string; timestamp: string; mall_id: string; mall_name: string;
  ticket_id: string; ticket_photo_url: string | null; lot_won: LotType; status: SpinLog['status'];
  promo: PromoTier | null; spin_number: number | null;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const mallToRow = (mall: Mall): MallRow => ({
  id: mall.id, name: mall.name, password: mall.password ?? '', active_wheels: mall.activeWheels ?? 1,
  city: mall.city ?? null, sfa: mall.sfa ?? null, store_number: mall.number ?? null
});

const rowToMall = (row: MallRow): Mall => ({
  id: row.id, name: row.name, password: row.password, activeWheels: row.active_wheels,
  city: row.city ?? undefined, sfa: row.sfa ?? undefined, number: row.store_number ?? undefined
});

const rowToLog = (row: LogRow): SpinLog => ({
  id: row.id, timestamp: row.timestamp, mallId: row.mall_id, mallName: row.mall_name,
  ticketId: row.ticket_id, ticketPhoto: row.ticket_photo_url ?? undefined, lotWon: row.lot_won, status: row.status,
  promo: row.promo ?? undefined, spinNumber: row.spin_number ?? undefined
});

class DatabaseService {
  private data: AppDatabase;
  private listeners: Set<Listener> = new Set();
  private refetchDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = this.loadFromLocalStorage() ?? clone(INITIAL_DB_SEED);
    this.fetchAll();

    // Live push updates: as soon as any tablet/admin changes stocks, cycles,
    // logs or malls, every other open tab refetches within a few hundred ms
    // instead of waiting for the poll below. Requires
    // supabase/enable_realtime.sql to have been run once on the database --
    // if it hasn't, these events just never fire and the poll/visibility
    // fallbacks below still keep things reasonably fresh.
    this.subscribeToRealtime();

    // Fallback safety net in case the realtime socket drops silently, and to
    // cover a tablet that was asleep/backgrounded for a while.
    setInterval(() => this.fetchAll(), 20000);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.fetchAll();
      });
    }
  }

  private subscribeToRealtime() {
    const scheduleRefetch = () => {
      if (this.refetchDebounce) clearTimeout(this.refetchDebounce);
      // A single spin touches stocks + cycles + logs almost
      // simultaneously -- debounce so that lands as one refetch, not three.
      this.refetchDebounce = setTimeout(() => this.fetchAll(), 300);
    };

    const tables = ['malls', 'stocks', 'cycles', 'logs'];
    const channel = supabase.channel('db-changes');
    tables.forEach(table => {
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table }, scheduleRefetch);
    });
    channel.subscribe();
  }

  private loadFromLocalStorage(): AppDatabase | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('Failed to read local DB cache', e);
      return null;
    }
  }

  private persistLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Failed to persist DB to localStorage', e);
    }
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async fetchAll() {
    try {
      const [mallsRes, stocksRes, cyclesRes, logsRes] = await Promise.all([
        supabase.from('malls').select('*'),
        supabase.from('stocks').select('*'),
        supabase.from('cycles').select('*'),
        supabase.from('logs').select('*').order('created_at', { ascending: false })
      ]);

      if (mallsRes.error) throw mallsRes.error;
      if (stocksRes.error) throw stocksRes.error;
      if (cyclesRes.error) throw cyclesRes.error;
      if (logsRes.error) throw logsRes.error;

      const stocks: AppDatabase['stocks'] = {};
      (stocksRes.data as StockRow[]).forEach(row => {
        if (!stocks[row.mall_id]) stocks[row.mall_id] = {} as AppDatabase['stocks'][string];
        stocks[row.mall_id][row.lot_type] = row.quantity;
      });

      const cycles: AppDatabase['cycles'] = {};
      (cyclesRes.data as CycleRow[]).forEach(row => {
        if (!cycles[row.mall_id]) cycles[row.mall_id] = {} as AppDatabase['cycles'][string];
        cycles[row.mall_id][row.wheel] = { sequence: row.sequence, index: row.index, completed: row.completed };
      });

      this.data = {
        version: this.data.version,
        malls: (mallsRes.data as MallRow[]).map(rowToMall)
          .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.name.localeCompare(b.name)),
        stocks,
        logs: (logsRes.data as LogRow[]).map(rowToLog),
        cycles
      };
      this.persistLocal();
      this.notify();
    } catch (e) {
      console.warn('Could not reach Supabase, using local copy', e);
    }
  }

  getMalls(): Mall[] {
    return this.data.malls;
  }

  getStocks() {
    return this.data.stocks;
  }

  getLogs(): SpinLog[] {
    return this.data.logs;
  }

  getCycles() {
    return this.data.cycles;
  }

  private async uploadTicketPhoto(logId: string, dataUrl: string): Promise<string> {
    const match = /^data:(image\/\w+);base64,(.*)$/.exec(dataUrl);
    if (!match) return dataUrl;
    const [, mime, base64] = match;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const ext = mime.split('/')[1] || 'jpg';
    const path = `${logId}.${ext}`;

    const { error } = await supabase.storage
      .from(TICKET_PHOTOS_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true });

    if (error) {
      console.warn('Failed to upload ticket photo, keeping inline copy', error);
      return dataUrl;
    }
    const { data } = supabase.storage.from(TICKET_PHOTOS_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  private async pushMallSlice(mallId: string, newLogs: SpinLog[]) {
    try {
      const mallStocks = this.data.stocks[mallId];
      if (mallStocks) {
        const rows: StockRow[] = Object.entries(mallStocks).map(([lot_type, quantity]) => ({
          mall_id: mallId, lot_type: lot_type as LotType, quantity: quantity as number
        }));
        if (rows.length) {
          const { error } = await supabase.from('stocks').upsert(rows);
          if (error) console.warn('Failed to sync stocks', error);
        }
      }

      const mallCycles = this.data.cycles[mallId];
      if (mallCycles) {
        const rows: CycleRow[] = (Object.entries(mallCycles) as [WheelKind, CycleState][]).map(([wheel, cycle]) => ({
          mall_id: mallId, wheel, sequence: cycle.sequence, index: cycle.index, completed: cycle.completed
        }));
        if (rows.length) {
          const { error } = await supabase.from('cycles').upsert(rows);
          if (error) console.warn('Failed to sync cycles', error);
        }
      }

      for (const log of newLogs) {
        let photoUrl = log.ticketPhoto;
        if (photoUrl && photoUrl.startsWith('data:image')) {
          photoUrl = await this.uploadTicketPhoto(log.id, photoUrl);
        }
        const { error } = await supabase.from('logs').insert({
          id: log.id, timestamp: log.timestamp, mall_id: log.mallId, mall_name: log.mallName,
          ticket_id: log.ticketId, ticket_photo_url: photoUrl ?? null, lot_won: log.lotWon, status: log.status,
          promo: log.promo ?? null, spin_number: log.spinNumber ?? null
        });
        if (error) console.warn('Failed to sync log', error);
      }
    } catch (e) {
      console.warn('Failed to sync mall data to Supabase', e);
    }
  }

  atomicUpdate(mutator: (data: AppDatabase) => void, mallId?: string) {
    const beforeLogIds = new Set(this.data.logs.map(l => l.id));
    mutator(this.data);
    this.persistLocal();
    this.notify();

    if (!mallId) return;
    const newLogs = this.data.logs.filter(l => !beforeLogIds.has(l.id));
    this.pushMallSlice(mallId, newLogs);
  }

  updateStock(mallId: string, lotId: LotType, value: number) {
    this.atomicUpdate(data => {
      if (!data.stocks[mallId]) data.stocks[mallId] = {} as AppDatabase['stocks'][string];
      data.stocks[mallId][lotId] = value;
    }, mallId);
  }

  // Atomic +/- adjustment: the database computes the new quantity from
  // whatever it actually currently holds, not from a possibly-stale local
  // read. Used for spin decrements and the admin +/- buttons, where two
  // independent screens might otherwise race and clobber each other.
  // Optimistically nudges the local value immediately for a responsive UI,
  // then reconciles to the server's authoritative result once it lands.
  async adjustStock(mallId: string, lotId: LotType, delta: number): Promise<number | null> {
    if (!this.data.stocks[mallId]) this.data.stocks[mallId] = {} as AppDatabase['stocks'][string];
    const optimistic = Math.max(0, (this.data.stocks[mallId][lotId] ?? 0) + delta);
    this.data.stocks[mallId][lotId] = optimistic;
    this.persistLocal();
    this.notify();

    const { data, error } = await supabase.rpc('increment_stock', {
      p_mall_id: mallId, p_lot_type: lotId, p_delta: delta
    });
    if (error) {
      console.warn('increment_stock RPC missing (run supabase/add_atomic_stock_adjust.sql) -- falling back to a non-atomic read+write', error);
      const { data: row } = await supabase.from('stocks').select('quantity').eq('mall_id', mallId).eq('lot_type', lotId).maybeSingle();
      const fallbackValue = Math.max(0, (row?.quantity ?? 0) + delta);
      const { error: upsertError } = await supabase.from('stocks').upsert({ mall_id: mallId, lot_type: lotId, quantity: fallbackValue });
      if (upsertError) {
        console.warn('Fallback stock adjust also failed', upsertError);
        return null;
      }
      this.data.stocks[mallId][lotId] = fallbackValue;
      this.persistLocal();
      this.notify();
      return fallbackValue;
    }
    this.data.stocks[mallId][lotId] = data as number;
    this.persistLocal();
    this.notify();
    return data as number;
  }

  updateCycle(mallId: string, wheel: WheelKind, cycle: CycleState) {
    this.atomicUpdate(data => {
      if (!data.cycles[mallId]) data.cycles[mallId] = {} as AppDatabase['cycles'][string];
      data.cycles[mallId][wheel] = cycle;
    }, mallId);
  }

  updateMall(mall: Mall) {
    const idx = this.data.malls.findIndex(m => m.id === mall.id);
    if (idx >= 0) this.data.malls[idx] = mall;
    else this.data.malls.push(mall);
    this.persistLocal();
    this.notify();

    supabase.from('malls').upsert(mallToRow(mall)).then(({ error }) => {
      if (error) console.warn('Failed to sync mall', error);
    });
  }

  factoryReset() {
    this.data = clone(INITIAL_DB_SEED);
    this.persistLocal();
    this.notify();

    (async () => {
      try {
        await supabase.from('logs').delete().not('id', 'is', null);
        await supabase.from('cycles').delete().not('mall_id', 'is', null);
        await supabase.from('stocks').delete().not('mall_id', 'is', null);
        const { error } = await supabase.from('malls').upsert(INITIAL_DB_SEED.malls.map(mallToRow));
        if (error) console.warn('Failed to reseed malls', error);
      } catch (e) {
        console.warn('Failed to factory reset Supabase data', e);
      }
    })();
  }
}

export const DB = new DatabaseService();
