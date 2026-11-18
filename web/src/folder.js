import { logEvent, errorDetail } from "./diagnostics.js";
// Called synchronously from a click. No permission query precedes the picker.
export async function selectCaptureDirectory(
  picker,
  existing,
  onSelected = () => {},
  isCurrent = () => true,
) {
  let selected = existing;
  if (!selected) {
    if (typeof picker !== "function")
      throw new DOMException(
        "需要支持目录写入的桌面版 Edge / Chrome 和 HTTPS。",
        "NotSupportedError",
      );
    logEvent("directory-picker", "begin", {
      mode: "readwrite",
      secureContext: globalThis.isSecureContext,
      userActivation: globalThis.navigator?.userActivation?.isActive,
      topLevel: typeof window === "undefined" || window.top === window,
    });
    try {
      selected = await picker({
        id: "motionsnap-save-directory-v2",
        mode: "readwrite",
      });
      logEvent("directory-picker", "selected", { folderName: selected.name });
    } catch (error) {
      error.folderStage = "picker";
      logEvent("directory-picker", "failed", errorDetail(error));
      throw error;
    }
    if (!isCurrent()) return null;
    onSelected(selected);
  }
  if (!isCurrent()) return null;
  // A readwrite picker must already grant write permission. Do not launch a
  // second permission prompt after an arbitrary delay or lost user activation.
  await authorizeCaptureDirectory(selected, Boolean(existing));
  return isCurrent() ? selected : null;
}
export async function authorizeCaptureDirectory(selected, request = true) {
  try {
    logEvent("directory-permission", "begin", { request });
    const permission = request
      ? await selected.requestPermission({ mode: "readwrite" })
      : await selected.queryPermission({ mode: "readwrite" });
    logEvent("directory-permission", "result", { permission });
    if (permission !== "granted")
      throw new DOMException("尚未获得写入权限。", "NotAllowedError");
  } catch (error) {
    error.folderStage = "permission";
    logEvent("directory-permission", "failed", errorDetail(error));
    throw error;
  }
}
export function folderErrorMessage(error) {
  if (error.name === "AbortError")
    return "目录选择或授权未完成，摄像头未启动。你可以重新选择；若已确认目录仍出现此提示，可能是浏览器限制或权限未授予。详情已记录到控制台。";
  if (error.name === "SecurityError")
    return "浏览器阻止了目录操作。请通过 HTTPS 直接打开本站，并点击按钮重新选择或授权；详情见控制台。";
  if (error.name === "NotAllowedError")
    return "未获得写入权限或权限已被撤销。请点击“授权保存”或重新选择目录。";
  if (error.name === "NotFoundError")
    return "所选目录已不存在或无法访问，请重新选择保存目录。";
  if (error.name === "NotSupportedError") return error.message;
  return `目录操作失败（${error.name || "Error"}）：${error.message || "请重新选择目录。"}`;
}
