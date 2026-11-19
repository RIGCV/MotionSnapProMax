import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { CaptureGate, captureName, saveBlob } from "../src/capture.js";
import { selectCaptureDirectory, folderErrorMessage } from "../src/folder.js";
import { CLASS_NAMES, COLORS, matchesCategory } from "../src/detection.js";
import { MotionDetector } from "../src/motion.js";
import { selectBuiltInCamera, stopMediaTracks, acquireCameraLease } from "../src/camera.js";
export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
export const tick = () => new Promise((r) => setImmediate(r));
// Pure Node test double: no browser, camera or OS permission is accessed.
export async function appHarness({ locks = mockLocks() } = {}) {
  const events = [],
    windowEvents = new Map(),
    documentEvents = new Map(),
    files = new Map(),
    nodes = new Map(),
    frames = new Map();
  let rafId = 0;
  const drawing = {
    drawImage() {},
    save() {},
    restore() {},
    strokeRect() {},
    fillRect() {},
    fillText() {},
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    measureText: (t) => ({ width: t.length * 6 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  const state = {
    pickCount: 0,
    cameraCount: 0,
    stopCount: 0,
    permission: "granted",
    requests: 0,
    encodeWait: null,
    closeWait: null,
    writeError: null,
    pick: null,
    devices: [{ kind: "videoinput", label: "Integrated Camera", deviceId: "builtin" }],
    cameraConstraints: [],
  };
  class Element {
    constructor() {
      this.value = "";
      this.textContent = "";
      this.checked = false;
      this.hidden = false;
      this.disabled = false;
      this.options = [];
      this.style = { setProperty() {} };
      this.classList = { toggle() {}, add() {}, remove() {} };
      this.children = [];
    }
    replaceChildren(...items) {
      this.children = items;
      this.options = items;
    }
    append(...items) {
      this.children.push(...items);
    }
    add(o) {
      this.options.push(o);
    }
    addEventListener() {}
    removeAttribute() {}
    getContext() {
      return drawing;
    }
    toBlob(callback, type) {
      events.push("encode");
      if (type !== "image/png") throw new Error("wrong MIME");
      const deliver = () => callback(new Blob(["mock PNG payload"], { type }));
      if (state.encodeWait) state.encodeWait.promise.then(deliver);
      else queueMicrotask(deliver);
    }
  }
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  for (const [, id] of html.matchAll(/id="([^"]+)"/g))
    nodes.set(id, new Element());
  for (const [id, value] of Object.entries({
    quality: "320",
    backend: "auto",
    speed: "30",
    confidence: "35",
    category: "all",
    sensitivity: "high",
  }))
    nodes.get(id).value = value;
  nodes.get("autoCapture").checked = true;
  nodes.get("trails").checked = true;
  const video = nodes.get("video");
  Object.assign(video, {
    videoWidth: 640,
    videoHeight: 360,
    currentTime: 1,
    readyState: 2,
    play: async () => {
      events.push("play");
      if (state.playError) throw state.playError;
      if (state.playWait) await state.playWait.promise;
    },
    pause: () => {},
    srcObject: null,
  });
  const directory = {
    name: "Selected captures",
    queryPermission: async () => {
      events.push("permission-query");
      return state.permission;
    },
    requestPermission: async () => {
      events.push("permission-request");
      state.requests++;
      return state.permission;
    },
    getFileHandle: async (name, options) => {
      events.push("get-file");
      if (!options.create) throw new Error("create required");
      return {
        createWritable: async () => {
          events.push("create-writable");
          let data;
          return {
            write: async (blob) => {
              events.push("write");
              if (state.writeError) throw state.writeError;
              data = blob;
            },
            close: async () => {
              events.push("close-begin");
              if (state.closeWait) await state.closeWait.promise;
              files.set(name, data);
              events.push("close-done");
            },
            abort: async () => events.push("abort"),
          };
        },
      };
    },
  };
  const window = {
    showDirectoryPicker: (options) => {
      events.push("picker");
      state.pickCount++;
      if (options.mode !== "readwrite") throw new Error("readwrite required");
      return state.pick ? state.pick(options) : Promise.resolve(directory);
    },
    addEventListener(name, handler) { windowEvents.set(name, handler); },
  };
  window.top = window;
  const navigator = {
    locks,
    userActivation: { isActive: true },
    mediaDevices: {
      enumerateDevices: async () => state.devices,
      getUserMedia: async (constraints) => {
        state.cameraConstraints.push(constraints);
        events.push("camera");
        state.cameraCount++;
        if (state.cameraWait) return state.cameraWait.promise;
        return {
          getTracks: () => [
            {
              stop() {
                state.stopCount++;
                events.push("track-stop");
              },
            },
          ],
          getVideoTracks: () => [{ addEventListener() {} }],
        };
      },
    },
  };
  class Worker {
    postMessage(data) {
      events.push("worker-" + data.type);
      if (data.type === "init")
        queueMicrotask(() =>
          state.modelWait ? state.modelWait.promise.then(() => this.onmessage?.({ data: { type: "ready", size: 320, backend: "mock" } })) : this.onmessage?.({
            data: { type: "ready", size: 320, backend: "mock" },
          }),
        );
    }
    terminate() {
      events.push("worker-terminate");
    }
  }
  let source = await readFile(
    new URL("../src/main.js", import.meta.url),
    "utf8",
  );
  source = source
    .replace(/^import[^\n]*;\r?$/gm, "")
    .replaceAll("import.meta.env.BASE_URL", '"./"')
    .replaceAll("import.meta.url", '"https://test.invalid/src/main.js"');
  source +=
    "\nglobalThis.appTest={start,stop,captureFrame,renderLive,checkCameraHealth,setHidden:value=>{document.hidden=value;},setMotion:value=>{motion=value;},getState:()=>({running,starting,choosingFolder,directory,directoryWritable,saved,busy:gate.busy,storageFailure})};";
  const context = vm.createContext({
    window,
    navigator,
    document: {
      hidden: false,
      getElementById: (id) => {
        if (!nodes.has(id)) throw new Error("Missing " + id);
        return nodes.get(id);
      },
      createElement: () => new Element(),
      addEventListener(name, handler) { documentEvents.set(name, handler); },
    },
    console,
    URL,
    URLSearchParams,
    Blob,
    DOMException,
    Date,
    performance,
    crypto: webcrypto,
    isSecureContext: true,
    location: { href: "https://test.invalid/", search: "" },
    Option: class {
      constructor(label, value) {
        this.label = label;
        this.value = value;
      }
    },
    Worker,
    createImageBitmap: async () => ({ close() {} }),
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (cb) => {
      frames.set(++rafId, cb);
      return rafId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    CaptureGate,
    captureName,
    saveBlob,
    selectCaptureDirectory,
    folderErrorMessage,
    CLASS_NAMES,
    COLORS,
    matchesCategory,
    MotionDetector,
    selectBuiltInCamera,
    stopMediaTracks,
    acquireCameraLease,
    logEvent() {},
    errorDetail: (e) => ({ name: e.name, message: e.message }),
    getDiagnostics: () => [],
  });
  new vm.Script(source, { filename: "main.js" }).runInContext(context);
  await tick();
  events.length = 0;
  return {
    app: context.appTest,
    nodes,
    state,
    events,
    files,
    directory,
    window,
    frames,
    windowEvents,
    documentEvents,
  };
}

export function mockLocks() {
  let held = false;
  return {
    async request(name, options, callback) {
      if (held) return callback(null);
      held = true;
      try { return await callback({ name }); }
      finally { held = false; }
    },
  };
}
