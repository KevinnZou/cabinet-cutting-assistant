import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

let server;
let browser;
let origin;
const publicRoot = new URL("../../public/", import.meta.url);
const pixel = { name: "sample.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64") };

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const file = new URL(`.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`, publicRoot);
      if (!file.href.startsWith(publicRoot.href)) throw new Error("invalid path");
      const types = { js: "text/javascript", mjs: "text/javascript", html: "text/html", css: "text/css", wasm: "application/wasm", svg: "image/svg+xml" };
      response.setHeader("Content-Type", types[file.pathname.split(".").at(-1)] || "application/octet-stream");
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined });
  await mkdir(new URL("../../output/playwright/", import.meta.url), { recursive: true });
}, { timeout: 30000 });
after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

async function openPage(t, options = {}) {
  const context = await browser.newContext(options);
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(`${origin}/app/`);
  await page.locator("#parts-body tr").first().waitFor();
  return page;
}

async function newProject(page, name) {
  await page.locator("#quick-new-project-button").click();
  await page.locator("#new-project-name").fill(name);
  await page.locator("#new-project-form button[type=submit]").click();
  assert.equal(await page.locator("#project-name").inputValue(), name);
}

test("新项目空白、输入草稿隔离、标签顺序固定，切换后恢复排版结果", async (t) => {
  const page = await openPage(t);
  await newProject(page, "订单 A");
  await page.locator("#raw-input").fill("奶油白免漆板 2440*550 2 单面封边");
  await page.locator("#parse-button").click();
  await page.locator("#calculate-button").click();
  await page.locator("#result-content").waitFor({ state: "visible" });
  await newProject(page, "订单 B");
  assert.equal(await page.locator("#raw-input").inputValue(), "");
  assert.match(await page.locator("#parts-summary").innerText(), /0 种板件/);
  const order = await page.locator(".project-tab-main strong").allTextContents();
  await page.getByRole("tab", { name: /订单 A/ }).click();
  assert.equal(await page.locator("#raw-input").inputValue(), "奶油白免漆板 2440*550 2 单面封边");
  assert.equal(await page.locator("#result-content").isVisible(), true);
  assert.equal(await page.locator("#csv-button").isEnabled(), true);
  assert.deepEqual(await page.locator(".project-tab-main strong").allTextContents(), order);
  await page.locator('[data-field="quantity"]').fill("3");
  assert.equal(await page.locator("#csv-button").isEnabled(), false);
  await page.getByRole("tab", { name: /订单 B/ }).click();
  await page.getByRole("tab", { name: /订单 A/ }).click();
  assert.equal(await page.locator("#csv-button").isEnabled(), false);
  await page.reload();
  assert.equal(await page.locator("#raw-input").inputValue(), "奶油白免漆板 2440*550 2 单面封边");
  assert.equal(await page.locator('[data-field="quantity"]').inputValue(), "3");
});

test("计算期间切换项目不会把迟到结果写入另一个项目", async (t) => {
  const page = await openPage(t);
  await page.route("**/optimizer-worker.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: 'import {optimizeCutting} from "./optimizer.js"; self.onmessage=({data})=>setTimeout(()=>self.postMessage({requestId:data.requestId,result:optimizeCutting(data.parts,data.settings)}),500);',
  }));
  await newProject(page, "计算 A");
  await page.locator("#sample-button").click();
  await newProject(page, "计算 B");
  await page.getByRole("tab", { name: /计算 A/ }).click();
  await page.locator("#calculate-button").click();
  await page.getByRole("tab", { name: /计算 B/ }).click();
  await page.waitForTimeout(700);
  assert.equal(await page.locator("#project-status").inputValue(), "draft");
  assert.equal(await page.locator("#result-content").isVisible(), false);
  assert.equal(await page.locator("#calculate-button").isEnabled(), true);
});

test("OCR 的迟到文字不会串项目，未授权时不请求在线接口", async (t) => {
  const page = await openPage(t);
  let onlineRequests = 0;
  await page.route("https://api.ocr.space/**", (route) => {
    onlineRequests += 1;
    return route.fulfill({ json: { ParsedResults: [{ ParsedText: "单边55公分40片" }] } });
  });
  await page.route("**/vendor/paddleocr/index.js", (route) => route.fulfill({
    contentType: "text/javascript",
    body: 'export const PaddleOCR={create:async()=>({initialize:async()=>{},dispose:async()=>{},predict:async()=>{await new Promise(r=>setTimeout(r,500));return "迟到的识别内容";}})};',
  }));
  await newProject(page, "识别 A");
  await newProject(page, "识别 B");
  await page.getByRole("tab", { name: /识别 A/ }).click();
  await page.locator("#ocr-file").setInputFiles(pixel);
  await page.waitForFunction(() => document.querySelector("#ocr-status").textContent.includes("正在本机识别图片"));
  await page.getByRole("tab", { name: /识别 B/ }).click();
  await page.locator("#raw-input").fill("订单 B 的草稿");
  await page.waitForTimeout(700);
  assert.equal(await page.locator("#raw-input").inputValue(), "订单 B 的草稿");
  assert.equal(onlineRequests, 0);

  await page.unroute("**/vendor/paddleocr/index.js");
  await page.route("**/vendor/paddleocr/index.js", (route) => route.fulfill({ contentType: "text/javascript", body: 'export const PaddleOCR={create:async()=>{throw new Error("模型失败")}};' }));
  await page.reload();
  await page.locator("#ocr-file").setInputFiles(pixel);
  await page.waitForFunction(() => document.querySelector("#ocr-status").textContent.includes("本机识别未完成"));
  assert.equal(onlineRequests, 0);
  await page.locator("#cloud-ocr-consent").check();
  await page.locator("#ocr-file").setInputFiles(pixel);
  await page.waitForFunction(() => document.querySelector("#raw-input").value.includes("55公分40片"));
  assert.equal(onlineRequests, 1);
});

test("备份校验失败保留原项目，合法旧备份补齐默认价格和活动项目", async (t) => {
  const page = await openPage(t);
  await newProject(page, "恢复前项目");
  await page.locator("#workspace-file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"projects":[]}') });
  await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("恢复失败"));
  assert.equal(await page.locator("#project-name").inputValue(), "恢复前项目");
  page.once("dialog", (dialog) => dialog.accept());
  const backup = { projects: [{ id: "restored", projectName: "恢复项目", parts: [] }], activeProjectId: "missing" };
  await page.locator("#workspace-file").setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForFunction(() => document.querySelector("#project-name").value === "恢复项目");
  assert.match(await page.locator("#parts-summary").innerText(), /0 种板件/);
});

test("取消 OCR 后原文保留，迟到文字不会追加且可以立即重试", async (t) => {
  const page = await openPage(t);
  await page.route("**/vendor/paddleocr/index.js", (route) => route.fulfill({
    contentType: "text/javascript",
    body: 'export const PaddleOCR={create:async()=>({initialize:async()=>{},dispose:async()=>{},predict:async()=>{await new Promise(r=>setTimeout(r,500));return "新识别文字";}})};',
  }));
  await page.locator("#raw-input").fill("原有草稿");
  await page.locator("#ocr-file").setInputFiles(pixel);
  await page.waitForFunction(() => document.querySelector("#ocr-status").textContent.includes("正在本机识别图片"));
  await page.locator("#cancel-ocr-button").click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#raw-input").inputValue(), "原有草稿");
  assert.equal(await page.locator("#ocr-button").isEnabled(), true);
  await page.locator("#ocr-file").setInputFiles(pixel);
  await page.waitForFunction(() => document.querySelector("#raw-input").value.includes("新识别文字"));
});

test("随站点构建的 OCR 模块及两组 WASM 文件可加载", async (t) => {
  const page = await openPage(t);
  assert.equal(await page.evaluate(async () => {
    const { PaddleOCR } = await import("../vendor/paddleocr/index.js");
    return typeof PaddleOCR.create;
  }), "function");
  for (const file of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
    const response = await page.request.get(`${origin}/vendor/paddleocr/${file}`);
    assert.equal(response.status(), 200, file);
    assert.ok((await response.body()).length > 1000, file);
    await response.dispose();
  }
});

test("所有未识别行可见，手机与桌面页面无整页横向溢出", async (t) => {
  const page = await openPage(t, { viewport: { width: 1440, height: 900 } });
  await page.locator("#raw-input").fill("单边55公分 40片\n不明甲\n不明乙\n不明丙\n不明丁");
  await page.locator("#parse-button").click();
  assert.equal(await page.locator(".parse-warning-list li").count(), 4);
  await page.locator("#project-name").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("../../output/playwright/desktop.png", import.meta.url)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL("../../output/playwright/mobile.png", import.meta.url)), fullPage: true });
});
