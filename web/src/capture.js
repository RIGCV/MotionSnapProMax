// One write in flight: never queue stale camera frames or impose a timer.
export class CaptureGate {
  constructor() {
    this.busy = false;
  }
  async attempt({ active, enabled }, capture) {
    if (!active || !enabled || this.busy) return false;
    this.busy = true;
    try {
      return (await capture()) !== false;
    } finally {
      this.busy = false;
    }
  }
}
export function captureName(date = new Date(), suffix = "auto") {
  const pad = (n, size = 2) => String(n).padStart(size, "0");
  return `MotionSnap_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}_${suffix}_${globalThis.crypto.randomUUID().slice(0, 8)}.png`;
}
export async function saveBlob(directory, name, blob) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}
