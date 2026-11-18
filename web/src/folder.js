// Select the directory first, then explicitly request write permission.
// Keep a returned handle even if write permission is not granted yet.
export async function selectCaptureDirectory(
  picker,
  existing,
  onSelected = () => {},
) {
  let selected = existing;
  if (!selected) {
    if (typeof picker !== "function") {
      throw new DOMException(
        "此浏览器不支持文件夹选择，请使用桌面版 Chrome 或 Edge。",
        "NotSupportedError",
      );
    }
    selected = await picker({
      id: "motionsnap-capture-location",
      mode: "read",
    });
    onSelected(selected);
  }
  try { await authorizeCaptureDirectory(selected); }
  catch (error) { error.folderStage = "write"; throw error; }
  return selected;
}
export async function authorizeCaptureDirectory(selected) {
  if (typeof selected.queryPermission !== "function") return;
  let permission = await selected.queryPermission({ mode: "readwrite" });
  if (
    permission !== "granted" &&
    typeof selected.requestPermission === "function"
  ) {
    permission = await selected.requestPermission({ mode: "readwrite" });
  }
  if (permission !== "granted") {
    throw new DOMException(
      "文件夹已选中，但尚未获得写入权限。请点击“授权保存”并允许编辑文件。",
      "NotAllowedError",
    );
  }
}
export function folderErrorMessage(error) {
  if (error.name === "AbortError" && error.folderStage === "write")
    return "目录已选中，但浏览器未完成写入授权（AbortError）。请点击授权保存，允许编辑文件。";
  if (error.name === "AbortError")
    return "浏览器未返回所选目录（AbortError）。可能是目录访问受限、授权未完成或选择窗口关闭，并不一定是你取消了操作。请尝试另一个普通子文件夹，或在独立的 Chrome 窗口重试。";
  if (error.name === "SecurityError")
    return "浏览器阻止了授权请求（SecurityError）。请点击“授权保存”重试；若仍失败，请在独立的 Chrome / Edge 窗口中直接打开本站。";
  if (error.name === "NotAllowedError")
    return "文件夹已选中，写入权限尚未获得。请点击“授权保存”并允许编辑文件。";
  return `${error.name || "Error"}：${error.message || "保存文件夹不可用，请重新选择。"}`;
}
