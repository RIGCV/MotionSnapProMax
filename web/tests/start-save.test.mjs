import test from "node:test";
import assert from "node:assert/strict";
import { appHarness, deferred, tick } from "./app-harness.mjs";
test("start calls picker synchronously before permission, camera and model; duplicate clicks open only once", async () => {
  const h = await appHarness(),
    pick = deferred();
  h.state.pick = () => pick.promise;
  const first = h.nodes.get("emptyStart").onclick();
  assert.deepEqual(h.events, ["picker"]);
  await h.nodes.get("start").onclick();
  assert.equal(h.state.pickCount, 1);
  assert.equal(h.state.cameraCount, 0);
  pick.resolve(h.directory);
  await first;
  assert.equal(h.app.getState().running, true);
  assert.ok(h.events.indexOf("picker") < h.events.indexOf("permission-query"));
  assert.ok(h.events.indexOf("permission-query") < h.events.indexOf("camera"));
  assert.ok(h.events.indexOf("camera") < h.events.indexOf("worker-init"));
  h.app.stop();
});
test("picker AbortError does not start camera, unlocks buttons and allows retry", async () => {
  const h = await appHarness();
  h.state.pick = async () => {
    throw new DOMException("The user aborted a request.", "AbortError");
  };
  await h.app.start();
  assert.equal(h.state.cameraCount, 0);
  assert.equal(h.nodes.get("start").disabled, false);
  assert.equal(h.app.getState().choosingFolder, false);
  assert.ok(!h.nodes.get("captureStatus").textContent.startsWith("已取消"));
  h.state.pick = null;
  await h.app.start();
  assert.equal(h.app.getState().running, true);
  h.app.stop();
});
test("stop during picker discards late handle; restart selects again; reload has no handle", async () => {
  const h = await appHarness(),
    pick = deferred();
  h.state.pick = () => pick.promise;
  const start = h.app.start();
  h.app.stop();
  pick.resolve(h.directory);
  await start;
  assert.equal(h.state.cameraCount, 0);
  assert.equal(h.app.getState().directory, undefined);
  assert.ok(!h.events.includes("permission-query"));
  h.state.pick = null;
  await h.app.start();
  h.app.stop();
  await h.app.start();
  assert.equal(h.state.pickCount, 3);
  h.app.stop();
  const reloaded = await appHarness();
  assert.equal(reloaded.app.getState().directory, undefined);
  await reloaded.app.start();
  assert.equal(reloaded.state.pickCount, 1);
  reloaded.app.stop();
});
test("auto and manual captures share lock; count follows close; stop drains last write", async () => {
  const h = await appHarness();
  await h.app.start();
  h.app.setMotion({ active: true, regions: [] });
  h.state.closeWait = deferred();
  const pending = h.app.captureFrame("auto");
  await tick();
  assert.ok(h.events.includes("close-begin"));
  assert.equal(h.app.getState().saved, 0);
  assert.equal(h.files.size, 0);
  assert.equal(await h.nodes.get("snapshot").onclick(), false);
  assert.equal(await h.app.captureFrame("auto"), false);
  h.app.stop();
  assert.ok(h.state.stopCount > 0);
  assert.equal(h.nodes.get("start").disabled, true);
  h.state.closeWait.resolve();
  await pending;
  assert.equal(h.files.size, 1);
  assert.equal(h.app.getState().saved, 1);
  assert.equal(h.nodes.get("start").disabled, false);
  assert.match(h.nodes.get("captureStatus").textContent, /监测已停止/);
});
test("stop while PNG encoding prevents file creation; false motion produces no capture", async () => {
  const h = await appHarness();
  await h.app.start();
  assert.equal(await h.app.captureFrame("auto"), false);
  assert.ok(!h.events.includes("encode"));
  h.app.setMotion({ active: true, regions: [] });
  h.state.encodeWait = deferred();
  const pending = h.app.captureFrame("auto");
  h.app.stop();
  h.state.encodeWait.resolve();
  assert.equal(await pending, false);
  assert.equal(h.files.size, 0);
  assert.ok(!h.events.includes("get-file"));
});
test("revoked permission pauses saving without asynchronous permission prompt; camera still runs", async () => {
  const h = await appHarness();
  await h.app.start();
  h.app.setMotion({ active: true, regions: [] });
  h.state.permission = "denied";
  assert.equal(await h.app.captureFrame("auto"), false);
  assert.equal(h.state.requests, 0);
  assert.equal(h.files.size, 0);
  assert.equal(h.app.getState().directoryWritable, false);
  assert.equal(h.app.getState().running, true);
  assert.equal(h.nodes.get("autoCapture").checked, false);
  assert.equal(h.nodes.get("authorizeFolder").hidden, false);
  h.state.permission = "granted";
  await h.nodes.get("authorizeFolder").onclick();
  assert.equal(h.state.requests, 1);
  h.nodes.get("autoCapture").checked = true;
  assert.equal(await h.app.captureFrame("auto"), true);
  assert.equal(h.files.size, 1);
  h.app.stop();
});
test("write and close failures do not increment count or request permission", async () => {
  for (const at of ["write", "close"]) {
    const h = await appHarness();
    await h.app.start();
    h.app.setMotion({ active: true, regions: [] });
    if (at === "write")
      h.state.writeError = new DOMException("Disk full", "QuotaExceededError");
    else h.state.closeWait = deferred();
    const pending = h.app.captureFrame("auto");
    if (at === "close") {
      await tick();
      h.state.closeWait.reject(
        new DOMException("Cannot commit", "UnknownError"),
      );
    }
    await pending;
    assert.equal(h.files.size, 0);
    assert.equal(h.app.getState().saved, 0);
    assert.equal(h.state.requests, 0);
    assert.equal(h.nodes.get("autoCapture").checked, false);
    assert.match(h.nodes.get("captureStatus").textContent, /保存失败/);
    h.app.stop();
  }
});
test("consecutive PNG captures have distinct names", async () => {
  const h = await appHarness();
  await h.app.start();
  h.app.setMotion({ active: true, regions: [] });
  for (let i = 0; i < 10; i++)
    assert.equal(await h.app.captureFrame("auto"), true);
  assert.equal(h.files.size, 10);
  assert.equal(h.app.getState().saved, 10);
  for (const [name, blob] of h.files) {
    assert.match(name, /MotionSnap_\d{8}_\d{6}_\d{3}_auto_[a-f\d-]+\.png$/);
    assert.equal(blob.type, "image/png");
  }
  h.app.stop();
});
