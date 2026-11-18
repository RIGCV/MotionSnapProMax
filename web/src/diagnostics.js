// Local-only bounded diagnostics. No image data, handles or absolute paths.
const records = [];
export function logEvent(stage, result, detail = {}, highVolume = false) {
  const record = { time: new Date().toISOString(), stage, result, ...detail };
  records.push(record);
  if (records.length > 200) records.shift();
  const verbose =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("debug");
  if (result === "failed") console.warn("[MotionSnap]", record);
  else if (!highVolume || verbose) console.debug("[MotionSnap]", record);
}
export function errorDetail(error) {
  return {
    name: error?.name || "Error",
    message: String(error?.message || error),
    errorStage: error?.folderStage || error?.saveStage,
  };
}
export function getDiagnostics() {
  return records.map((record) => ({ ...record }));
}
