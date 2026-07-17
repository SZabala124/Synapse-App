const DB_NAME = "synapse-material-catalog-v1";
const DB_VERSION = 1;
const STORE_NAME = "catalogs";

let dbPromise = null;

export async function readMaterialCatalog(scopeKey) {
  const db = await openCatalogDb();
  return await requestToPromise(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(scopeKey));
}

export async function writeMaterialCatalog(scopeKey, catalog) {
  const db = await openCatalogDb();
  await requestToPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put({
    ...catalog,
    scopeKey,
    savedAt: Date.now(),
  }));
}

export async function removeMaterialCatalog(scopeKey) {
  const db = await openCatalogDb();
  await requestToPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(scopeKey));
}

function openCatalogDb() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB no esta disponible."));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "scopeKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("La base local de materiales esta bloqueada por otra pestana."));
  });

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
