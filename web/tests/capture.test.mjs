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
test("consecutive motion frames save immediately without interval; static or disabled frames do not save", async () => {
  const gate = new CaptureGate();
  let count = 0;
  const save = async () => {
    count++;
  };
  for (let i = 0; i < 25; i++)
    assert.equal(
      await gate.attempt({ active: true, enabled: true }, save),
      true,
    );
  assert.equal(count, 25);
  assert.equal(
    await gate.attempt({ active: false, enabled: true }, save),
    false,
  );
  assert.equal(
    await gate.attempt({ active: true, enabled: false }, save),
    false,
  );
  assert.equal(count, 25);
});
test("writes cannot overlap; cancellation and failure release the writer", async () => {
  const g = new CaptureGate(),
    args = { active: true, enabled: true };
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

import { screenshotsDirectory } from "../src/folder.js";
test("Screenshots is created once and reused without clearing existing files", async () => {
  const folders = new Map();
  let calls = 0;
  const parent = {
    getDirectoryHandle: async (name, options) => {
      calls++;
      assert.equal(name, "Screenshots");
      assert.deepEqual(options, { create: true });
      if (!folders.has(name)) folders.set(name, { files: ["existing.png"] });
      return folders.get(name);
    },
  };
  const a = await screenshotsDirectory(parent),
    b = await screenshotsDirectory(parent);
  assert.equal(a, b);
  assert.deepEqual(b.files, ["existing.png"]);
  assert.equal(calls, 2);
});
test("folder access failure propagates without choosing another location", async () => {
  await assert.rejects(
    screenshotsDirectory({
      getDirectoryHandle: async () => {
        throw new Error("Permission denied");
      },
    }),
    /Permission denied/,
  );
});
