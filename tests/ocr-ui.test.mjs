import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(script, /ocrVersion: "PP-OCRv6"/);
  assert.match(script, /paddleItemsToText/);
  assert.match(script, /cdn\.jsdelivr\.net\/npm\/@paddleocr\/paddleocr-js@0\.4\.2\/\+esm/);
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
  assert.match(labHtml, /id="image-input"/);
  assert.match(labScript, /PaddleOCR 本地/);
  assert.match(labScript, /Tesseract\.js 本地/);
  assert.match(labScript, /OCR\.space 接口/);
  assert.match(labScript, /parsePartsText/);
  assert.match(labScript, /@paddleocr\/paddleocr-js/);
  assert.match(labScript, /PaddleOCR\.create/);
  assert.match(labScript, /cdn\.jsdelivr\.net\/npm\/@paddleocr\/paddleocr-js@0\.4\.2\/\+esm/);
  assert.match(labScript, /worker: false/);
  assert.match(labScript, /ocrVersion: "PP-OCRv6"/);
  assert.match(labScript, /paddleItemsToText/);
  assert.match(labScript, /tesseract\.js@5/);
});
