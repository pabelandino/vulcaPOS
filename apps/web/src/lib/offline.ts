import { api, NetworkError } from './api';

export type OutboxItem = {
  id: string;
  path: string;
  body: unknown;
  createdAt: string;
  error?: string;
};

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('vulcapos', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueue(path: string, body: unknown) {
  const db = await openDb();
  const item: OutboxItem = { id: crypto.randomUUID(), path, body, createdAt: new Date().toISOString() };
  await requestToPromise(db.transaction('outbox', 'readwrite').objectStore('outbox').add(item));
  return item;
}

export async function pendingCount() {
  const db = await openDb();
  return requestToPromise(db.transaction('outbox').objectStore('outbox').count());
}

export async function listPending() {
  const db = await openDb();
  return requestToPromise(db.transaction('outbox').objectStore('outbox').getAll() as IDBRequest<OutboxItem[]>);
}

export async function flushOutbox() {
  const items = await listPending();
  let synced = 0;
  for (const item of items) {
    try {
      await api(item.path, { method: 'POST', body: JSON.stringify(item.body) });
      const db = await openDb();
      await requestToPromise(db.transaction('outbox', 'readwrite').objectStore('outbox').delete(item.id));
      synced += 1;
    } catch (error) {
      if (error instanceof NetworkError) break;
      const db = await openDb();
      item.error = error instanceof Error ? error.message : 'No se pudo sincronizar';
      await requestToPromise(db.transaction('outbox', 'readwrite').objectStore('outbox').put(item));
    }
  }
  return { synced, pending: await pendingCount() };
}

export async function cachePut(key: string, value: unknown) {
  const db = await openDb();
  await requestToPromise(db.transaction('cache', 'readwrite').objectStore('cache').put(value, key));
}

export async function cacheGet<T>(key: string) {
  const db = await openDb();
  return requestToPromise(db.transaction('cache').objectStore('cache').get(key) as IDBRequest<T | undefined>);
}
