import test from "node:test";
import assert from "node:assert/strict";
import { appHarness, deferred, tick } from "./app-harness.mjs";
import { selectBuiltInCamera } from "../src/camera.js";
const physical = { kind: "videoinput", label: "Chicony USB2.0 Camera", deviceId: "chicony" };
const virtual = { kind: "videoinput", label: "vivo Virtual Camera", deviceId: "vivo" };
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
