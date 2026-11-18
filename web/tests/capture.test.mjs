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
test("selection is immediate, directory is retained before separate write authorization", async () => {
  const events = [];
  const selected = {
    queryPermission: async (options) => {
      assert.equal(options.mode, "readwrite");
      events.push("query");
      return "prompt";
    },
    requestPermission: async (options) => {
      assert.equal(options.mode, "readwrite");
      events.push("request");
      return "granted";
    },
  };
  const pending = selectCaptureDirectory(
    (options) => {
      events.push("picker");
      assert.equal(options.mode, "read");
      return Promise.resolve(selected);
    },
    undefined,
    (handle) => {
      assert.equal(handle, selected);
      events.push("selected");
    },
  );
  assert.deepEqual(events, ["picker"]);
  assert.equal(await pending, selected);
  assert.deepEqual(events, ["picker", "selected", "query", "request"]);
});
test("already selected and authorized directory is reused without another picker or permission prompt", async () => {
  const selected = {
    queryPermission: async () => "granted",
    requestPermission: () => assert.fail("Already granted"),
  };
  assert.equal(
    await selectCaptureDirectory(
      () => assert.fail("Do not reopen picker"),
      selected,
    ),
    selected,
  );
});
test("denied write permission retains selection and retry can authorize without choosing again", async () => {
  let retained,
    allowed = false;
  const selected = {
    queryPermission: async () => "prompt",
    requestPermission: async () => (allowed ? "granted" : "denied"),
  };
  await assert.rejects(
    selectCaptureDirectory(
      async () => selected,
      undefined,
      (h) => (retained = h),
    ),
    { name: "NotAllowedError" },
  );
  assert.equal(retained, selected);
  allowed = true;
  assert.equal(
    await selectCaptureDirectory(() => assert.fail(), retained),
    selected,
  );
});
test("AbortError does not accuse user of cancelling and has no automatic retry loop", async () => {
  let count = 0;
  await assert.rejects(
    selectCaptureDirectory(async () => {
      count++;
      throw new DOMException("Rejected", "AbortError");
    }),
    { name: "AbortError" },
  );
  assert.equal(count, 1);
  const message = folderErrorMessage({ name: "AbortError" });
  assert.ok(message.includes("目录访问受限"));
  assert.ok(!message.startsWith("已取消"));
});
test("unsupported browser fails clearly; no fallback directory or implicit creation", async () => {
  await assert.rejects(selectCaptureDirectory(undefined), {
    name: "NotSupportedError",
  });
  const selected = {
    queryPermission: async () => "granted",
    getDirectoryHandle: () => assert.fail("Must not create a directory"),
  };
  assert.equal(await selectCaptureDirectory(async () => selected), selected);
});
