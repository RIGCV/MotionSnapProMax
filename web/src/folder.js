// Invoke the native picker immediately from the user's click. Never restore
// an old Desktop handle or create a child directory behind the selection.
export async function selectCaptureDirectory(picker) {
  if (typeof picker !== "function") {
    const error = new Error(
      "当前浏览器不支持选择保存文件夹。请使用桌面版 Chrome 或 Edge，或关闭“移动即截图”仅预览。",
    );
    error.name = "NotSupportedError";
    throw error;
  }
  const selected = await picker({
    id: "motionsnap-save-folder",
    mode: "readwrite",
  });
  if (
    typeof selected.queryPermission === "function" &&
    (await selected.queryPermission({ mode: "readwrite" })) !== "granted"
  ) {
    const error = new Error(
      "未获得所选文件夹的写入权限，请重新选择可写的普通文件夹并允许保存。",
    );
    error.name = "NotAllowedError";
    throw error;
  }
  return selected;
}
export function folderErrorMessage(error) {
  if (error.name === "AbortError")
    return "已取消选择保存文件夹，摄像头未开启。点击开始监测可重试。";
  if (error.name === "SecurityError")
    return "无法打开文件夹选择窗口。请在 Chrome 或 Edge 中直接打开网站，再点击开始监测。";
  if (error.name === "NotAllowedError")
    return "文件夹写入授权未通过，请选择可写的普通文件夹并允许保存。";
  return error.message || "保存文件夹不可用，请重新选择。";
}
