// IndexedDB belongs to the extension origin. Injected content scripts use the
// website's origin and cannot read these credentials (unlike chrome.storage.local).
let opening;
function database() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open("fia-extension-auth", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onerror = () => { opening = null; reject(request.error); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
  });
  return opening;
}
async function transaction(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", mode, { durability: "strict" });
    const result = {};
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error("Could not save the extension session."));
    action(tx.objectStore("state"), result);
  });
}
export const authStore = {
  get(keys) {
    return transaction("readonly", (store, result) => {
      for (const key of (typeof keys === "string" ? [keys] : keys)) {
        const request = store.get(key);
        request.onsuccess = () => { result[key] = request.result; };
      }
    });
  },
  set(data) {
    return transaction("readwrite", (store) => {
      for (const [key, value] of Object.entries(data)) store.put(value, key);
    });
  },
  remove(keys) {
    return transaction("readwrite", (store) => {
      for (const key of (typeof keys === "string" ? [keys] : keys)) store.delete(key);
    });
  },
};
