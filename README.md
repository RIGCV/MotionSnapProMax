# MotionSnap Pro Max

使用 YOLO26n 的浏览器本地多目标检测应用。网页由 GitHub Pages 托管，视频与图片在访问者自己的设备上处理，无需安装 Python 或 EXE，也没有视频上传服务。

## 使用

打开部署后的 HTTPS 网址，选择摄像头、本地视频/图片或街景示例，再点击「开始检测」。首次下载约 9.9 MB 的模型并初始化引擎，后续使用浏览器缓存。开启摄像头需要用户授权。停止检测会释放摄像头。

- WebGPU 优先；不支持或初始化失败时自动使用 CPU/WASM，也可手动选择兼容模式。
- 默认 320 × 320 速度档，可切换 640 × 640 细节档。小尺寸可能漏检远处的小目标。
- 80 类目标检测；可筛选人员、人员与交通工具或动物。
- 多目标编号、短时轨迹、基于画面位移的运动判断、截图下载。
- 检测在 Web Worker 中执行，只允许一帧在途，不堆积旧帧。视频显示独立刷新，检测帧率不等于视频播放帧率。
- 5 / 15 / 30 FPS 是调度上限，不是性能承诺。显示的处理耗时包含预处理、推理和跟踪；FPS 是实际检测结果频率。
- 本地视频和图片不会上传。示例和模型从网站加载，没有分析统计或外部字体请求。

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

跟踪器采用类别约束、IoU 和预测中心匹配，不包含人脸识别或 ReID。遮挡、交叉和较低帧率可能导致编号变化。运动状态表示相对于画面的位移，适用于固定机位，不代表真实世界速度。相机移动时背景目标也可能显示移动。静态图片不显示运动状态。

检测频率选项只改变处理频率，模型精度选项会加载真正不同输入尺寸的模型。CPU 回退功能可用，但低端设备不保证实时帧率。页面隐藏时暂停新推理，浏览器关闭后不继续监控。当前支持浏览器摄像头与本地文件，不直接连接 RTSP 网络摄像头。

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
