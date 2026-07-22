# 柜体板开料计算助手展示网站

一个简洁、响应式的单页展示网站，用于介绍柜体板开料计算助手的核心功能、OCR 识别流程、计算规则和计算示例。

## 页面内容

- 功能介绍：加工单 OCR、结构理解、用量计算、排版可视化
- OCR 流程：上传、识别、结构化、人工确认
- 默认规则：1220 × 2440 mm、3 mm 锯缝、木纹方向、3% 封边损耗等
- 交互示例：演示板材张数、封边米数和利用率结果
- 响应式布局：支持桌面、平板和手机

## 本地预览

网站本体是纯静态文件，无需安装依赖：

```bash
python3 -m http.server 8000 --directory public/demo
```

打开 `http://localhost:8000` 即可查看。

## 部署到 GitHub Pages

仓库已包含 `.github/workflows/deploy-pages.yml`。将代码推送到 GitHub 后：

1. 进入仓库 `Settings → Pages`。
2. 将 `Build and deployment` 的 Source 设为 `GitHub Actions`。
3. 推送到 `main` 分支，工作流会自动发布 `public/demo` 目录。

## 文件结构

```text
public/demo/
├── index.html    # 页面结构与内容
├── style.css     # 完整视觉样式与响应式布局
└── script.js     # 导航、规则切换、示例计算与动效
```

页面中的计算结果为固定展示示例；接入真实计算接口时，可在 `script.js` 中替换示例按钮的结果逻辑。
