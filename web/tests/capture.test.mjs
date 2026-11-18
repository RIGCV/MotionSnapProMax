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

import { selectCaptureDirectory, folderErrorMessage } from "../src/folder.js";
import { captureName } from "../src/capture.js";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("native readwrite picker is immediate, followed by query only; no second prompt", async () => {
  const events = [];
  const selected = {
    name: "test",
    queryPermission: async () => {
      events.push("query");
      return "granted";
    },
    requestPermission: () => assert.fail("No second prompt"),
  };
  const pending = selectCaptureDirectory(
    (options) => {
      events.push("picker");
      assert.equal(options.mode, "readwrite");
      return Promise.resolve(selected);
    },
    undefined,
    () => events.push("selected"),
  );
  assert.deepEqual(events, ["picker"]);
  assert.equal(await pending, selected);
  assert.deepEqual(events, ["picker", "selected", "query"]);
});
test("ungranted permission after picker requires a new explicit click; stale selection never requests permission", async () => {
  const selected = {
    name: "test",
    queryPermission: async () => "prompt",
    requestPermission: () => assert.fail("No implicit request"),
  };
  await assert.rejects(
    selectCaptureDirectory(async () => selected),
    { name: "NotAllowedError" },
  );
  assert.equal(
    await selectCaptureDirectory(
      async () => selected,
      undefined,
      () => assert.fail(),
      () => false,
    ),
    null,
  );
});
test("reauthorization requests immediately from the new click and reports denied permission", async () => {
  let requested = false;
  const selected = {
    requestPermission: () => {
      requested = true;
      return Promise.resolve("denied");
    },
    queryPermission: () => assert.fail("No delay before request"),
  };
  const pending = selectCaptureDirectory(undefined, selected);
  assert.equal(requested, true);
  await assert.rejects(pending, { name: "NotAllowedError" });
});
test("folder errors remain stage-specific without claiming that AbortError always means cancellation", async () => {
  for (const name of [
    "AbortError",
    "SecurityError",
    "NotAllowedError",
    "NotFoundError",
  ]) {
    const error = new DOMException("Native diagnostic", name);
    await assert.rejects(
      selectCaptureDirectory(async () => {
        throw error;
      }),
      (e) => e === error && e.folderStage === "picker",
    );
    assert.ok(folderErrorMessage(error).length > 10);
  }
  assert.ok(!folderErrorMessage({ name: "AbortError" }).startsWith("已取消"));
  await assert.rejects(selectCaptureDirectory(undefined), {
    name: "NotSupportedError",
  });
});
test("actual filesystem adapter writes a known PNG unchanged; identical millisecond names remain unique", async () => {
  const root = await mkdtemp(join(tmpdir(), "motionsnap-write-test-"));
  // Adapter verifies write/close contract on disk; it does NOT test browser permission.
  const directory = {
    queryPermission: async () => "granted",
    getFileHandle: async (name, options) => {
      assert.equal(options.create, true);
      return {
        createWritable: async () => {
          let bytes;
          return {
            write: async (blob) => {
              bytes = Buffer.from(await blob.arrayBuffer());
            },
            close: async () =>
              writeFile(join(root, name), bytes, { flag: "wx" }),
            abort: async () => {},
          };
        },
      };
    },
  };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1kAAAAASUVORK5CYII=",
    "base64",
  );
  const names = new Set(),
    date = new Date(2026, 10, 18, 12, 0, 0, 123);
  try {
    for (let i = 0; i < 20; i++) {
      const name = captureName(date);
      assert.ok(!names.has(name));
      names.add(name);
      await saveBlob(directory, name, new Blob([png], { type: "image/png" }));
      assert.deepEqual(await readFile(join(root, name)), png);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
