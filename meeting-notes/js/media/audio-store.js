// 녹음 저장소 (IndexedDB). 녹음 중에는 10초 청크를 즉시 쓰고, 중지하면 하나의 Blob으로 합친다.
const DB_NAME = 'meetingnotes';
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audioChunks')) db.createObjectStore('audioChunks', { keyPath: ['recordingId', 'seq'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** fn(stores)이 만든 요청들이 끝나고 트랜잭션이 완료되면 resolve. fn의 반환값(요청이면 그 결과)을 돌려준다. */
async function tx(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = Object.fromEntries([storeNames].flat().map((n) => [n, t.objectStore(n)]));
    const out = fn(stores);
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const chunkRange = (recordingId) => IDBKeyRange.bound([recordingId, 0], [recordingId, Number.MAX_SAFE_INTEGER]);

export const isAudioStoreAvailable = () => typeof indexedDB !== 'undefined';

export function putMeta(meta) {
  return tx('recordings', 'readwrite', (s) => s.recordings.put(meta));
}

export function putChunk(recordingId, seq, blob) {
  return tx('audioChunks', 'readwrite', (s) => s.audioChunks.put({ recordingId, seq, blob }));
}

export function getRecording(id) {
  return tx('recordings', 'readonly', (s) => s.recordings.get(id));
}

/** 청크를 합쳐 완료된 녹음으로 저장하고 청크는 지운다. */
export async function finalize(id, patch = {}) {
  const meta = await getRecording(id);
  if (!meta) return null;
  const chunks = await tx('audioChunks', 'readonly', (s) => s.audioChunks.getAll(chunkRange(id)));
  const blob = new Blob(
    chunks.sort((a, b) => a.seq - b.seq).map((c) => c.blob),
    { type: meta.mimeType },
  );
  const done = {
    ...meta,
    ...patch,
    durationSec: patch.durationSec ?? meta.durationSec ?? chunks.length * 10,
    blob,
    sizeBytes: blob.size,
    status: 'complete',
  };
  await tx(['recordings', 'audioChunks'], 'readwrite', (s) => {
    s.recordings.put(done);
    s.audioChunks.delete(chunkRange(id));
  });
  return done;
}

export function deleteRecording(id) {
  return tx(['recordings', 'audioChunks'], 'readwrite', (s) => {
    s.recordings.delete(id);
    s.audioChunks.delete(chunkRange(id));
  });
}

/** 탭이 닫혀 중지되지 못한 녹음 (status: 'recording') */
export async function listInterrupted(activeId = null) {
  const all = await tx('recordings', 'readonly', (s) => s.recordings.getAll());
  return all.filter((r) => r.status === 'recording' && r.id !== activeId);
}

export async function storageEstimate() {
  try {
    return (await navigator.storage?.estimate?.()) ?? null;
  } catch {
    return null;
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* 지원하지 않는 브라우저 */
  }
}
