import { logEvent, errorDetail } from "./diagnostics.js";
// One encode/write in flight, shared by automatic and manual captures.
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
  return `MotionSnap_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}_${suffix}_${globalThis.crypto.randomUUID()}.png`;
}
export async function saveBlob(directory, name, blob) {
  let writable,
    stage = "permission-query";
  try {
    logEvent("file-save", "begin", { filename: name, bytes: blob.size }, true);
    // Query is safe in the detection loop. Never request permission here.
    if (
      typeof directory.queryPermission === "function" &&
      (await directory.queryPermission({ mode: "readwrite" })) !== "granted"
    ) {
      throw new DOMException("写入权限已失效。", "NotAllowedError");
    }
    stage = "get-file";
    const handle = await directory.getFileHandle(name, { create: true });
    stage = "create-writable";
    writable = await handle.createWritable();
    stage = "write";
    await writable.write(blob);
    stage = "close";
    await writable.close();
    logEvent("file-save", "committed", { filename: name }, true);
  } catch (error) {
    error.saveStage = stage;
    logEvent("file-save", "failed", { ...errorDetail(error), filename: name });
    if (writable) {
      try {
        await writable.abort();
      } catch {
        /* Preserve original failure. */
      }
    }
    throw error;
  }
}
