# MotionSnap Pro Max

MotionSnap Pro Max 是运行在浏览器中的摄像头监测应用。它使用 YOLO26n 在本地识别并跟踪目标，可在画面发生移动时自动将 PNG 截图保存到你选择的文件夹。视频与截图均在设备上处理，不上传。

[打开 MotionSnap Pro Max](https://rigcv.github.io/MotionSnapProMax/) · [GitHub 源码仓库](https://github.com/RIGCV/MotionSnapProMax)

## 使用

1. 使用桌面版 Edge 或 Chrome 打开网页，点击「开始监测」。
2. 选择截图保存文件夹并授予写入权限，再按浏览器提示允许访问摄像头。
3. 勾选「移动即截图」即可自动保存，也可以点击「手动截图」。你可以在右侧调整移动灵敏度、识别类别、模型精度和运行方式。
4. 点击「停止监测」或「退出程序」可释放摄像头。切换到后台也会停止监测，回到页面后可重新开始。

建议固定摄像头并保持页面在前台。移动判断与 AI 识别独立运行，机位晃动或光影变化也可能触发截图。截图在成功写入后计入保存数量。如果写入失败，重新授权保存后可再次开启「移动即截图」。

## 本地开发

需要 Node.js 22.12 或更新版本。在仓库根目录运行以下命令。

```sh
cd web
npm ci
node scripts/download-assets.mjs
npm run dev
```

在浏览器打开终端显示的地址（默认 `http://localhost:5173`）。摄像头和目录写入功能需要 HTTPS 或 localhost。

在 `web/` 目录运行测试和生产构建。

```sh
npm test
npm run build
npm run preview
```

构建输出在 `web/dist/`，可以部署到 GitHub Pages 等静态托管服务。默认的 320 模型随源码提供，资源脚本下载并校验 640 模型和示例图片。模型来源、校验值和导出方法见 [模型说明](web/MODEL.md)。

排查摄像头或目录权限时，可在浏览器控制台执行 `window.motionSnapDiagnostics()` 查看本地诊断记录。在网址后加 `?debug=1` 可记录每张截图的编码和写入阶段。

## GitHub Pages 部署

在仓库的 **Settings → Pages → Build and deployment** 中，将 **Source** 设置为 **GitHub Actions**。推送 Web 应用变更到 `main` 会触发测试、构建和发布，也可以手动运行 [Deploy MotionSnap Pro Max](.github/workflows/deploy-pages.yml) 工作流。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `web/index.html`、`web/src/` | 网页入口、界面、摄像头管理、推理、跟踪和截图 |
| `web/public/` | 静态资源和默认模型 |
| `web/scripts/` | 资源下载、运行时准备和模型导出 |
| `web/tests/` | 自动化测试和浏览器验证页面 |
| `.github/workflows/` | GitHub Pages 部署 |

## 许可

MotionSnap Pro Max 源码采用 AGPL-3.0-only。模型、示例图片与依赖适用各自的许可。见 [项目许可](web/LICENSE) 和 [第三方声明](web/THIRD_PARTY_NOTICES.md)。
