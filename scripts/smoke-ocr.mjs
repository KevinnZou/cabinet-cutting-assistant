import assert from "node:assert/strict";
import { chromium } from "playwright";

// Explicit opt-in integration check: downloads official models, never uploads images.
const browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined });
try {
  const page = await browser.newPage();
  await page.route("https://api.ocr.space/**", (route) => route.abort());
  page.on("requestfailed", (request) => console.error("Request failed:", request.url(), request.failure()?.errorText));
  await page.goto(process.env.OCR_TEST_URL || "http://127.0.0.1:8000/app/");
  const text = await page.evaluate(async () => {
    const { createPaddleClient } = await import("./ocr-client.js");
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.font = "48px sans-serif";
    ctx.fillText("单边55公分 40片", 40, 80);
    ctx.fillText("单边60公分 40片", 40, 160);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve));
    return createPaddleClient().recognize(new File([blob], "printed-test.png", { type: "image/png" }));
  });
  console.log(text);
  assert.match(text, /55/);
  assert.match(text, /60/);
  assert.match(text, /40/);
} finally {
  await browser.close();
}
