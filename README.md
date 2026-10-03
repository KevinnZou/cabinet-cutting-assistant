# 柜体板开料计算助手

一个不依赖服务器、直接在浏览器本地运行的柜体板开料与排版工具。项目同时保留独立的产品介绍页面，适合日常开单和对外展示。

## 功能

- 可编辑板件清单：名称、颜色/材质、长宽、数量、木纹和封边边数
- 可配置规则：标准板尺寸、锯缝、四边修边、封边损耗和取整方式
- 本地二维排版：按颜色/材质分板，支持无纹理板件旋转
- 结果可视化：板材张数、封边用量、利用率、异常板件和每张板排版图
- 本地项目：自动保存在当前浏览器，可导入、导出 JSON
- 生产输出：导出 CSV 开料清单和打印计算结果
- 无服务端依赖：计算和数据处理均在当前设备完成
- 图片 OCR 默认在本机识别；只有勾选在线识别后，本机失败时才会将所选图片发送至 OCR.Space

## 页面入口

- `/app/`：开料工作台（默认首页）
- `/intro/`：产品介绍网站
- `/demo/`：兼容旧链接，内容与产品介绍页一致

## 计算口径

- 默认标准板：1220 × 2440 mm
- 默认锯缝：3 mm
- 默认封边损耗：3%，按整米向上取整
- 木纹锁定时，板件长度沿标准板长度方向，禁止旋转
- 不同颜色或材质分别计算板材
- 排版采用 MaxRects 思路的二维启发式算法，优先减少短边余量

启发式算法会生成稳定、可执行的方案，但不承诺数学上的全局最优。正式下单前仍需由开单员复核尺寸、纹理和设备加工余量。

## 本地预览

需要 Node.js 22 或更新版本及 Python 3。首次运行先安装依赖并构建本机 OCR 组件，再启动静态服务器：

```bash
npm ci
npm run build
npm run dev
```

打开 `http://localhost:8000`，首页会进入开料工作台。

OCR 的 SDK、Worker 和 WASM 随网站一起发布，不再运行时从 jsDelivr 加载。首次识别仍需联网下载 Paddle 官方模型；模型加载和图片识别均可取消或在失败后重试。本机识别不会上传图片。在线备用识别需主动勾选，使用 OCR.Space 演示接口，可能受服务额度限制。

修改后可运行（浏览器测试首次需要安装 Chromium）：

```bash
npm test
npx playwright install chromium
npm run test:browser
```

浏览器回归使用隔离存储，不修改日常浏览器里的项目。已安装 Chrome 时，也可运行 `CHROME_CHANNEL=chrome npm run test:browser`。启动预览后，`npm run test:ocr` 会生成两行测试图片并验证真实 PaddleOCR；此项需联网下载官方模型，不属于离线 CI 测试。预览不在 8000 端口时，通过 `OCR_TEST_URL` 指定完整工作台地址。

## GitHub Pages

仓库中的 `.github/workflows/deploy-pages.yml` 会在 `main` 分支更新后安装锁定依赖、构建 OCR 资源、检查 JavaScript 语法并运行单元与浏览器回归测试，通过后才发布整个 `public` 目录。GitHub Pages 的 Source 需要设置为 `GitHub Actions`。生成的 `public/vendor` 不提交到 Git，由本地和 CI 构建。

## 主要文件

```text
public/
├── index.html             # 静态托管首页入口
├── app/
│   ├── index.html         # 开料工作台界面
│   ├── app.css            # 工作台样式
│   ├── app.js             # 本地数据、交互与导出
│   └── optimizer.js       # 二维排版与用量计算核心
└── intro/                 # 产品介绍网站
```
