// Device labels are the only portable identification hint exposed by browsers.
// Never silently fall back to the OS default (which can be a phone/virtual feed).
const virtual = /vivo|virtual|虚拟|obs|droidcam|iriun|epoccam|camo\b|manycam|snap camera|phone|手机|continuity|ndi\b/i;
const builtIn = /integrated|internal|built[ -]?in|内置|内建|chicony|easycamera|truevision|facetime|user.facing|front.camera|hd (?:web)?camera|hd webcam|fhd camera|webcam hd/i;
const infrared = /infrared|\bir\b|红外|depth/i;
export function selectBuiltInCamera(devices) {
  return devices.find(d => d.kind === "videoinput" && d.deviceId &&
    !virtual.test(d.label) && !infrared.test(d.label) && builtIn.test(d.label));
}
