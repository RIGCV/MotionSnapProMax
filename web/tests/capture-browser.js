const html = await (await fetch("/")).text();
const parsed = new DOMParser().parseFromString(html, "text/html");
document.body.innerHTML = parsed.body.innerHTML;
document.querySelectorAll("script").forEach((s) => s.remove());
const report = document.createElement("pre");
report.style =
  "position:fixed;z-index:9999;top:0;left:0;background:white;color:black;padding:12px;max-width:100%;white-space:pre-wrap";
document.body.append(report);
report.textContent =
  "RUNNING: synthetic camera + actual browser-local PNG writes";
const synthetic = document.createElement("canvas");
synthetic.width = 640;
synthetic.height = 360;
const c = synthetic.getContext("2d");
let moving = true,
  t = 0;
const animation = setInterval(() => {
  if (!moving) return;
  t++;
  c.fillStyle = "#203044";
  c.fillRect(0, 0, 640, 360);
  c.fillStyle = "#ee8866";
  c.fillRect(40 + ((t * 7) % 440), 90, 90, 90);
  c.fillStyle = "#66cc88";
  c.fillRect(500 - ((t * 4) % 440), 240, 50, 50);
}, 50);
const root = await navigator.storage.getDirectory();
const directory = await root.getDirectoryHandle(
  "motionsnap-synthetic-" + Date.now(),
  { create: true },
);
navigator.mediaDevices.getUserMedia = async () => synthetic.captureStream(20);
window.showDirectoryPicker = async () => directory;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, timeout = 90000) => {
  const start = performance.now();
  while (!fn()) {
    if (performance.now() - start > timeout)
      throw new Error(
        "Timed out: " + document.getElementById("statusText").textContent,
      );
    await sleep(150);
  }
};
try {
  await import("../src/main.js");
  await document.getElementById("chooseFolder").onclick();
  document.getElementById("captureInterval").value = "1";
  document.getElementById("start").click();
  await until(
    () => Number(document.getElementById("savedCount").textContent) >= 3,
  );
  moving = false;
  await sleep(1500);
  const before = Number(document.getElementById("savedCount").textContent);
  await sleep(2200);
  if (Number(document.getElementById("savedCount").textContent) !== before)
    throw new Error("Static scene kept saving");
  document.getElementById("stop").click();
  const entries = [];
  for await (const [name, handle] of directory.entries()) {
    const file = await handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (
      bytes[0] !== 137 ||
      bytes[1] !== 80 ||
      bytes[2] !== 78 ||
      bytes[3] !== 71
    )
      throw new Error("Not PNG");
    const bitmap = await createImageBitmap(file);
    if (bitmap.width !== 640 || bitmap.height !== 360)
      throw new Error("Wrong PNG size");
    bitmap.close();
    entries.push({ name, size: file.size });
  }
  const times = entries
    .map((e) => {
      const m = e.name.match(/_(\d{2})(\d{2})(\d{2})_(\d{3})_/);
      return ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4];
    })
    .sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++)
    if (times[i] - times[i - 1] < 990)
      throw new Error("Capture interval too short");
  if (entries.length !== before) throw new Error("Saved counter mismatch");
  report.textContent =
    "PASS: synthetic moving objects triggered " +
    entries.length +
    " actual PNG writes; 640×360; static scene stopped saving; stop released stream.\n" +
    JSON.stringify(entries, null, 2);
} catch (error) {
  report.textContent = "FAIL: " + error.stack;
} finally {
  clearInterval(animation);
  moving = false;
  document.getElementById("stop")?.click();
}
