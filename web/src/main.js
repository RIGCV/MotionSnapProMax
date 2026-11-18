import "./styles.css";
import { CLASS_NAMES, COLORS, matchesCategory } from "./detection.js";
import { MotionDetector } from "./motion.js";
import { CaptureGate, captureName, saveBlob } from "./capture.js";
import { selectCaptureDirectory, folderErrorMessage } from "./folder.js";
import { logEvent, errorDetail, getDiagnostics } from "./diagnostics.js";
window.motionSnapDiagnostics = getDiagnostics;
const $ = (id) => document.getElementById(id),
  video = $("video"),
  canvas = $("canvas"),
  ctx = canvas.getContext("2d");
const frame = document.createElement("canvas"),
  frameCtx = frame.getContext("2d");
const motionCanvas = document.createElement("canvas"),
  motionCtx = motionCanvas.getContext("2d", { willReadFrequently: true });
let worker,
  modelReady = false,
  modelMode,
  initPromise,
  rejectInit,
  stream,
  running = false,
  starting = false,
  token = 0,
  timer,
  renderTimer,
  busy = false;
let tracks = [],
  lastResultAt = 0,
  actualFPS = 0,
  lastVideoTime = -1,
  lastMotionVideoTime = -1,
  motionDetector,
  motion = { active: false, regions: [] },
  directory,
  directoryWritable = false,
  directoryPrepared = false,
  storageFailure = "",
  saved = 0;
const gate = new CaptureGate(),
  previews = [];
const status = (message, error = false) => {
  $("statusText").textContent = message;
  $("statusText").classList.toggle("error", error);
};
const color = (id) => COLORS[(id - 1) % COLORS.length];
function updateButtons() {
  for (const id of [
    "start",
    "emptyStart",
    "backend",
    "quality",
    "cameraSelect",
  ])
    $(id).disabled = starting || running || choosingFolder || gate.busy;
  $("chooseFolder").disabled =
    starting ||
    running ||
    choosingFolder ||
    gate.busy ||
    !window.showDirectoryPicker;
  $("authorizeFolder").disabled = starting || choosingFolder || gate.busy;
  $("snapshot").disabled = !running || gate.busy || !directoryWritable;
  $("stop").disabled = !starting && !running;
  $("sessionBadge").textContent = running
    ? "● 摄像头运行中"
    : starting
      ? "◌ 正在启动"
      : "○ 摄像头未开启";
  $("sessionBadge").classList.toggle("active", running);
}
function visibleTracks() {
  return tracks.filter((t) => matchesCategory(t.cls, $("category").value));
}
function renderResults() {
  const list = $("targetList"),
    visible = visibleTracks();
  $("targetCount").textContent = visible.length;
  $("listCount").textContent = String(visible.length).padStart(2, "0");
  list.replaceChildren();
  if (!visible.length) {
    const p = document.createElement("div");
    p.className = "list-empty";
    p.textContent = "暂无识别目标 · 画面移动检测仍独立运行";
    list.append(p);
  }
  for (const t of visible.slice(0, 60)) {
    const card = document.createElement("div");
    card.className = "target-card";
    card.style.setProperty("--target-color", color(t.id));
    const name = document.createElement("strong");
    name.textContent = CLASS_NAMES[t.cls] || `类别 ${t.cls}`;
    const info = document.createElement("span");
    info.textContent = `#${t.id} · ${Math.round(t.score * 100)}%`;
    card.append(name, info);
    list.append(card);
  }
}
function draw(target = ctx, timestamp = false) {
  if (video.readyState < 2) return;
  const w = canvas.width,
    h = canvas.height;
  target.drawImage(video, 0, 0, w, h);
  target.save();
  target.lineWidth = Math.max(2, w / 650);
  const font = Math.max(14, w / 65);
  target.font = `600 ${font}px "Segoe UI","Microsoft YaHei",sans-serif`;
  for (const t of visibleTracks()) {
    target.strokeStyle = color(t.id);
    if ($("trails").checked && t.history.length > 1) {
      target.beginPath();
      t.history.forEach((p, i) =>
        i ? target.lineTo(p.x, p.y) : target.moveTo(p.x, p.y),
      );
      target.stroke();
    }
    target.strokeRect(t.x1, t.y1, t.x2 - t.x1, t.y2 - t.y1);
    const label = `#${t.id} ${CLASS_NAMES[t.cls]} ${Math.round(t.score * 100)}%`,
      lw = target.measureText(label).width + 12,
      y = Math.max(font + 10, t.y1);
    target.fillStyle = color(t.id);
    target.fillRect(Math.max(0, t.x1), y - font - 10, lw, font + 10);
    target.fillStyle = "#101715";
    target.fillText(label, Math.max(0, t.x1) + 6, y - 6);
  }
  target.strokeStyle = "#ffb285";
  target.setLineDash([8, 5]);
  for (const r of motion.regions)
    target.strokeRect(r.x1 * w, r.y1 * h, (r.x2 - r.x1) * w, (r.y2 - r.y1) * h);
  target.setLineDash([]);
  if (timestamp) {
    const label = `MotionSnap · ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
    target.fillStyle = "#101715cc";
    target.fillRect(
      0,
      h - font - 22,
      target.measureText(label).width + 24,
      font + 22,
    );
    target.fillStyle = "#fff";
    target.fillText(label, 12, h - 10);
  }
  target.restore();
}
function captureMessage(message, error = false) {
  $("captureStatus").textContent = message;
  $("captureStatus").classList.toggle("error", error);
}
function refreshCaptureStatus() {
  if (storageFailure) {
    captureMessage(storageFailure, true);
    return;
  }
  captureMessage(
    !directory
      ? "未选择目录 · 开启摄像头前请选择保存文件夹"
      : !directoryWritable
        ? "未获得写入权限 · 请点击授权保存"
        : gate.busy
          ? "正在保存图片，请等待写入完成"
          : !$("autoCapture").checked
            ? "已获得写入权限 · 自动截图已关闭"
            : running
              ? "已获得写入权限 · 移动即保存"
              : "已获得写入权限 · 等待启动监测",
  );
}
async function snapshotBlob() {
  const shot = document.createElement("canvas");
  shot.width = canvas.width;
  shot.height = canvas.height;
  draw(shot.getContext("2d"), true);
  return new Promise((resolve, reject) =>
    shot.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("截图编码失败"))),
      "image/png",
    ),
  );
}
function addPreview(blob, name) {
  const url = URL.createObjectURL(blob);
  $("lastSaved").textContent = new Date().toLocaleTimeString("zh-CN", {
    hour12: false,
  });
  previews.unshift({ url, name });
  if (previews.length > 4) URL.revokeObjectURL(previews.pop().url);
  $("gallery").replaceChildren();
  for (const item of previews) {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.name;
    a.className = "capture-thumb";
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = "已保存的带框截图";
    const label = document.createElement("span");
    label.textContent = item.name
      .slice(24, 30)
      .replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3");
    label.textContent =
      item.name
        .match(/_(\d{2})(\d{2})(\d{2})_/)
        ?.slice(1)
        .join(":") || "PNG";
    a.append(img, label);
    $("gallery").append(a);
  }
  $("galleryCount").textContent = String(saved).padStart(2, "0");
  $("savedCount").textContent = saved;
}
async function captureFrame(kind = "auto") {
  if (gate.busy) return false;
  const currentToken = token,
    folder = directory;
  try {
    return await gate.attempt(
      {
        active: kind === "manual" || motion.active,
        enabled:
          running &&
          !document.hidden &&
          !!folder &&
          directoryWritable &&
          (kind === "manual" || $("autoCapture").checked),
      },
      async () => {
        updateButtons();
        const name = captureName(new Date(), kind);
        logEvent("png-encode", "begin", { filename: name }, true);
        const blob = await snapshotBlob();
        logEvent(
          "png-encode",
          "complete",
          { filename: name, bytes: blob.size },
          true,
        );
        if (
          currentToken !== token ||
          !running ||
          document.hidden ||
          directory !== folder ||
          !directoryWritable ||
          (kind === "auto" && !$("autoCapture").checked)
        ) {
          logEvent(
            "file-save",
            "skipped-stale-frame",
            { filename: name },
            true,
          );
          return false;
        }
        // Completion means write AND close succeeded. Stop permits this single
        // in-flight write to finish, but releases the camera immediately.
        await saveBlob(folder, name, blob);
        saved++;
        addPreview(blob, name);
        captureMessage(
          `${running ? "已获得写入权限" : "监测已停止，最后一张写入完成"} · 已保存 ${saved} 张`,
        );
        return true;
      },
    );
  } catch (error) {
    logEvent("capture", "failed", errorDetail(error));
    if (directory === folder) {
      directoryWritable = false;
      $("autoCapture").checked = false;
      $("authorizeFolder").hidden = false;
      const advice =
        error.name === "NotFoundError"
          ? "目录已不可访问，请停止后重新选择。"
          : ["NotAllowedError", "SecurityError"].includes(error.name)
            ? "权限可能失效，请点击授权保存。"
            : "请检查目录或磁盘，恢复后点击授权保存重试。";
      storageFailure = `保存失败（${error.name || "Error"}）· 自动保存已暂停。${advice}`;
      captureMessage(storageFailure, true);
    }
    return false;
  } finally {
    updateButtons();
  }
}
function renderLive(now) {
  if (!running) return;
  if (!document.hidden && video.readyState >= 2) {
    if (video.currentTime !== lastMotionVideoTime) {
      lastMotionVideoTime = video.currentTime;
      motionCtx.drawImage(video, 0, 0, motionCanvas.width, motionCanvas.height);
      motion = motionDetector.analyze(
        motionCtx.getImageData(0, 0, motionCanvas.width, motionCanvas.height)
          .data,
        $("sensitivity").value,
      );
      $("motionState").textContent = motion.active ? "有移动" : "静止";
      $("motionState").classList.toggle("moving", motion.active);
      $("stageStatus").textContent = motion.active
        ? "发现画面移动"
        : "正在监测";
      void captureFrame("auto");
    }
    draw();
    $("stageClock").textContent = new Date().toLocaleTimeString("zh-CN", {
      hour12: false,
    });
  }
  renderTimer = requestAnimationFrame(renderLive);
}
function handleResult(data) {
  if (data.token !== token) return;
  busy = false;
  tracks = data.tracks;
  const now = performance.now();
  if (lastResultAt)
    actualFPS = actualFPS
      ? actualFPS * 0.65 + (1000 / (now - lastResultAt)) * 0.35
      : 1000 / (now - lastResultAt);
  lastResultAt = now;
  $("fps").textContent = actualFPS ? actualFPS.toFixed(1) : "—";
  $("latency").textContent = Math.round(data.processingMs);
  renderResults();
  if (running) {
    status("正在本地监测 · 画面移动检测与 AI 识别同时运行");
    timer = setTimeout(
      submitFrame,
      Math.max(0, 1000 / Number($("speed").value) - data.processingMs),
    );
  }
}
function stop({ keepStatus = false } = {}) {
  const wasBusy = busy;
  token++;
  directoryPrepared = false;
  logEvent("camera", "stop", { writeInFlight: gate.busy });
  running = false;
  starting = false;
  busy = false;
  clearTimeout(timer);
  cancelAnimationFrame(renderTimer);
  if (wasBusy || !modelReady) {
    worker?.terminate();
    worker = null;
    modelReady = false;
    modelMode = null;
    rejectInit?.(new Error("已取消加载"));
    initPromise = null;
    rejectInit = null;
    $("engineDot").classList.remove("active");
    $("engineStatus").textContent = "YOLO26n · 等待启动";
  }
  $("loadProgress").hidden = true;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.pause();
  video.srcObject = null;
  worker?.postMessage({ type: "reset" });
  $("liveDot").classList.remove("active");
  $("stageStatus").textContent = "已停止";
  $("snapshot").disabled = true;
  $("motionState").textContent = "待监测";
  $("motionState").classList.remove("moving");
  $("fps").textContent = "—";
  motion = { active: false, regions: [] };
  tracks = [];
  renderResults();
  updateButtons();
  refreshCaptureStatus();
  if (gate.busy && !storageFailure)
    captureMessage("监测已停止，正在完成最后一张写入…");
  if (!keepStatus) status("监测已停止 · 摄像头已释放");
}
function fail(error) {
  stop({ keepStatus: true });
  const messages = {
    NotAllowedError: "摄像头权限被拒绝，请在地址栏允许访问摄像头后重试。",
    NotFoundError: "未找到摄像头，请连接摄像头后重试。",
    NotReadableError: "摄像头无法打开，请关闭占用摄像头的其他应用。",
    OverconstrainedError: "所选摄像头不可用，请尝试默认摄像头。",
  };
  status(messages[error.name] || error.message, true);
}
async function enumerateCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices(),
    current = $("cameraSelect").value;
  $("cameraSelect").replaceChildren(new Option("默认摄像头", ""));
  devices
    .filter((d) => d.kind === "videoinput")
    .forEach((d, i) =>
      $("cameraSelect").add(
        new Option(d.label || `摄像头 ${i + 1}`, d.deviceId),
      ),
    );
  if ([...$("cameraSelect").options].some((o) => o.value === current))
    $("cameraSelect").value = current;
}
async function start() {
  if (starting || running || choosingFolder || gate.busy) return;
  const reuseSelected = directoryPrepared;
  stop({ keepStatus: true });
  const thisToken = token;
  starting = true;
  lastResultAt = 0;
  actualFPS = 0;
  lastVideoTime = -1;
  lastMotionVideoTime = -1;

  updateButtons();
  status("请选择截图保存文件夹，确认后开启摄像头…");
  try {
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error("请使用 HTTPS 和新版 Chrome / Edge 打开网页。");
    {
      try {
        if (!(await prepareDirectory(thisToken, !reuseSelected))) return;
      } catch (error) {
        if (thisToken === token) {
          stop({ keepStatus: true });
          const message = folderErrorMessage(error);
          status(message, true);
          captureMessage(message, true);
        }
        return;
      }
      if (thisToken !== token) return;
    }
    directoryPrepared = false;
    status("正在打开摄像头…");
    logEvent("camera", "request", { session: thisToken });
    const deviceId = $("cameraSelect").value;
    const acquired = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "environment",
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    });
    if (thisToken !== token) {
      acquired.getTracks().forEach((t) => t.stop());
      return;
    }
    logEvent("camera", "acquired", { session: thisToken });
    stream = acquired;
    video.srcObject = stream;
    await video.play();
    if (thisToken !== token) return;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (thisToken === token) fail(new Error("摄像头连接已中断"));
    });
    enumerateCameras().catch(() => {});
    const width = video.videoWidth,
      height = video.videoHeight,
      scale = Math.min(1, 1600 / Math.max(width, height));
    frame.width = canvas.width = Math.round(width * scale);
    frame.height = canvas.height = Math.round(height * scale);
    motionCanvas.width = 256;
    motionCanvas.height = Math.max(1, Math.round((256 * height) / width));
    motionDetector = new MotionDetector(
      motionCanvas.width,
      motionCanvas.height,
    );
    canvas.hidden = false;
    $("emptyState").hidden = true;
    draw();
    $("sourceResolution").textContent = `${width} × ${height}`;
    status("正在加载本地检测模型…");
    await ensureModel();
    if (thisToken !== token) return;
    worker.postMessage({ type: "reset" });
    starting = false;
    running = true;
    logEvent("monitoring", "started", { session: thisToken });
    updateButtons();
    $("snapshot").disabled = false;
    $("stageLabel").hidden = false;
    $("stageClock").hidden = false;
    $("liveDot").classList.add("active");
    refreshCaptureStatus();
    renderTimer = requestAnimationFrame(renderLive);
    submitFrame();
  } catch (error) {
    logEvent("camera-start", "failed", errorDetail(error));
    if (thisToken === token) fail(error);
  }
}
async function submitFrame() {
  if (!running || busy) return;
  if (
    document.hidden ||
    video.readyState < 2 ||
    video.currentTime === lastVideoTime
  ) {
    timer = setTimeout(submitFrame, 100);
    return;
  }
  const thisToken = token;
  busy = true;
  try {
    lastVideoTime = video.currentTime;
    frameCtx.drawImage(video, 0, 0, frame.width, frame.height);
    const bitmap = await createImageBitmap(frame);
    if (thisToken !== token) {
      bitmap.close();
      return;
    }
    worker.postMessage(
      {
        type: "detect",
        bitmap,
        confidence: Number($("confidence").value) / 100,
        timestamp: performance.now(),
        still: false,
        token,
      },
      [bitmap],
    );
  } catch (error) {
    if (thisToken === token) fail(error);
  }
}
$("start").onclick = start;
$("emptyStart").onclick = start;
$("stop").onclick = () => stop();
let choosingFolder = false;
async function prepareDirectory(expectedToken = token, forcePick = false) {
  if (choosingFolder) return false;
  choosingFolder = true;
  updateButtons();
  try {
    const selected = await selectCaptureDirectory(
      window.showDirectoryPicker?.bind(window),
      forcePick ? undefined : directory,
      (selected) => {
        if (expectedToken !== token) return;
        directory = selected;
        directoryWritable = false;
        storageFailure = "";
        $("folderName").textContent = selected.name;
        $("authorizeFolder").hidden = false;
        captureMessage("目录已选中，正在请求写入权限…");
      },
      () => expectedToken === token,
    );
    if (expectedToken !== token || !selected) return false;
    directory = selected;
    directoryWritable = true;
    directoryPrepared = true;
    storageFailure = "";
    $("authorizeFolder").hidden = true;
    $("folderName").textContent = selected.name;
    refreshCaptureStatus();
    return true;
  } catch (error) {
    if (
      expectedToken === token &&
      error.folderStage === "permission" &&
      directory
    ) {
      directoryWritable = false;
      $("authorizeFolder").hidden = false;
    }
    throw error;
  } finally {
    choosingFolder = false;
    updateButtons();
  }
}
$("chooseFolder").onclick = async () => {
  if (choosingFolder || starting || running || gate.busy) return;
  try {
    await prepareDirectory(token, true);
  } catch (error) {
    captureMessage(folderErrorMessage(error), true);
  }
};
$("authorizeFolder").onclick = async () => {
  if (choosingFolder || starting || gate.busy) return;
  try {
    await prepareDirectory();
  } catch (error) {
    captureMessage(folderErrorMessage(error), true);
  }
};
if (!("showDirectoryPicker" in window)) {
  $("chooseFolder").disabled = true;
  captureMessage(
    "未选择目录 · 自动保存需要桌面版 Chrome / Edge，请在支持目录写入的浏览器打开。",
  );
}
$("autoCapture").onchange = () => {
  if ($("autoCapture").checked && !directoryWritable) {
    $("autoCapture").checked = false;
    captureMessage(
      storageFailure || "未获得写入权限，请先选择目录或点击授权保存。",
      true,
    );
  } else refreshCaptureStatus();
};
$("sensitivity").onchange = () => motionDetector?.reset();
$("confidence").oninput = () => {
  $("confidenceValue").textContent = $("confidence").value + "%";
};
$("category").onchange = renderResults;
$("snapshot").onclick = () => captureFrame("manual");
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("stage").requestFullscreen();
  } catch {
    status("当前浏览器无法进入全屏。");
  }
};
document.addEventListener("visibilitychange", () => {
  motionDetector?.reset();
  motion = { active: false, regions: [] };
  lastResultAt = 0;
  if (running)
    status(
      document.hidden ? "页面已切换到后台，监测暂时暂停" : "已恢复前台监测",
    );
});
window.addEventListener("pagehide", () => {
  stop({ keepStatus: true });
  worker?.terminate();
});
enumerateCameras().catch(() => {});
updateButtons();
async function ensureModel() {
  const preferred = $("backend").value;
  const size = Number($("quality").value),
    mode = preferred + "-" + size;
  if (modelReady && mode === modelMode) return;
  if (initPromise && mode === modelMode) return initPromise;
  worker?.terminate();
  modelReady = false;
  modelMode = mode;
  worker = new Worker(new URL("./inference.worker.js", import.meta.url), {
    type: "module",
  });
  $("loadProgress").hidden = false;
  $("engineDot").classList.remove("active");
  $("engineStatus").textContent = "正在加载模型";
  const promise = new Promise((resolve, reject) => {
    rejectInit = reject;
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        $("progress").value = data.progress;
        $("loadText").textContent = data.text;
      }
      if (data.type === "ready") {
        modelReady = true;
        $("loadProgress").hidden = true;
        $("engineDot").classList.add("active");
        $("engineStatus").textContent =
          `YOLO26n · ${data.size} · ${data.backend}${data.fallback ? " · 已切换" : ""}`;
        $("footerEngine").textContent =
          `YOLO26n · ${data.size} × ${data.size} · 浏览器本地推理`;
        resolve();
      }
      if (data.type === "result") handleResult(data);
      if (data.type === "error") {
        if (!modelReady) reject(new Error(data.message));
        else if (data.token === token) {
          fail(new Error(data.message));
        }
      }
    };
    worker.onerror = (event) => {
      const error = new Error(
        event.message || "推理线程启动失败，请重新加载页面。",
      );
      if (!modelReady) reject(error);
      else fail(error);
    };
    worker.postMessage({
      type: "init",
      preferred,
      size,
      baseURL: new URL(import.meta.env.BASE_URL, location.href).href,
    });
  });
  initPromise = promise;
  try {
    await promise;
  } finally {
    if (initPromise === promise) {
      initPromise = null;
      rejectInit = null;
    }
  }
}
