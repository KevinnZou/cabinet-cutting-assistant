import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeOcrText, paddleItemsToText } from "../public/app/ocr-utils.js";

test("工作台提供图片 OCR 上传入口", async () => {
  const html = await readFile(new URL("../public/app/index.html", import.meta.url), "utf8");

  assert.match(html, /id="ocr-button"/);
  assert.match(html, /id="ocr-file"/);
  assert.match(html, /accept="image\/\*"/);
  assert.doesNotMatch(html, /测试新版 OCR/);
  assert.doesNotMatch(html, /href="\.\.\/ocr-lab\/"/);
});

test("OCR 前端流程优先使用 PaddleOCR 并保留开放免费接口兜底", async () => {
  const script = await readFile(new URL("../public/app/app.js", import.meta.url), "utf8");

  assert.match(script, /PADDLE_OCR_MODULE_URL/);
  assert.match(script, /PaddleOCR\.create/);
  assert.match(script, /worker: false/);
  assert.match(script, /lang: "ch"/);
  assert.match(script, /ocrVersion: "PP-OCRv6"/);
  assert.match(script, /ocr-utils\.js\?v=20260830-1/);
  assert.match(script, /cdn\.jsdelivr\.net\/npm\/@paddleocr\/paddleocr-js@0\.4\.2\/\+esm/);
  assert.match(script, /onnxruntime-web@1\.26\.0\/dist/);
  assert.match(script, /paddleReady = null/);
  assert.match(script, /https:\/\/api\.ocr\.space\/parse\/image/);
  assert.match(script, /OCR_SPACE_DEMO_KEY = "helloworld"/);
  assert.match(script, /language", "chs"/);
  assert.match(script, /ParsedResults/);
});

test("保留独立 OCR 测试台对比多种识别方案", async () => {
  const [labHtml, labScript] = await Promise.all([
    readFile(new URL("../public/ocr-lab/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/ocr-lab/script.js", import.meta.url), "utf8"),
  ]);

  assert.match(labHtml, /OCR 测试台/);
  assert.match(labHtml, /script\.js\?v=20260830-1/);
  assert.match(labHtml, /id="image-input"/);
  assert.match(labScript, /PaddleOCR 本地/);
  assert.match(labScript, /Tesseract\.js 本地/);
  assert.match(labScript, /OCR\.space 接口/);
  assert.match(labScript, /parsePartsText/);
  assert.match(labScript, /@paddleocr\/paddleocr-js/);
  assert.match(labScript, /PaddleOCR\.create/);
  assert.match(labScript, /cdn\.jsdelivr\.net\/npm\/@paddleocr\/paddleocr-js@0\.4\.2\/\+esm/);
  assert.match(labScript, /worker: false/);
  assert.match(labScript, /lang: "ch"/);
  assert.match(labScript, /ocrVersion: "PP-OCRv6"/);
  assert.match(labScript, /ocr-utils\.js\?v=20260830-1/);
  assert.match(labScript, /onnxruntime-web@1\.26\.0\/dist/);
  assert.match(labScript, /paddleReady = null/);
  assert.match(labScript, /tesseract\.js@5/);
});

test("PaddleOCR 拼行避免把右侧数量错配到下一行尺寸", () => {
  const items = [
    { text: "40片", poly: [[493, 370], [711, 387], [699, 545], [480, 527]] },
    { text: "60公分", poly: [[191, 405], [466, 385], [478, 548], [203, 568]] },
    { text: "单边", poly: [[73, 433], [256, 419], [268, 573], [85, 587]] },
    { text: "24片", poly: [[485, 516], [696, 511], [700, 655], [488, 660]] },
    { text: "单四30公分", poly: [[64, 551], [468, 505], [488, 682], [84, 729]] },
    { text: "22片", poly: [[517, 606], [724, 638], [697, 819], [490, 787]] },
    { text: "单边", poly: [[89, 674], [287, 690], [274, 847], [76, 831]] },
    { text: "35公分", poly: [[251, 673], [478, 656], [488, 790], [260, 807]] },
  ];

  const text = normalizeOcrText(paddleItemsToText(items));

  assert.doesNotMatch(text, /单边 60公分 40片/);
  assert.match(text, /^40片\n单边 60公分\n单边30公分 24片\n22片\n单边 35公分/);
});
