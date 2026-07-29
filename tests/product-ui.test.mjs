import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("板件确认表提供安全的选择式批量操作", async () => {
  const html = await readFile(new URL("../public/app/index.html", import.meta.url), "utf8");

  assert.match(html, /id="select-all-parts"/);
  assert.match(html, /id="apply-edge-button"/);
  assert.match(html, /id="apply-grain-button"/);
  assert.match(html, /id="apply-material-button"/);
  assert.match(html, /id="delete-selected-button"/);
  assert.match(html, /id="merge-duplicates-button"/);
  assert.match(html, /id="parts-review"/);
});

test("排版使用后台线程并提供颜色筛选和生产校验", async () => {
  const [html, script, worker] = await Promise.all([
    readFile(new URL("../public/app/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/app/optimizer-worker.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="result-quality"/);
  assert.match(html, /id="result-material-filter"/);
  assert.match(script, /new Worker\("\.\/optimizer-worker\.js/);
  assert.match(script, /单次最多计算 20000 片/);
  assert.match(worker, /optimizeCutting/);
  assert.match(worker, /self\.postMessage/);
});

test("余料规则贯通录入、结果、打印和导出", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../public/app/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app/app.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="leftover-rules-list"/);
  assert.match(script, /data-material-rule="leftoverEdgeMode"/);
  assert.match(script, /可回收余料清单/);
  assert.match(script, /余料封边/);
  assert.match(script, /sheet\.leftovers/);
});
