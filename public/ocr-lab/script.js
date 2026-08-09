import { parsePartsText } from "../app/parser.js?v=20260809-1";

const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";
const OCR_SPACE_DEMO_KEY = "helloworld";

const engines = [
  {
    id: "paddle",
    name: "PaddleOCR 本地",
    note: "浏览器本地识别，中文清单优先测试对象，首次加载模型较慢。",
    run: runPaddle,
  },
  {
    id: "tesseract",
    name: "Tesseract.js 本地",
    note: "浏览器本地识别，接入简单，用作开源兜底对照。",
    run: runTesseract,
  },
  {
    id: "ocrspace",
    name: "OCR.space 接口",
    note: "当前正式应用使用的免费接口，图片会发送到第三方服务。",
    run: runOcrSpace,
  },
];

const elements = {
  imageInput: document.getElementById("image-input"),
  previewBox: document.getElementById("preview-box"),
  clearButton: document.getElementById("clear-button"),
  runAllButton: document.getElementById("run-all-button"),
  results: document.getElementById("results"),
  template: document.getElementById("engine-template"),
  preprocessToggle: document.getElementById("preprocess-toggle"),
  appendToggle: document.getElementById("append-toggle"),
};

let selectedFile = null;
let selectedDataUrl = "";
let preparedDataUrl = "";
let paddleReady = null;

function loadScript(src, globalCheck) {
  return new Promise((resolve, reject) => {
    if (globalCheck?.()) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`无法加载 ${src}`));
    document.head.appendChild(script);
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = dataUrl;
  });
}

async function prepareImage(dataUrl) {
  if (!elements.preprocessToggle.checked) return dataUrl;
  const image = await loadImage(dataUrl);
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.28 + 128));
    data[index] = contrast;
    data[index + 1] = contrast;
    data[index + 2] = contrast;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function setPreview(dataUrl) {
  elements.previewBox.innerHTML = `<img src="${dataUrl}" alt="待识别图片预览" />`;
}

function createEngineCard(engine) {
  const node = elements.template.content.firstElementChild.cloneNode(true);
  node.dataset.engine = engine.id;
  node.querySelector("h3").textContent = engine.name;
  node.querySelector(".engine-head p").textContent = engine.note;
  return node;
}

function setStatus(card, text, isError = false) {
  const status = card.querySelector(".status");
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function renderMetrics(card, items) {
  card.querySelector(".metrics").innerHTML = items
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
}

function renderParseResult(card, text) {
  const parsed = parsePartsText(text);
  const sample = parsed.parts
    .slice(0, 6)
    .map((part) => `<li>${escapeHtml(part.material)} · ${escapeHtml(part.name)} · ${part.length}×${part.width} · ${part.quantity}片 · 长${part.edgeLong}/短${part.edgeShort}</li>`)
    .join("");
  card.querySelector(".parse-result").innerHTML = `
    <strong>语义解析结果</strong>
    <span>${parsed.parts.length} 种板件 / ${parsed.stats.pieceCount} 片，${parsed.warnings.length} 条未识别提示。</span>
    ${sample ? `<ul>${sample}</ul>` : "<small>没有解析出板件，说明 OCR 文字还不能直接进入计算。</small>"}
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeOcrText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[|｜]/g, " ")
    .replace(/[×Ｘｘ＊]/g, "x")
    .replace(/[，,;；、]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPaddleText(result) {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    return result
      .map((item) => item?.text || item?.rec_text || item?.[1]?.[0] || item?.[0] || "")
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(result?.textBlocks)) return result.textBlocks.map((item) => item.text).join("\n");
  if (Array.isArray(result?.data)) return extractPaddleText(result.data);
  if (Array.isArray(result?.result)) return extractPaddleText(result.result);
  return JSON.stringify(result, null, 2);
}

async function initPaddle() {
  if (paddleReady) return paddleReady;
  paddleReady = (async () => {
    await loadScript("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js", () => window.ort);
    await loadScript("https://docs.opencv.org/4.8.0/opencv.js", () => window.cv);
    if (window.cv && !window.cv.Mat) {
      await new Promise((resolve) => {
        window.cv.onRuntimeInitialized = resolve;
      });
    }
    await loadScript("https://cdn.jsdelivr.net/npm/paddleocr-browser/dist/index.js", () => window.Paddle);
    if (!window.Paddle?.init || !window.Paddle?.ocr) throw new Error("PaddleOCR 浏览器包没有暴露 Paddle.init/Paddle.ocr");
    const assetsPath = "https://cdn.jsdelivr.net/npm/paddleocr-browser/dist/";
    const dictionary = await fetch(`${assetsPath}ppocr_keys_v1.txt`).then((response) => response.text());
    await window.Paddle.init({
      detPath: `${assetsPath}ppocr_det.onnx`,
      recPath: `${assetsPath}ppocr_rec.onnx`,
      dic: dictionary,
      ort: window.ort,
      node: false,
      cv: window.cv,
    });
  })();
  return paddleReady;
}

async function runPaddle(dataUrl) {
  await initPaddle();
  const result = await window.Paddle.ocr(dataUrl);
  return normalizeOcrText(extractPaddleText(result));
}

async function runTesseract(dataUrl, progress) {
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", () => window.Tesseract);
  const result = await window.Tesseract.recognize(dataUrl, "chi_sim+eng", {
    logger: (message) => {
      if (message.status && Number.isFinite(message.progress)) {
        progress(`${message.status} ${Math.round(message.progress * 100)}%`);
      }
    },
  });
  return normalizeOcrText(result?.data?.text || "");
}

async function runOcrSpace(dataUrl) {
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const formData = new FormData();
  formData.append("apikey", OCR_SPACE_DEMO_KEY);
  formData.append("language", "chs");
  formData.append("OCREngine", "2");
  formData.append("scale", "true");
  formData.append("isTable", "true");
  formData.append("file", blob, selectedFile?.name || "ocr-test.jpg");
  const response = await fetch(OCR_SPACE_ENDPOINT, { method: "POST", body: formData });
  if (!response.ok) throw new Error(`OCR.space 请求失败：${response.status}`);
  const payload = await response.json();
  const errors = [
    ...(Array.isArray(payload.ErrorMessage) ? payload.ErrorMessage : payload.ErrorMessage ? [payload.ErrorMessage] : []),
    ...(Array.isArray(payload.ErrorDetails) ? payload.ErrorDetails : payload.ErrorDetails ? [payload.ErrorDetails] : []),
  ].filter(Boolean);
  if (payload.IsErroredOnProcessing || errors.length) throw new Error(errors.join("；") || "OCR.space 处理失败");
  return normalizeOcrText((payload.ParsedResults || []).map((item) => item.ParsedText || "").join("\n"));
}

async function runEngine(engine, card) {
  setStatus(card, "识别中");
  renderMetrics(card, ["正在加载"]);
  const start = performance.now();
  try {
    const text = await engine.run(preparedDataUrl, (message) => setStatus(card, message));
    const ms = Math.round(performance.now() - start);
    const parsed = parsePartsText(text);
    setStatus(card, "完成");
    renderMetrics(card, [
      `耗时 ${ms} ms`,
      `文本 ${text.length} 字`,
      `板件 ${parsed.parts.length} 种`,
      `片数 ${parsed.stats.pieceCount}`,
    ]);
    card.querySelector("textarea").value = text;
    renderParseResult(card, text);
  } catch (error) {
    const ms = Math.round(performance.now() - start);
    setStatus(card, "失败", true);
    renderMetrics(card, [`耗时 ${ms} ms`, "请查看错误"]);
    card.querySelector("textarea").value = error?.message || String(error);
    card.querySelector(".parse-result").innerHTML = "<small>该引擎没有完成识别。</small>";
  }
}

async function runAll() {
  if (!selectedDataUrl) return;
  elements.runAllButton.disabled = true;
  elements.runAllButton.textContent = "正在测试…";
  preparedDataUrl = await prepareImage(selectedDataUrl);
  if (!elements.appendToggle.checked) elements.results.innerHTML = "";
  const cards = engines.map((engine) => {
    const card = createEngineCard(engine);
    elements.results.appendChild(card);
    return { engine, card };
  });
  for (const { engine, card } of cards) {
    await runEngine(engine, card);
  }
  elements.runAllButton.disabled = false;
  elements.runAllButton.textContent = "重新测试三套 OCR";
}

elements.imageInput.addEventListener("change", async () => {
  selectedFile = elements.imageInput.files?.[0] || null;
  if (!selectedFile) return;
  selectedDataUrl = await readAsDataUrl(selectedFile);
  setPreview(selectedDataUrl);
  elements.runAllButton.disabled = false;
});

elements.clearButton.addEventListener("click", () => {
  selectedFile = null;
  selectedDataUrl = "";
  preparedDataUrl = "";
  elements.imageInput.value = "";
  elements.previewBox.innerHTML = "<span>上传图片后显示预览</span>";
  elements.results.innerHTML = '<article class="engine-card empty"><h3>等待上传</h3><p>选择一张图片后点击测试，结果会显示在这里。</p></article>';
  elements.runAllButton.disabled = true;
  elements.runAllButton.textContent = "开始测试三套 OCR";
});

elements.runAllButton.addEventListener("click", runAll);