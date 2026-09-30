import { createClient } from '@supabase/supabase-js';
import { Mall, LotType, SpinLog, WheelKind, CycleState, PromoTier } from '../types';
import { AppDatabase, INITIAL_DB_SEED } from '../database';
import { OutboxOp, outboxAll, outboxPut, outboxDelete } from './outbox';

// A failed call caused by the connection (retry later) rather than by the data.
const isNetworkError = (e: unknown): boolean => {
  const msg = String((e as { message?: string })?.message ?? e ?? '').toLowerCase();
  return typeof navigator !== 'undefined' && !navigator.onLine
    || /fetch|network|timeout|timed out|load failed|aborted|offline/.test(msg);
};

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

// Admin switches shared by all tablets (table app_settings, see supabase/add_app_settings.sql).
export interface AppSettings {
  showChangeStore: boolean; // "بدّل المحل" buttons
  showChangeCity: boolean;  // "بدّل المدينة" button
}
const SETTING_KEYS: Record<keyof AppSettings, string> = { showChangeStore: 'show_change_store', showChangeCity: 'show_change_city' };
const DEFAULT_SETTINGS: AppSettings = { showChangeStore: true, showChangeCity: true };
const SETTINGS_KEY = 'ferrero_app_settings';

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
  private settings: AppSettings = DEFAULT_SETTINGS;
  // false when the app_settings table doesn't exist yet (SQL not run).
  settingsAvailable = true;
  // Spins recorded on this tablet but not yet confirmed by Supabase (mirror of IndexedDB).
  private outbox: OutboxOp[] = [];
  private flushing: Promise<void> | null = null;
  // Last known connection state (browser signal + result of the last Supabase call).
  online = typeof navigator === 'undefined' ? true : navigator.onLine;

  constructor() {
    this.data = this.loadFromLocalStorage() ?? clone(INITIAL_DB_SEED);
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* keep defaults */ }
    // Load spins waiting to be sent (from before a reload / restart), then sync.
    outboxAll()
      .then(ops => { this.outbox = ops; this.notify(); })
      .catch(e => console.warn('Outbox unavailable', e))
      .finally(() => this.fetchAll());
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.online = true; this.notify(); this.fetchAll(); });
      window.addEventListener('offline', () => { this.online = false; this.notify(); });
    }

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

    const tables = ['malls', 'stocks', 'cycles', 'logs', 'app_settings'];
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
      // Photos not yet uploaded live in the outbox (IndexedDB); keep them out of
      // localStorage, which is limited to ~5 MB.
      const slim = { ...this.data, logs: this.data.logs.map(l => l.ticketPhoto?.startsWith('data:') ? { ...l, ticketPhoto: undefined } : l) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
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

  private async fetchSettings() {
    const { data, error } = await supabase.from('app_settings').select('key,value');
    if (error) {
      // Table missing (SQL not run yet): keep every button visible.
      this.settingsAvailable = false;
      return;
    }
    this.settingsAvailable = true;
    const next: AppSettings = { ...DEFAULT_SETTINGS };
    (Object.keys(SETTING_KEYS) as (keyof AppSettings)[]).forEach(k => {
      const row = (data as { key: string; value: unknown }[]).find(r => r.key === SETTING_KEYS[k]);
      if (row && typeof row.value === 'boolean') next[k] = row.value;
    });
    this.settings = next;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    this.notify();
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  async setSetting(key: keyof AppSettings, value: boolean): Promise<boolean> {
    const previous = this.settings;
    this.settings = { ...this.settings, [key]: value };
    this.notify();
    const { error } = await supabase.from('app_settings')
      .upsert({ key: SETTING_KEYS[key], value, updated_at: new Date().toISOString() });
    if (error) {
      console.warn('Failed to save setting', error);
      this.settings = previous;
      this.settingsAvailable = false;
      this.notify();
      return false;
    }
    this.settingsAvailable = true;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    return true;
  }

  // ---- Offline outbox -------------------------------------------------------

  pendingSpins(): number {
    return this.outbox.filter(o => o.kind === 'spin').length;
  }

  private syncCount = 0;

  private setOnline(value: boolean) {
    if (this.online !== value) { this.online = value; this.notify(); }
  }

  // Sends queued work to Supabase, oldest first. Stops at the first connection
  // error (the rest stays queued and is retried on the next sync).
  flushOutbox(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      for (const op of [...this.outbox]) {
        try {
          if (op.kind === 'spin') await this.sendSpin(op.log);
          else await this.sendCycles(op.mallId);
          await outboxDelete(op.opId);
          this.outbox = this.outbox.filter(o => o.opId !== op.opId);
          this.syncCount++;
          this.setOnline(true);
          this.notify();
        } catch (e) {
          if (isNetworkError(e)) { this.setOnline(false); break; }
          // Refused by the database (not a connection problem): keep it queued,
          // try the next one; it is retried on every sync and stays visible.
          console.warn('Outbox op rejected, will retry', op.opId, e);
        }
      }
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  // One spin = stock -1 + history row. The log id makes the retry safe: if the row
  // is already in Supabase, the spin was fully applied and nothing is sent again.
  private async sendSpin(log: SpinLog) {
    // No built-in retries: a dead connection must be detected at once (the outbox retries).
    const existing = await supabase.from('logs').select('id').eq('id', log.id).retry(false).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return;

    let photoUrl = log.ticketPhoto;
    if (photoUrl && photoUrl.startsWith('data:image')) {
      photoUrl = await this.uploadTicketPhoto(log.id, photoUrl, true);
    }

    const rpc = await supabase.rpc('increment_stock', { p_mall_id: log.mallId, p_lot_type: log.lotWon, p_delta: -1 });
    if (rpc.error) {
      if (isNetworkError(rpc.error)) throw rpc.error;
      // RPC not installed: plain read + write fallback.
      const { data: row, error: readErr } = await supabase.from('stocks').select('quantity').eq('mall_id', log.mallId).eq('lot_type', log.lotWon).maybeSingle();
      if (readErr) throw readErr;
      const { error: writeErr } = await supabase.from('stocks').upsert({ mall_id: log.mallId, lot_type: log.lotWon, quantity: Math.max(0, (row?.quantity ?? 0) - 1) });
      if (writeErr) throw writeErr;
    }

    const { error } = await supabase.from('logs').upsert({
      id: log.id, timestamp: log.timestamp, mall_id: log.mallId, mall_name: log.mallName,
      ticket_id: log.ticketId, ticket_photo_url: photoUrl ?? null, lot_won: log.lotWon, status: log.status,
      promo: log.promo ?? null, spin_number: log.spinNumber ?? null
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
  }

  private async sendCycles(mallId: string) {
    const mallCycles = this.data.cycles[mallId];
    if (!mallCycles) return;
    const rows: CycleRow[] = (Object.entries(mallCycles) as [WheelKind, CycleState][]).map(([wheel, cycle]) => ({
      mall_id: mallId, wheel, sequence: cycle.sequence, index: cycle.index, completed: cycle.completed
    }));
    if (!rows.length) return;
    const { error } = await supabase.from('cycles').upsert(rows);
    if (error) throw error;
  }

  private async enqueue(op: OutboxOp) {
    this.outbox = [...this.outbox.filter(o => o.opId !== op.opId), op];
    this.notify();
    try { await outboxPut(op); } catch (e) { console.warn('Could not save to outbox', e); }
  }

  // Records a spin on the tablet immediately (stock -1, history, cycle), queues it
  // for Supabase and returns without waiting for the network.
  async recordSpin(log: SpinLog, mutateCycles: (data: AppDatabase) => void) {
    const stocks = this.data.stocks[log.mallId] ?? (this.data.stocks[log.mallId] = {} as AppDatabase['stocks'][string]);
    stocks[log.lotWon] = Math.max(0, (stocks[log.lotWon] ?? 0) - 1);
    this.data.logs = [log, ...this.data.logs];
    mutateCycles(this.data);
    this.persistLocal();
    this.notify();

    const now = Date.now();
    await this.enqueue({ opId: `spin-${log.id}`, kind: 'spin', createdAt: now, log });
    await this.enqueue({ opId: `cycles-${log.mallId}`, kind: 'cycles', createdAt: now + 1, mallId: log.mallId });
    this.flushOutbox();
  }

  // Server data + what this tablet has recorded but not sent yet.
  private withPending(server: AppDatabase): AppDatabase {
    const pending = this.outbox.filter((o): o is Extract<OutboxOp, { kind: 'spin' }> => o.kind === 'spin');
    const serverIds = new Set(server.logs.map(l => l.id));
    const missing = pending.map(o => o.log).filter(l => !serverIds.has(l.id));
    for (const l of missing) {
      const s = server.stocks[l.mallId];
      if (s && typeof s[l.lotWon] === 'number') s[l.lotWon] = Math.max(0, s[l.lotWon] - 1);
    }
    for (const o of this.outbox) {
      if (o.kind === 'cycles' && this.data.cycles[o.mallId]) server.cycles[o.mallId] = this.data.cycles[o.mallId];
    }
    return { ...server, logs: [...missing.slice().reverse(), ...server.logs] };
  }

  async fetchAll() {
    await this.flushOutbox();
    try {
      await this.fetchSettings();
    } catch (e) {
      console.warn('Could not load settings', e);
    }
    const syncBefore = this.syncCount;
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

      this.data = this.withPending({
        version: this.data.version,
        malls: (mallsRes.data as MallRow[]).map(rowToMall)
          .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.name.localeCompare(b.name)),
        stocks,
        logs: (logsRes.data as LogRow[]).map(rowToLog),
        cycles
      });
      this.setOnline(true);
      this.persistLocal();
      this.notify();
      // A queued spin landed while we were reading: read again so it isn't missing.
      if (this.syncCount !== syncBefore) setTimeout(() => this.fetchAll(), 500);
    } catch (e) {
      if (isNetworkError(e)) this.setOnline(false);
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

  // strict: throw on a connection error so the outbox retries the upload later.
  private async uploadTicketPhoto(logId: string, dataUrl: string, strict = false): Promise<string> {
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
      if (strict && isNetworkError(error)) throw error;
      console.warn('Failed to upload ticket photo, keeping inline copy', error);
      return dataUrl;
    }
    const { data } = supabase.storage.from(TICKET_PHOTOS_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  // Local change + cycles queued for Supabase (the outbox retries while offline).
  // Stock is never pushed from here: spins send their -1 as a delta, admin edits
  // go through updateStock.
  atomicUpdate(mutator: (data: AppDatabase) => void, mallId?: string) {
    mutator(this.data);
    this.persistLocal();
    this.notify();
    if (!mallId) return;
    this.enqueue({ opId: `cycles-${mallId}`, kind: 'cycles', createdAt: Date.now(), mallId })
      .then(() => this.flushOutbox());
  }

  // Admin sets an exact quantity (admin screen, online).
  updateStock(mallId: string, lotId: LotType, value: number) {
    if (!this.data.stocks[mallId]) this.data.stocks[mallId] = {} as AppDatabase['stocks'][string];
    this.data.stocks[mallId][lotId] = value;
    this.persistLocal();
    this.notify();
    supabase.from('stocks').upsert({ mall_id: mallId, lot_type: lotId, quantity: value }).then(({ error }) => {
      if (error) console.warn('Failed to sync stock', error);
    });
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

  // Puts every store's stock back to its starting quota and clears the prize cycles
  // (they are rebuilt from the new stock on the next spin). Spin history is kept.
  async restockAll(quota: Record<LotType, number>): Promise<boolean> {
    for (const mall of this.data.malls) this.data.stocks[mall.id] = { ...quota };
    this.data.cycles = {};
    this.persistLocal();
    this.notify();

    const rows: StockRow[] = this.data.malls.flatMap(m =>
      (Object.entries(quota) as [LotType, number][]).map(([lot_type, quantity]) => ({ mall_id: m.id, lot_type, quantity })));
    const { error } = await supabase.from('stocks').upsert(rows);
    if (error) { console.warn('Failed to reset stock quota', error); return false; }
    const { error: cyclesError } = await supabase.from('cycles').delete().not('mall_id', 'is', null);
    if (cyclesError) console.warn('Failed to clear cycles', cyclesError);
    return true;
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
