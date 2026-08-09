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
  assert.match(html, /data-setting="optimizationMode"/);
  assert.match(html, /柜体长条优先/);
  assert.match(html, /省板优先/);
  assert.match(html, /极限省板/);
  assert.match(script, /new Worker\("\.\/optimizer-worker\.js/);
  assert.match(script, /正在长条凑宽/);
  assert.match(script, /正在省板优化/);
  assert.match(script, /正在极限省板/);
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

test("项目中心提供搜索、状态、版本历史和整库备份", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../public/app/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app/app.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="project-center-button"/);
  assert.match(html, /id="quick-new-project-button"/);
  assert.match(html, /id="new-project-dialog"/);
  assert.match(html, /id="new-project-form"/);
  assert.match(html, /切换 \/ 管理项目/);
  assert.match(html, /新建项目/);
  assert.match(html, /这里管理不同客户\/订单/);
  assert.match(html, /id="project-search"/);
  assert.match(html, /id="project-status"/);
  assert.match(html, /id="history-dialog"/);
  assert.match(html, /id="export-workspace-button"/);
  assert.match(script, /createSnapshot\(state, reason\)/);
  assert.match(script, /restoreSnapshot\(state, row\.dataset\.snapshotId\)/);
  assert.match(script, /importWorkspace\(await file\.text\(\)\)/);
  assert.match(script, /quick-new-project-button/);
  assert.match(script, /openNewProjectDialog/);
  assert.match(script, /newProjectForm\.addEventListener\("submit"/);
});

test("应用提供浏览器标签页图标并更新缓存版本", async () => {
  const [html, icon] = await Promise.all([
    readFile(new URL("../public/app/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(html, /rel="icon"/);
  assert.match(html, /favicon\.svg\?v=20260809-2/);
  assert.match(html, /app\.js\?v=20260809-2/);
  assert.match(icon, /#14271e/);
  assert.match(icon, /#c5ec56/);
});

test("报价工作台支持价格档案、余料归属和两类专用单据", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../public/app/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app/app.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="price-book-dialog"/);
  assert.match(html, /id="quotation-section"/);
  assert.match(html, /id="leftover-ownership"/);
  assert.match(html, /id="customer-quote-button"/);
  assert.match(html, /id="production-order-button"/);
  assert.match(script, /calculateQuotation\(lastResult, effectivePriceBook\(\), state\.pricing\)/);
  assert.match(script, /createQuoteVersion\(state, lastResult, lastQuotation\)/);
  assert.match(script, /createCustomerQuoteDocument\(\)/);
});

test("旧排版结果失效后禁止报价生产并显示变更摘要", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../public/app/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app/app.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="result-validity"/);
  assert.match(html, /id="lock-production-button"/);
  assert.match(script, /invalidateCalculation\(/);
  assert.match(script, /diffCalculationInputs\(/);
  assert.match(script, /当前排版结果已过期，禁止用于报价或生产/);
  assert.match(script, /requireCurrentResult\(/);
});

test("板件复核表支持逐行查看原文和字段判断来源", async () => {
  const [html, script, parser] = await Promise.all([
    readFile(new URL("../public/app/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/app/parser.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /20260809-2/);
  assert.match(script, /data-action="toggle-source"/);
  assert.match(script, /原文明确/);
  assert.match(script, /上下文继承/);
  assert.match(script, /系统推断/);
  assert.match(script, /确认本行无误/);
  assert.match(parser, /provenance:/);
  assert.match(parser, /sourceLine/);
});
