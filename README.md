# MotionSnap Pro Max

使用 YOLO26n 的浏览器本地多目标检测应用。网页由 GitHub Pages 托管，视频与图片在访问者自己的设备上处理，无需安装 Python 或 EXE，也没有视频上传服务。

## 使用

访问 https://rigcv.github.io/MotionSnapProMax/ ，使用桌面版 Chrome / Edge。

1. 点击「选择保存文件夹」，选择本机目录并授权写入。
2. 开启「移动自动截图」，选择每 1、2、3、4 或 5 秒保存。
3. 点击「开始监测」并允许摄像头访问。有移动时立即保存第一张，持续移动时按间隔保存，静止时不保存。
4. 图片为包含目标框、橙色移动区域框和时间戳的 PNG；桌面端预览最近 8 张，窄屏显示最近 4 张。停止监测会释放摄像头。

每次重新打开网页需重新选择目录。图片不上传，不支持目录选择的浏览器可使用手动截图下载。手动截图选择目录后直接写入目录，否则交给浏览器下载。

- 仅支持实时摄像头，已移除本地视频、图片和示例入口。
- YOLO26n 识别 80 类目标，支持多目标检测及短时编号跟踪。默认 320 × 320，支持 640 × 640；WebGPU 优先，CPU/WASM 回退。
- 移动触发独立于 AI 类别，通过 256 像素宽度、约 10 Hz 的画面差分识别变化。可选高、中、低灵敏度；微小、低对比度或非常短暂的变化仍可能漏检，相机晃动、光影变化也可能触发。
- 自动截图串行写入，不积压；保存耗时过长会降低实际频率。只有成功写入后才计数。失败会关闭自动截图并显示错误，重新选择目录后可再次开启。
- 请固定摄像头并保持页面在前台。页面隐藏时暂停监测，返回时重置移动基准；关闭网页后不继续运行。
- AI 在 Worker 中执行，最多一帧在途。视频显示和移动触发独立运行。5 / 15 / 30 FPS 是上限，实际速度取决于设备。
- 模型和运行时均同源加载，画面不上传，无外部字体和统计请求。首次启动需要下载模型与运行时。

界面采用系统字体、浅色面板与清晰按钮；桌面端按窗口高度安排画面，常用操作尽量一屏显示。手机端按操作顺序排列，必要时纵向滚动；高级设置与目标详情按需展开。

## 本地开发

需要 Node.js 22.12 或更新版本。

```sh
cd web
npm ci
node scripts/download-assets.mjs
npm run dev
```

访问终端输出的 `http://localhost:5173` 地址。摄像头需要 HTTPS 或 localhost，不支持直接双击 HTML 文件运行。

```sh
npm test
npm run build
npm run preview
```

构建文件在 `web/dist/`，包含同源模型、ONNX Runtime JS/WASM 和示例图片，可部署到静态网站。Vite 使用相对路径，支持 GitHub 项目子路径与自定义域名。

## GitHub Pages

目标仓库：<https://github.com/RIGCV/MotionSnapProMax>

1. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
2. 推送到 `main`，或手动运行 `Deploy MotionSnap Web` 工作流。
3. 工作流安装锁定依赖，下载并验证模型 SHA256，测试、构建、发布。
4. 默认网址：<https://rigcv.github.io/MotionSnapProMax/>。

320 模型（约 9.8 MB）随源码提交，保证导出版本可复现；640 模型和运行时在构建时获取并校验。模型文件校验不通过时构建会失败，不会悄悄更换模型。

## 模型与边界

当前使用官方 `v8.4.0` assets release 的 YOLO26n 权重：320 模型在本地导出，640 模型使用官方 ONNX 文件。两者均为 FP32，固定输入 `[1,3,S,S]`，端到端输出 `[1,300,6]`。坐标采用等比例 letterbox 与反变换；不额外执行 NMS。详细来源和校验值见 `web/MODEL.md`。

跟踪器采用类别约束、IoU 和预测中心匹配，不包含人脸识别或 ReID。遮挡、交叉和较低帧率可能导致编号变化。运动状态表示相对于画面的位移，适用于固定机位，不代表真实世界速度。相机移动时背景目标也可能显示移动。

检测频率选项只改变处理频率，模型精度选项会加载真正不同输入尺寸的模型。CPU 回退功能可用，但低端设备不保证实时帧率。页面隐藏时暂停新推理，浏览器关闭后不继续监控。当前仅支持浏览器摄像头，不直接连接 RTSP 网络摄像头。

## 项目结构

```text
web/src/                 网页界面、Worker 推理、坐标解析与跟踪
web/scripts/             资源下载与本地运行时准备
web/tests/               坐标、多目标与跟踪测试
.github/workflows/       GitHub Pages 自动构建与发布
main.py                  保留的原 Python 桌面入口
```

原 Python 程序、打包脚本和配置保留，现有 `monitoring/`、`.venv/` 及构建产物只留本地，不上传仓库。迁移前完整备份保存在项目目录之外。

## 第三方许可

YOLO26n 模型和 Ultralytics 示例来自 Ultralytics，遵循其 AGPL-3.0 / Enterprise 授权条款；本项目没有变更第三方授权。ONNX Runtime 为 MIT，Vite 为 MIT。见 `web/THIRD_PARTY_NOTICES.md`。新增网页源码以 AGPL-3.0-only 提供（`web/LICENSE`），原有桌面文件的权利归原作者。
