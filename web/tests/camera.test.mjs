import test from "node:test";
import assert from "node:assert/strict";
import { appHarness, deferred, tick, mockLocks } from "./app-harness.mjs";
import { selectBuiltInCamera } from "../src/camera.js";
const physical = { kind: "videoinput", label: "Chicony USB2.0 Camera", deviceId: "chicony" };
const virtual = { kind: "videoinput", label: "vivo Virtual Camera", deviceId: "vivo" };

test("model loading and its cancellation never reserve a camera", async () => {
  const h = await appHarness();
  h.state.modelWait = deferred();
  const pending = h.app.start();
  await tick();
  assert.equal(h.state.cameraCount, 0);
  h.app.stop();
  await pending;
  assert.equal(h.state.cameraCount, 0);
});

test("same-origin pages cannot acquire the camera concurrently", async () => {
  const locks = mockLocks();
  const a = await appHarness({ locks }), b = await appHarness({ locks });
  await a.app.start();
  await b.app.start();
  assert.equal(b.state.cameraCount, 0);
  assert.match(b.nodes.get("statusText").textContent, /另一个 MotionSnap/);
  a.app.stop();
  await tick();
  await b.app.start();
  assert.equal(b.state.cameraCount, 1);
  b.app.stop();
});

test("cancelled pending request keeps the cross-tab lease until late stream is stopped", async () => {
  const locks = mockLocks();
  const a = await appHarness({ locks }), b = await appHarness({ locks });
  a.state.cameraWait = deferred();
  const pending = a.app.start();
  await tick();
  a.app.stop();
  assert.match(a.nodes.get("statusText").textContent, /等待浏览器/);
  await b.app.start();
  assert.equal(b.state.cameraCount, 0);
  let released = 0;
  a.state.cameraWait.resolve({ getTracks: () => [{ stop() { released++; } }] });
  await pending;
  await tick();
  assert.equal(released, 1);
  await b.app.start();
  assert.equal(b.state.cameraCount, 1);
  b.app.stop();
});

test("detaching a broken video element cannot bypass device release", async () => {
  const h = await appHarness();
  await h.app.start();
  const source = h.nodes.get("video").srcObject;
  Object.defineProperty(h.nodes.get("video"), "srcObject", {
    get: () => source, set: () => { throw new Error("detached DOM"); },
  });
  h.app.stop();
  assert.equal(h.state.stopCount, 1);
  assert.equal(h.app.getState().running, false);
});

test("capture requests cap resolution and FPS instead of requesting HD by default", async () => {
  const h = await appHarness();
  await h.app.start();
  const video = h.state.cameraConstraints[0].video;
  assert.equal(video.width.max, 640);
  assert.equal(video.height.max, 480);
  assert.equal(video.frameRate.max, 30);
  h.app.stop();
});

test("render failure releases camera instead of leaving a live stream with a frozen UI", async () => {
  const h = await appHarness();
  await h.app.start();
  await tick();
  h.nodes.get("canvas").getContext().drawImage = () => { throw new Error("canvas lost"); };
  h.app.renderLive(performance.now());
  assert.equal(h.state.stopCount, 1);
  assert.equal(h.app.getState().running, false);
});

test("hung inference releases camera even when video frames continue arriving", async () => {
  const h = await appHarness();
  await h.app.start();
  await tick();
  h.nodes.get("video").currentTime++;
  h.app.checkCameraHealth(performance.now() + 21000);
  assert.equal(h.state.stopCount, 1);
  assert.match(h.nodes.get("statusText").textContent, /检测引擎长时间未响应/);
});

test("camera frames drive inference and automatic saves while preview rendering is suspended", async (t) => {
  const h = await appHarness({ trackProcessor: true });
  t.after(h.app.stop);
  let released = 0;
  h.state.now = 100;
  const start = h.app.start();
  await tick();
  h.state.frameStream.enqueue({ displayWidth: 640, displayHeight: 360, close: () => released++ });
  await start;
  await tick();
  const first = h.state.detections[0];
  h.state.worker.onmessage({ data: { ...first, type: "result", tracks: [], processingMs: 10 } });
  assert.equal(h.frames.size, 1);

  h.app.setHidden(true);
  h.documentEvents.get("visibilitychange")();
  assert.equal(h.frames.size, 0);
  h.state.now += 40;
  h.state.frameStream.enqueue({ displayWidth: 640, displayHeight: 360, hasMotion: true, close: () => released++ });
  await tick();
  assert.equal(h.state.detections.length, 2);
  assert.equal(h.files.size, 1);
  assert.equal(h.nodes.get("gallery").children.length, 0);
  assert.equal(h.state.stopCount, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.app.getState().running, true);

  h.app.setHidden(false);
  h.documentEvents.get("visibilitychange")();
  assert.equal(h.frames.size, 1);
  assert.equal(h.nodes.get("gallery").children.length, 1);
  assert.equal(h.state.cameraCount, 1);
  h.app.stop();
  assert.equal(released, 2);
  assert.ok(h.events.includes("reader-cancel"));
});

test("switching tabs while a camera request is pending allows it to complete", async () => {
  const h = await appHarness();
  h.state.cameraWait = deferred();
  const pending = h.app.start();
  await tick();
  h.app.setHidden(true);
  h.documentEvents.get("visibilitychange")();
  const track = { addEventListener() {}, stop() { h.state.stopCount++; } };
  h.state.cameraWait.resolve({ getTracks: () => [track], getVideoTracks: () => [track] });
  await pending;
  assert.equal(h.state.stopCount, 0);
  assert.equal(h.app.getState().running, true);
  h.app.stop();
});

test("rotation updates preview, inference and PNG geometry and drops old detections", async (t) => {
  const h = await appHarness({ trackProcessor: true });
  t.after(h.app.stop);
  const start = h.app.start();
  await tick();
  const sendFrame = (displayWidth, displayHeight, hasMotion = false) =>
    h.state.frameStream.enqueue({ displayWidth, displayHeight, hasMotion, close() {} });
  sendFrame(640, 360);
  await start;
  await tick();

  const first = h.state.detections[0];
  const rotation = h.nodes.get("rotation");
  rotation.value = "90";
  rotation.onchange();
  const canvas = h.nodes.get("canvas");
  assert.deepEqual([canvas.width, canvas.height], [360, 640]);
  h.state.worker.onmessage({ data: { ...first, type: "result", tracks: [{ id: 1, cls: 0 }], processingMs: 10 } });
  assert.equal(h.nodes.get("targetCount").textContent, 0);
  sendFrame(640, 360, true);
  await tick();
  const rotated = h.state.detections[1];
  assert.deepEqual([rotated.bitmap.width, rotated.bitmap.height], [360, 640]);
  assert.equal(h.files.size, 0, "first frame after rotation establishes a new motion baseline");
  assert.equal(await h.app.captureFrame("manual"), true);
  assert.deepEqual(h.state.encodedSizes[0], [360, 640]);

  rotation.value = "0";
  rotation.onchange();
  sendFrame(480, 640);
  await tick();
  assert.deepEqual([canvas.width, canvas.height], [480, 640]);
  assert.equal(h.nodes.get("sourceResolution").textContent, "480 × 640");
});

test("video play hanging releases acquired camera on watchdog timeout", async () => {
  const h = await appHarness();
  h.state.playWait = deferred();
  const pending = h.app.start();
  await tick();
  h.app.checkCameraHealth(performance.now() + 21000);
  assert.equal(h.state.stopCount, 1);
  assert.equal(h.app.getState().starting, false);
  h.state.playWait.resolve();
  await pending;
  assert.equal(h.app.getState().running, false);
});

test("stalled running video is stopped and released", async () => {
  const h = await appHarness();
  await h.app.start();
  h.app.checkCameraHealth(performance.now() + 11000);
  assert.equal(h.state.stopCount, 1);
  assert.equal(h.app.getState().running, false);
  assert.match(h.nodes.get("statusText").textContent, /未能持续提供画面/);
});

test("zero-sized video never enters monitoring and releases stream", async () => {
  const h = await appHarness();
  h.nodes.get("video").videoWidth = 0;
  await h.app.start();
  assert.equal(h.state.stopCount, 1);
  assert.equal(h.app.getState().running, false);
});

test("pending device timeout blocks duplicate requests and disposes late success", async () => {
  const h = await appHarness();
  h.state.cameraWait = deferred();
  const pending = h.app.start();
  await tick();
  h.app.checkCameraHealth(performance.now() + 21000);
  await h.app.start();
  assert.equal(h.state.cameraCount, 1);
  let stopped = 0;
  h.state.cameraWait.resolve({ getTracks: () => [{ stop: () => stopped++ }] });
  await pending;
  assert.equal(stopped, 1);
  assert.equal(h.app.getState().running, false);
  assert.equal(h.nodes.get("start").disabled, false);
});

test("advancing video refreshes watchdog even when the image is dark", async () => {
  const h = await appHarness();
  await h.app.start();
  h.nodes.get("video").currentTime++;
  h.app.checkCameraHealth(performance.now() + 11000);
  assert.equal(h.state.stopCount, 0);
  assert.equal(h.app.getState().running, true);
  h.app.stop();
});
test("vivo default is excluded and Chicony hardware is requested explicitly", async () => {
  const h = await appHarness();
  h.state.devices = [virtual, physical];
  await h.app.start();
  assert.equal(h.state.cameraCount, 1);
  assert.equal(h.state.cameraConstraints[0].video.deviceId.exact, "chicony");
  assert.equal(h.nodes.get("cameraSelect").options[0].label, physical.label);
  h.app.stop();
});
test("virtual-only or unidentified devices are not silently opened", async () => {
  for (const devices of [[virtual], [{ ...virtual, label: "Unknown Camera" }]]) {
    const h = await appHarness();
    h.state.devices = devices;
    await h.app.start();
    assert.equal(h.state.cameraCount, 0);
    assert.equal(h.app.getState().running, false);
    assert.match(h.nodes.get("statusText").textContent, /未能识别/);
  }
  assert.equal(selectBuiltInCamera([{ ...physical, label: "Integrated IR Camera" }]), undefined);
});
test("first permission probe is released before opening named built-in camera", async () => {
  const h = await appHarness();
  Object.defineProperty(h.state, "devices", { get: () => h.state.cameraCount ? [virtual, physical] : [{ kind: "videoinput", label: "", deviceId: "" }] });
  await h.app.start();
  assert.equal(h.state.cameraCount, 2);
  assert.equal(h.state.stopCount, 1);
  assert.equal(h.state.cameraConstraints[1].video.deviceId.exact, "chicony");
  assert.equal(h.events.filter(e => e === "play").length, 1);
  h.app.stop();
  assert.equal(h.state.stopCount, 2);
});
test("exit while permission probe is pending releases it without reopening a device", async () => {
  const h = await appHarness();
  h.state.devices = [{ kind: "videoinput", label: "", deviceId: "" }];
  h.state.cameraWait = deferred();
  const pending = h.app.start();
  await tick();
  h.nodes.get("exit").onclick();
  let stopped = 0;
  h.state.cameraWait.resolve({ getTracks: () => [{ stop: () => stopped++ }] });
  await pending;
  assert.equal(stopped, 1);
  assert.equal(h.state.cameraCount, 1);
  assert.equal(h.app.getState().running, false);
});
