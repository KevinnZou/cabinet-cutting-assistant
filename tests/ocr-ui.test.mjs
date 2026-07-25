import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("工作台提供图片 OCR 上传入口", async () => {
  const html = await readFile(new URL("../public/app/index.html", import.meta.url), "utf8");

  assert.match(html, /id="ocr-button"/);
  assert.match(html, /id="ocr-file"/);
  assert.match(html, /accept="image\/\*"/);
  assert.match(html, /免费 OCR 接口/);
});

test("OCR 前端流程使用开放免费接口", async () => {
  const script = await readFile(new URL("../public/app/app.js", import.meta.url), "utf8");

  assert.match(script, /https:\/\/api\.ocr\.space\/parse\/image/);
  assert.match(script, /OCR_SPACE_DEMO_KEY = "helloworld"/);
  assert.match(script, /language", "chs"/);
  assert.match(script, /ParsedResults/);
});
