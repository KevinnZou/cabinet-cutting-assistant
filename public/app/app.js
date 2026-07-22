import {
  DEFAULT_SETTINGS,
  createSampleParts,
  formatArea,
  normalizeSettings,
  optimizeCutting,
} from "./optimizer.js";

const STORAGE_KEY = "cabinet-cutting-assistant:project:v1";
const COLOR_PALETTE = ["#c5ec56", "#93c6a8", "#f0bc62", "#8fb8e8", "#d6a6e8", "#e7987f", "#aabf77"];

const elements = {
  projectName: document.getElementById("project-name"),
  saveStatus: document.getElementById("save-status"),
  partsBody: document.getElementById("parts-body"),
  partsSummary: document.getElementById("parts-summary"),
  ruleSummary: document.getElementById("rule-summary"),
  calculationReady: document.getElementById("calculation-ready"),
  calculateButton: document.getElementById("calculate-button"),
  resultPlaceholder: document.getElementById("result-placeholder"),
  resultContent: document.getElementById("result-content"),
  resultStats: document.getElementById("result-stats"),
  resultAlerts: document.getElementById("result-alerts"),
  sheetList: document.getElementById("sheet-list"),
  calculationNotes: document.getElementById("calculation-notes"),
  resultActions: document.getElementById("result-actions"),
  resultCaption: document.getElementById("result-caption"),
  importFile: document.getElementById("import-file"),
  toast: document.getElementById("toast"),
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `part-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newPart(overrides = {}) {
  return {
    id: makeId(),
    name: "新板件",
    material: "未分类",
    length: 600,
    width: 400,
    quantity: 1,
    grainLocked: false,
    edgeLong: 0,
    edgeShort: 0,
    ...overrides,
  };
}

function createInitialState() {
  return {
    version: 1,
    projectName: "新建柜体项目",
    settings: { ...DEFAULT_SETTINGS },
    parts: createSampleParts().map((part) => ({ ...part, id: makeId() })),
    updatedAt: new Date().toISOString(),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const stored = JSON.parse(raw);
    if (!stored || !Array.isArray(stored.parts)) return createInitialState();
    return {
      version: 1,
      projectName: String(stored.projectName || "新建柜体项目"),
      settings: normalizeSettings(stored.settings),
      parts: stored.parts.map((part) => newPart(part)),
      updatedAt: stored.updatedAt || new Date().toISOString(),
    };
  } catch {
    return createInitialState();
  }
}

let state = loadState();
let lastResult = null;
let saveTimer = null;
let toastTimer = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseNumericValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function saveState({ immediate = false } = {}) {
  clearTimeout(saveTimer);
  elements.saveStatus.textContent = "正在保存…";

  const persist = () => {
    try {
      state.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      elements.saveStatus.textContent = "已保存到本机";
    } catch {
      elements.saveStatus.textContent = "浏览器阻止了本地保存";
    }
  };

  if (immediate) persist();
  else saveTimer = setTimeout(persist, 320);
}

function edgeOptions(selected) {
  return [0, 1, 2]
    .map((value) => `<option value="${value}" ${Number(selected) === value ? "selected" : ""}>${value} 边</option>`)
    .join("");
}

function renderParts() {
  if (!state.parts.length) {
    elements.partsBody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无板件，点击“添加板件”开始录入。</td></tr>';
  } else {
    elements.partsBody.innerHTML = state.parts
      .map(
        (part) => `
          <tr data-id="${escapeHtml(part.id)}">
            <td>
              <div class="stack-input">
                <input aria-label="板件名称" data-field="name" type="text" maxlength="40" value="${escapeHtml(part.name)}" />
                <input aria-label="颜色或材质" data-field="material" type="text" maxlength="40" value="${escapeHtml(part.material)}" />
              </div>
            </td>
            <td>
              <div class="size-fields">
                <input aria-label="板件长度" data-field="length" type="number" min="1" max="10000" step="1" value="${part.length}" />
                <span>×</span>
                <input aria-label="板件宽度" data-field="width" type="number" min="1" max="10000" step="1" value="${part.width}" />
              </div>
            </td>
            <td><input class="quantity-input" aria-label="数量" data-field="quantity" type="number" min="1" max="999" step="1" value="${part.quantity}" /></td>
            <td><input class="grain-check" aria-label="锁定木纹方向" data-field="grainLocked" type="checkbox" ${part.grainLocked ? "checked" : ""} /></td>
            <td><select class="edge-select" aria-label="封长边数量" data-field="edgeLong">${edgeOptions(part.edgeLong)}</select></td>
            <td><select class="edge-select" aria-label="封短边数量" data-field="edgeShort">${edgeOptions(part.edgeShort)}</select></td>
            <td><button class="delete-button" type="button" data-action="delete" aria-label="删除 ${escapeHtml(part.name)}">×</button></td>
          </tr>
        `,
      )
      .join("");
  }

  const count = state.parts.reduce((sum, part) => sum + Math.max(0, Number(part.quantity) || 0), 0);
  elements.partsSummary.textContent = `${state.parts.length} 种板件 · ${count} 片`;
  elements.calculationReady.textContent = count ? `共 ${count} 片，等待排版` : "请先添加板件";
  updateRuleSummary();
}

function renderSettings() {
  document.querySelectorAll("[data-setting]").forEach((input) => {
    const key = input.dataset.setting;
    if (input.type === "checkbox") input.checked = Boolean(state.settings[key]);
    else input.value = state.settings[key];
  });
  updateRuleSummary();
}

function updateRuleSummary() {
  const settings = normalizeSettings(state.settings);
  elements.ruleSummary.textContent = `标准板 ${settings.boardWidth} × ${settings.boardHeight} mm · 锯缝 ${settings.kerf} mm · 修边 ${settings.trim} mm`;
}

function resetResults() {
  lastResult = null;
  elements.resultPlaceholder.hidden = false;
  elements.resultContent.hidden = true;
  elements.resultActions.hidden = true;
  elements.resultCaption.textContent = "结果仅在当前设备生成";
}

function updateStateFromPartInput(target) {
  const row = target.closest("tr[data-id]");
  if (!row) return;
  const part = state.parts.find((item) => item.id === row.dataset.id);
  if (!part) return;
  const field = target.dataset.field;
  if (!field) return;

  if (target.type === "checkbox") part[field] = target.checked;
  else if (target.type === "number" || target.tagName === "SELECT") part[field] = parseNumericValue(target.value);
  else part[field] = target.value;

  const count = state.parts.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  elements.partsSummary.textContent = `${state.parts.length} 种板件 · ${count} 片`;
  elements.calculationReady.textContent = count ? `共 ${count} 片，等待排版` : "请先添加板件";
  resetResults();
  saveState();
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function renderSheetSvg(sheet, settings, paletteIndex) {
  const boardW = settings.boardWidth;
  const boardH = settings.boardHeight;
  const color = COLOR_PALETTE[paletteIndex % COLOR_PALETTE.length];
  const trim = settings.trim;
  const items = sheet.placements
    .map((placement, index) => {
      const labelFits = placement.placedWidth > boardW * 0.11 && placement.placedHeight > boardH * 0.035;
      const fontSize = Math.max(18, Math.min(42, placement.placedWidth * 0.08));
      const label = labelFits
        ? `<text x="${placement.x + placement.placedWidth / 2}" y="${placement.y + placement.placedHeight / 2}" text-anchor="middle" dominant-baseline="middle" fill="#14271e" font-size="${fontSize}" font-weight="700">${escapeHtml(placement.name)}</text>`
        : "";
      return `
        <g>
          <rect x="${placement.x}" y="${placement.y}" width="${placement.placedWidth}" height="${placement.placedHeight}" rx="4" fill="${color}" fill-opacity="${0.9 - (index % 3) * 0.1}" stroke="#14271e" stroke-width="2" />
          ${label}
        </g>`;
    })
    .join("");

  const trimRect = trim
    ? `<rect x="${trim}" y="${trim}" width="${boardW - trim * 2}" height="${boardH - trim * 2}" fill="none" stroke="#8c9a90" stroke-width="2" stroke-dasharray="12 10" />`
    : "";

  return `
    <svg class="sheet-svg" viewBox="0 0 ${boardW} ${boardH}" role="img" aria-label="${escapeHtml(sheet.material)} 第 ${sheet.number} 张板排版图">
      <rect width="${boardW}" height="${boardH}" fill="#edf1ec" />
      <defs>
        <pattern id="grid-${paletteIndex}-${sheet.number}" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#d6ddd7" stroke-width="1" />
        </pattern>
      </defs>
      <rect width="${boardW}" height="${boardH}" fill="url(#grid-${paletteIndex}-${sheet.number})" />
      ${trimRect}
      ${items}
      <rect x="1" y="1" width="${boardW - 2}" height="${boardH - 2}" fill="none" stroke="#52635a" stroke-width="3" />
    </svg>`;
}

function renderResults(result) {
  lastResult = result;
  elements.resultPlaceholder.hidden = true;
  elements.resultContent.hidden = false;
  elements.resultActions.hidden = false;
  elements.resultCaption.textContent = `${state.projectName} · ${new Date().toLocaleString("zh-CN", { hour12: false })}`;

  const totals = result.totals;
  elements.resultStats.innerHTML = `
    <article class="stat-card accent"><span>板材用量</span><strong>${totals.sheetCount}<em>张</em></strong><small>${totals.materialCount} 种颜色 / 材质</small></article>
    <article class="stat-card"><span>封边领料</span><strong>${totals.edgeBandOrderMeters}<em>米</em></strong><small>净用量 ${(totals.edgeBandRawMm / 1000).toFixed(2)} 米</small></article>
    <article class="stat-card"><span>整体利用率</span><strong>${formatPercent(totals.utilization)}</strong><small>板件面积 ${formatArea(totals.usedArea)}</small></article>
    <article class="stat-card"><span>已排板件</span><strong>${totals.placedPartCount}<em>片</em></strong><small>共录入 ${totals.partCount} 片</small></article>
  `;

  const alerts = [];
  if (result.invalidParts.length) {
    alerts.push(`<div class="alert warning">有 ${result.invalidParts.length} 行尺寸或数量无效，已跳过：${result.invalidParts.map((part) => escapeHtml(part.name)).join("、")}</div>`);
  }
  if (result.oversized.length) {
    const names = result.oversized.map((part) => `${escapeHtml(part.name)}（${part.length} × ${part.width}）`).join("、");
    alerts.push(`<div class="alert error">有 ${result.oversized.length} 片无法放入标准板，请检查尺寸、修边或木纹方向：${names}</div>`);
  }
  elements.resultAlerts.innerHTML = alerts.join("");

  if (!result.sheets.length) {
    elements.sheetList.innerHTML = '<div class="alert error">没有可生成的排版图，请先检查板件尺寸和数量。</div>';
  } else {
    elements.sheetList.innerHTML = result.sheets
      .map((sheet, sheetIndex) => `
        <article class="sheet-card">
          <div class="sheet-card-head">
            <div><strong>${escapeHtml(sheet.material)} · 第 ${sheet.number} 张</strong><span>${result.settings.boardWidth} × ${result.settings.boardHeight} mm · ${sheet.placements.length} 片</span></div>
            <span class="usage-pill">利用率 ${formatPercent(sheet.utilization)}</span>
          </div>
          <div class="sheet-visual-wrap">
            ${renderSheetSvg(sheet, result.settings, sheetIndex)}
            <div class="placement-list">
              ${sheet.placements.map((placement, index) => `
                <div class="placement-row">
                  <i>${index + 1}</i>
                  <div><strong>${escapeHtml(placement.name)}</strong><span>${placement.length} × ${placement.width} mm${placement.rotated ? " · 已旋转" : ""}${placement.grainLocked ? " · 木纹锁定" : ""}</span></div>
                </div>
              `).join("")}
            </div>
          </div>
        </article>
      `)
      .join("");
  }

  const edgeFormula = `${(totals.edgeBandRawMm / 1000).toFixed(2)} m × (1 + ${result.settings.edgeLoss}%)`;
  elements.calculationNotes.innerHTML = `
    <div><span>板材计算</span><strong>按颜色 / 材质分板</strong><small>相同材质参与同一组二维排版，不同材质自动分开。</small></div>
    <div><span>切割余量</span><strong>${result.settings.kerf} mm 锯缝 · ${result.settings.trim} mm 修边</strong><small>板件之间预留锯缝，标准板四周扣除修边宽度。</small></div>
    <div><span>封边公式</span><strong>${edgeFormula} = ${totals.edgeBandOrderMeters} m</strong><small>${result.settings.roundEdgeBand ? "损耗后按整米向上取整。" : "损耗后保留两位小数。"}</small></div>
  `;
}

function calculate() {
  if (!state.parts.length) {
    showToast("请先添加至少一个板件");
    return;
  }

  elements.calculateButton.disabled = true;
  elements.calculateButton.querySelector("span").textContent = "正在本地排版…";

  requestAnimationFrame(() => {
    setTimeout(() => {
      const result = optimizeCutting(state.parts, state.settings);
      renderResults(result);
      elements.calculateButton.disabled = false;
      elements.calculateButton.querySelector("span").textContent = "重新排版计算";
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(`计算完成：${result.totals.sheetCount} 张板，封边 ${result.totals.edgeBandOrderMeters} 米`);
    }, 80);
  });
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(name) {
  return String(name || "开料项目").replace(/[\\/:*?"<>|]/g, "-").slice(0, 50);
}

function exportProject() {
  saveState({ immediate: true });
  downloadFile(`${safeFilename(state.projectName)}.json`, JSON.stringify(state, null, 2), "application/json;charset=utf-8");
  showToast("项目文件已导出");
}

function exportCsv() {
  if (!lastResult) return;
  const rows = [
    ["项目", state.projectName],
    ["标准板", `${lastResult.settings.boardWidth} × ${lastResult.settings.boardHeight} mm`],
    ["板材张数", lastResult.totals.sheetCount],
    ["封边领料（米）", lastResult.totals.edgeBandOrderMeters],
    [],
    ["颜色/材质", "板号", "序号", "板件", "长度(mm)", "宽度(mm)", "旋转", "木纹锁定", "X(mm)", "Y(mm)"],
  ];
  lastResult.sheets.forEach((sheet) => {
    sheet.placements.forEach((placement, index) => {
      rows.push([
        sheet.material,
        sheet.number,
        index + 1,
        placement.name,
        placement.length,
        placement.width,
        placement.rotated ? "是" : "否",
        placement.grainLocked ? "是" : "否",
        placement.x,
        placement.y,
      ]);
    });
  });
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  downloadFile(`${safeFilename(state.projectName)}-开料清单.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
  showToast("开料清单已导出");
}

async function importProject(file) {
  try {
    const stored = JSON.parse(await file.text());
    if (!stored || !Array.isArray(stored.parts)) throw new Error("invalid");
    state = {
      version: 1,
      projectName: String(stored.projectName || file.name.replace(/\.json$/i, "")),
      settings: normalizeSettings(stored.settings),
      parts: stored.parts.map((part) => newPart(part)),
      updatedAt: new Date().toISOString(),
    };
    renderAll();
    saveState({ immediate: true });
    showToast("项目已导入并保存在本机");
  } catch {
    showToast("无法导入：这不是有效的开料项目文件");
  } finally {
    elements.importFile.value = "";
  }
}

function renderAll() {
  elements.projectName.value = state.projectName;
  renderSettings();
  renderParts();
  resetResults();
}

document.getElementById("add-part-button").addEventListener("click", () => {
  state.parts.push(newPart());
  renderParts();
  resetResults();
  saveState();
  elements.partsBody.querySelector("tr:last-child input")?.focus();
});

document.getElementById("sample-button").addEventListener("click", () => {
  state.parts = createSampleParts().map((part) => ({ ...part, id: makeId() }));
  state.settings = { ...DEFAULT_SETTINGS };
  renderSettings();
  renderParts();
  resetResults();
  saveState({ immediate: true });
  showToast("已载入 1 张标准板的示例数据");
});

elements.partsBody.addEventListener("input", (event) => updateStateFromPartInput(event.target));
elements.partsBody.addEventListener("change", (event) => updateStateFromPartInput(event.target));
elements.partsBody.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="delete"]');
  if (!button) return;
  const row = button.closest("tr[data-id]");
  state.parts = state.parts.filter((part) => part.id !== row.dataset.id);
  renderParts();
  resetResults();
  saveState();
});

document.querySelectorAll("[data-setting]").forEach((input) => {
  input.addEventListener("change", () => {
    const key = input.dataset.setting;
    state.settings[key] = input.type === "checkbox" ? input.checked : parseNumericValue(input.value, state.settings[key]);
    state.settings = normalizeSettings(state.settings);
    renderSettings();
    resetResults();
    saveState();
  });
});

elements.projectName.addEventListener("input", () => {
  state.projectName = elements.projectName.value || "未命名项目";
  resetResults();
  saveState();
});

elements.calculateButton.addEventListener("click", calculate);
document.getElementById("export-button").addEventListener("click", exportProject);
document.getElementById("import-button").addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", () => {
  if (elements.importFile.files?.[0]) importProject(elements.importFile.files[0]);
});
document.getElementById("csv-button").addEventListener("click", exportCsv);
document.getElementById("print-button").addEventListener("click", () => window.print());

renderAll();
