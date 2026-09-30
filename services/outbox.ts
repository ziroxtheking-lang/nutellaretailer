// Offline outbox: every spin is written here FIRST (on the tablet, in IndexedDB,
// which survives reloads/restarts and holds hundreds of MB), then sent to Supabase
// in the background and removed only once Supabase has confirmed it.

import { SpinLog } from '../types';

export type OutboxOp =
  | { opId: string; kind: 'spin'; createdAt: number; log: SpinLog }
  | { opId: string; kind: 'cycles'; createdAt: number; mallId: string };

const DB_NAME = 'nutella_outbox';
const STORE = 'ops';

let dbPromise: Promise<IDBDatabase> | null = null;
const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'opId' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
};

const tx = async <T,>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};

export const outboxAll = async (): Promise<OutboxOp[]> =>
  ((await tx<OutboxOp[]>('readonly', s => s.getAll())) ?? []).sort((a, b) => a.createdAt - b.createdAt);

export const outboxPut = (op: OutboxOp) => tx('readwrite', s => s.put(op));

export const outboxDelete = (opId: string) => tx('readwrite', s => s.delete(opId));
