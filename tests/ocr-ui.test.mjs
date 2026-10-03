import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeOcrText, paddleItemsToText } from "../public/app/ocr-utils.js";
import { parsePartsText } from "../public/app/parser.js";

test("工作台提供图片 OCR 上传入口", async () => {
  const html = await readFile(new URL("../public/app/index.html", import.meta.url), "utf8");

  assert.match(html, /id="ocr-button"/);
  assert.match(html, /id="ocr-file"/);
  assert.match(html, /id="cloud-ocr-consent"/);
  assert.match(html, /accept="image\/\*"/);
  assert.doesNotMatch(html, /测试新版 OCR/);
  assert.doesNotMatch(html, /href="\.\.\/ocr-lab\/"/);
});

test("保留独立 OCR 测试台对比多种识别方案", async () => {
  const [labHtml, labScript] = await Promise.all([
    readFile(new URL("../public/ocr-lab/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/ocr-lab/script.js", import.meta.url), "utf8"),
  ]);

  assert.match(labHtml, /OCR 测试台/);
  assert.match(labHtml, /script\.js\?v=20261003-1/);
  assert.match(labHtml, /id="image-input"/);
  assert.match(labScript, /PaddleOCR 本地/);
  assert.match(labScript, /Tesseract\.js 本地/);
  assert.match(labScript, /OCR\.space 接口/);
  assert.match(labScript, /parsePartsText/);
  assert.match(labScript, /createPaddleClient/);
  assert.match(labScript, /recognizeOnline/);
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

test("手写清单首行的尺寸和数量进入解析结果", () => {
  const items = [
    { text: "40片", poly: [[530, 280], [690, 280], [690, 370], [530, 370]] },
    { text: "55公分", poly: [[230, 290], [440, 290], [440, 375], [230, 375]] },
    { text: "单边", poly: [[90, 295], [215, 295], [215, 380], [90, 380]] },
    { text: "40片", poly: [[530, 430], [690, 430], [690, 520], [530, 520]] },
    { text: "60公分", poly: [[230, 435], [440, 435], [440, 525], [230, 525]] },
    { text: "单边", poly: [[90, 440], [215, 440], [215, 530], [90, 530]] },
  ];
  const text = normalizeOcrText(paddleItemsToText(items));
  const result = parsePartsText(text);

  assert.equal(result.parts.length, 2);
  assert.deepEqual(result.parts.map((part) => [part.width, part.quantity, part.edgeLong]), [
    [550, 40, 1],
    [600, 40, 1],
  ]);
});
