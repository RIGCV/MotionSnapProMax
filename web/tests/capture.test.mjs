import test from "node:test";
import assert from "node:assert/strict";
import { MotionDetector } from "../src/motion.js";
import { CaptureGate, saveBlob } from "../src/capture.js";
const image = (level = 50) => new Uint8ClampedArray(40 * 30 * 4).fill(level);
function box(a, x, y) {
  for (let j = y; j < y + 6; j++)
    for (let i = x; i < x + 6; i++)
      for (let c = 0; c < 3; c++) a[(j * 40 + i) * 4 + c] = 200;
  return a;
}
test("arbitrary moving regions trigger without model classes, static and uniform lighting do not", () => {
  const d = new MotionDetector(40, 30),
    a = box(image(), 4, 6);
  assert.equal(d.analyze(a).active, false);
  assert.equal(d.analyze(a).active, false);
  const b = box(image(), 10, 6),
    r = d.analyze(b);
  assert.equal(r.active, true);
  assert.ok(
    r.regions.every((r) => r.x1 >= 0 && r.x2 <= 1 && r.y1 >= 0 && r.y2 <= 1),
  );
  assert.equal(d.analyze(b).active, false);
  d.reset();
  d.analyze(image(50));
  assert.equal(d.analyze(image(70)).active, false);
  const noise = image(70);
  noise[500] = 255;
  assert.equal(d.analyze(noise).active, false);
});
test("multiple independent moving objects produce multiple regions", () => {
  const d = new MotionDetector(40, 30);
  d.analyze(image());
  assert.equal(d.analyze(box(box(image(), 4, 5), 26, 19)).regions.length, 2);
});
for (let seconds = 1; seconds <= 5; seconds++)
  test(`capture gate enforces ${seconds} second interval and does not capture static frames`, async () => {
    const g = new CaptureGate();
    let count = 0;
    const run = (now, active = true, enabled = true) =>
      g.attempt(
        { now, interval: seconds * 1000, active, enabled },
        async () => {
          count++;
        },
      );
    assert.equal(await run(0), true);
    assert.equal(await run(seconds * 1000 - 1), false);
    assert.equal(await run(seconds * 1000, false), false);
    assert.equal(await run(seconds * 1000, true, false), false);
    assert.equal(await run(seconds * 1000), true);
    assert.equal(count, 2);
  });
test("writes cannot overlap, cancellation and failures do not consume capture interval", async () => {
  const g = new CaptureGate(),
    args = { now: 0, interval: 1000, active: true, enabled: true };
  let release;
  const pending = g.attempt(args, () => new Promise((r) => (release = r)));
  assert.equal(await g.attempt(args, () => assert.fail()), false);
  release(false);
  assert.equal(await pending, false);
  await assert.rejects(
    g.attempt(args, async () => {
      throw new Error("disk full");
    }),
  );
  assert.equal(await g.attempt(args, async () => {}), true);
});
test("file save commits through close and aborts after write error", async () => {
  const calls = [];
  const dir = {
    getFileHandle: async (name, options) => {
      calls.push([name, options]);
      return {
        createWritable: async () => ({
          write: async (blob) => calls.push(blob),
          close: async () => calls.push("close"),
          abort: async () => calls.push("abort"),
        }),
      };
    },
  };
  const blob = new Blob(["image"]);
  await saveBlob(dir, "shot.png", blob);
  assert.equal(calls.at(-1), "close");
  assert.equal(calls[1], blob);
  let aborted = false;
  await assert.rejects(
    saveBlob(
      {
        getFileHandle: async () => ({
          createWritable: async () => ({
            write: async () => {
              throw new Error("disk full");
            },
            abort: async () => {
              aborted = true;
            },
          }),
        }),
      },
      "shot.png",
      blob,
    ),
  );
  assert.equal(aborted, true);
});
