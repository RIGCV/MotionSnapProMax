// Device labels are the only portable identification hint exposed by browsers.
// Never silently fall back to the OS default (which can be a phone/virtual feed).
const virtual = /vivo|virtual|虚拟|obs|droidcam|iriun|epoccam|camo\b|manycam|snap camera|phone|手机|continuity|ndi\b/i;
const builtIn = /integrated|internal|built[ -]?in|内置|内建|chicony|easycamera|truevision|facetime|user.facing|front.camera|hd (?:web)?camera|hd webcam|fhd camera|webcam hd/i;
const infrared = /infrared|\bir\b|红外|depth/i;
export function selectBuiltInCamera(devices) {
  return devices.find(d => d.kind === "videoinput" && d.deviceId &&
    !virtual.test(d.label) && !infrared.test(d.label) && builtIn.test(d.label));
}

// Stop every track even when a single track/DOM operation fails during teardown.
export function stopMediaTracks(source, onError = () => {}) {
  for (const track of source?.getTracks?.() || []) {
    try { track.stop(); } catch (error) { onError(error); }
  }
}

// Web Locks coordinate tabs in the same origin without opening a device.
// Keep this lease until an outstanding getUserMedia promise has settled too:
// getUserMedia has no AbortSignal and a late stream must be stopped first.
export function acquireCameraLease(locks) {
  if (!locks?.request) {
    return Promise.reject(new Error("浏览器不支持安全的摄像头会话互斥，请使用新版 Chrome / Edge。"));
  }
  return new Promise((resolve, reject) => {
    locks.request("motionsnap-camera", { mode: "exclusive", ifAvailable: true }, (lock) => {
      if (!lock) throw new Error("另一个 MotionSnap Pro Max 页面正在使用或请求摄像头，请先停止或关闭该页面。");
      return new Promise((release) => resolve(release));
    }).catch(reject);
  });
}
