export async function screenshotsDirectory(parent) {
  return parent.getDirectoryHandle("Screenshots", { create: true });
}
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("motionsnap-preferences", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("settings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadParent() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db
        .transaction("settings")
        .objectStore("settings")
        .get("capture-parent");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function rememberParent(handle) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put(handle, "capture-parent");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
