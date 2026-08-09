import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("工作台提供图片 OCR 上传入口", async () => {
  const html = await readFile(new URL("../public/app/index.html", import.meta.url), "utf8");

  assert.match(html, /id="ocr-button"/);
  assert.match(html, /id="ocr-file"/);
  assert.match(html, /accept="image\/\*"/);
  assert.match(html, /测试新版 OCR/);
});

test("OCR 前端流程使用开放免费接口", async () => {
  const script = await readFile(new URL("../public/app/app.js", import.meta.url), "utf8");

  assert.match(script, /https:\/\/api\.ocr\.space\/parse\/image/);
  assert.match(script, /OCR_SPACE_DEMO_KEY = "helloworld"/);
  assert.match(script, /language", "chs"/);
  assert.match(script, /ParsedResults/);
});

test("提供独立 OCR 测试台对比多种识别方案", async () => {
  const [appHtml, labHtml, labScript] = await Promise.all([
    readFile(new URL("../public/app/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/ocr-lab/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/ocr-lab/script.js", import.meta.url), "utf8"),
  ]);

  assert.match(appHtml, /href="\.\.\/ocr-lab\/"/);
  assert.match(labHtml, /OCR 测试台/);
  assert.match(labHtml, /id="image-input"/);
  assert.match(labScript, /PaddleOCR 本地/);
  assert.match(labScript, /Tesseract\.js 本地/);
  assert.match(labScript, /OCR\.space 接口/);
  assert.match(labScript, /parsePartsText/);
  assert.match(labScript, /paddleocr-browser/);
  assert.match(labScript, /loadScriptFromAny/);
  assert.match(labScript, /@techstark\/opencv-js/);
  assert.match(labScript, /unpkg\.com/);
  assert.match(labScript, /tesseract\.js@5/);
});
