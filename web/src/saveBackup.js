const IDB_NAME = 'roylays';
const IDB_STORE = 'kv';
const IDB_VERSION = 1;
const KEY_EXIT_BACKUP = 'exitBackupZip';

/**
 * Ask the browser for persistent storage (IndexedDB less likely to be evicted).
 */
export function requestPersistentStorage() {
    if (!navigator.storage?.persist) {
        return Promise.resolve(false);
    }
    return navigator.storage.persist().catch(() => false);
}

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(IDB_STORE)) {
                req.result.createObjectStore(IDB_STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Store a copy of the full CheerpJ /files export (zip) when leaving a game session.
 */
export async function putExitBackup(arrayBuffer) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(
            { buffer: arrayBuffer, t: Date.now() },
            KEY_EXIT_BACKUP
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
