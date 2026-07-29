import {
  DEFAULT_SETTINGS,
  createSampleParts,
  formatArea,
  normalizeSettings,
  optimizeCutting,
} from "./optimizer.js";
import { createParserExampleByType, parsePartsText } from "./parser.js";

const STORAGE_KEY = "cabinet-cutting-assistant:project:v1";
const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";
const OCR_SPACE_DEMO_KEY = "helloworld";
const COLOR_PALETTE = ["#c5ec56", "#93c6a8", "#f0bc62", "#8fb8e8", "#d6a6e8", "#e7987f", "#aabf77"];
const EDGE_PRESETS = [
  { value: "1/0", label: "单边", edgeLong: 1, edgeShort: 0 },
  { value: "2/2", label: "四边", edgeLong: 2, edgeShort: 2 },
  { value: "2/0", label: "双长边", edgeLong: 2, edgeShort: 0 },
  { value: "0/2", label: "双短边", edgeLong: 0, edgeShort: 2 },
  { value: "1/1", label: "一长一短", edgeLong: 1, edgeShort: 1 },
  { value: "2/1", label: "两长一短", edgeLong: 2, edgeShort: 1 },
  { value: "1/2", label: "两短一长", edgeLong: 1, edgeShort: 2 },
  { value: "0/1", label: "单短边", edgeLong: 0, edgeShort: 1 },
  { value: "0/0", label: "不封边", edgeLong: 0, edgeShort: 0 },
];

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
  materialSummary: document.getElementById("material-summary"),
  printSummary: document.getElementById("print-summary"),
  resultAlerts: document.getElementById("result-alerts"),
  sheetList: document.getElementById("sheet-list"),
  calculationNotes: document.getElementById("calculation-notes"),
  resultActions: document.getElementById("result-actions"),
  resultCaption: document.getElementById("result-caption"),
  importFile: document.getElementById("import-file"),
  batchEdgeSelect: document.getElementById("batch-edge-select"),
  applyEdgeButton: document.getElementById("apply-edge-button"),
  applyGrainButton: document.getElementById("apply-grain-button"),
  applyMaterialButton: document.getElementById("apply-material-button"),
  batchGrainSelect: document.getElementById("batch-grain-select"),
  batchMaterialInput: document.getElementById("batch-material-input"),
  deleteSelectedButton: document.getElementById("delete-selected-button"),
  mergeDuplicatesButton: document.getElementById("merge-duplicates-button"),
  selectAllParts: document.getElementById("select-all-parts"),
  selectionSummary: document.getElementById("selection-summary"),
  partsReview: document.getElementById("parts-review"),
  rawInput: document.getElementById("raw-input"),
  parseButton: document.getElementById("parse-button"),
  appendParse: document.getElementById("append-parse"),
  parseFeedback: document.getElementById("parse-feedback"),
  ocrButton: document.getElementById("ocr-button"),
  ocrFile: document.getElementById("ocr-file"),
  ocrStatus: document.getElementById("ocr-status"),
  resultQuality: document.getElementById("result-quality"),
  resultFilterBar: document.getElementById("result-filter-bar"),
  resultMaterialFilter: document.getElementById("result-material-filter"),
  layoutSummary: document.getElementById("layout-summary"),
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
    edgeLong: 1,
    edgeShort: 0,
    reviewFlags: [],
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
let calculationWorker = null;
let selectedPartIds = new Set();

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

function setOcrStatus(message) {
  if (elements.ocrStatus) elements.ocrStatus.textContent = message;
}

function appendRawInput(text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  const current = elements.rawInput.value.trim();
  elements.rawInput.value = current ? `${current}\n\n${cleanText}` : cleanText;
  elements.rawInput.focus();
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

function edgePresetFromValue(value) {
  return EDGE_PRESETS.find((preset) => preset.value === value) || EDGE_PRESETS[0];
}

function edgeValueFromPart(part) {
  return `${Math.max(0, Math.min(2, Number(part.edgeLong) || 0))}/${Math.max(0, Math.min(2, Number(part.edgeShort) || 0))}`;
}

function edgeLabelFromPart(part) {
  const value = edgeValueFromPart(part);
  return EDGE_PRESETS.find((preset) => preset.value === value)?.label || `长边 ${part.edgeLong} / 短边 ${part.edgeShort}`;
}

function edgePresetOptions(selectedValue = "1/0") {
  return EDGE_PRESETS
    .map((preset) => `<option value="${preset.value}" ${selectedValue === preset.value ? "selected" : ""}>${preset.label}</option>`)
    .join("");
}

function analyzeParts(parts = state.parts) {
  const invalidIds = new Set();
  const duplicateGroups = new Map();
  let reviewCount = 0;
  let pieceCount = 0;

  for (const part of parts) {
    const length = Number(part.length);
    const width = Number(part.width);
    const quantity = Number(part.quantity);
    if (
      !Number.isFinite(length) ||
      !Number.isFinite(width) ||
      !Number.isFinite(quantity) ||
      length <= 0 ||
      width <= 0 ||
      quantity < 1 ||
      !Number.isInteger(quantity) ||
      !String(part.material || "").trim()
    ) {
      invalidIds.add(part.id);
    }
    pieceCount += Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
    if (part.reviewFlags?.length) reviewCount += 1;

    const signature = [
      String(part.name || "").trim(),
      String(part.material || "").trim(),
      length,
      width,
      Boolean(part.grainLocked),
      Number(part.edgeLong),
      Number(part.edgeShort),
    ].join("|");
    const group = duplicateGroups.get(signature) || [];
    group.push(part);
    duplicateGroups.set(signature, group);
  }

  const duplicates = [...duplicateGroups.values()].filter((group) => group.length > 1);
  return { invalidIds, duplicates, reviewCount, pieceCount };
}

function renderPartsReview() {
  const analysis = analyzeParts();
  const messages = [];
  if (analysis.invalidIds.size) messages.push(`<b>${analysis.invalidIds.size} 行数据无效</b>`);
  if (analysis.reviewCount) messages.push(`<b>${analysis.reviewCount} 行含系统推断项</b>`);
  if (analysis.duplicates.length) messages.push(`<b>${analysis.duplicates.length} 组重复规格可合并</b>`);

  elements.partsReview.className = `parts-review ${analysis.invalidIds.size ? "has-error" : analysis.reviewCount || analysis.duplicates.length ? "has-warning" : "is-ready"}`;
  elements.partsReview.innerHTML = messages.length
    ? `<span>复核提示</span><div>${messages.join("<i>·</i>")}<small>标记仅用于提醒，确认无误后可直接计算。</small></div>`
    : `<span>数据就绪</span><div><b>尺寸、数量和颜色格式检查通过</b><small>计算后还会再次核验排入数量、越界和重叠。</small></div>`;
}

function renderBatchToolbar() {
  selectedPartIds = new Set([...selectedPartIds].filter((id) => state.parts.some((part) => part.id === id)));
  const selectedCount = selectedPartIds.size;
  const allSelected = state.parts.length > 0 && selectedCount === state.parts.length;
  elements.selectAllParts.checked = allSelected;
  elements.selectAllParts.indeterminate = selectedCount > 0 && !allSelected;
  elements.selectionSummary.textContent = selectedCount ? `已选 ${selectedCount} 项` : "选择全部";
  document.querySelectorAll(".batch-action").forEach((button) => {
    button.disabled = selectedCount === 0;
  });
}

function renderParts() {
  const analysis = analyzeParts();
  if (!state.parts.length) {
    elements.partsBody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无板件，点击“添加板件”开始录入。</td></tr>';
  } else {
    elements.partsBody.innerHTML = state.parts
      .map(
        (part) => `
          <tr data-id="${escapeHtml(part.id)}" class="${analysis.invalidIds.has(part.id) ? "row-invalid" : part.reviewFlags?.length ? "row-review" : ""}">
            <td data-label="选择" class="select-cell">
              <input class="row-select" type="checkbox" aria-label="选择 ${escapeHtml(part.name)}" ${selectedPartIds.has(part.id) ? "checked" : ""} />
            </td>
            <td data-label="板件 / 颜色">
              <div class="stack-input">
                <div class="part-name-line">
                  <input aria-label="板件名称" data-field="name" type="text" maxlength="40" value="${escapeHtml(part.name)}" />
                  ${part.reviewFlags?.length ? `<span class="review-badge" title="${escapeHtml(part.reviewFlags.join("；"))}">待确认</span>` : ""}
                </div>
                <input aria-label="颜色或材质" data-field="material" type="text" maxlength="40" value="${escapeHtml(part.material)}" />
              </div>
            </td>
            <td data-label="长 × 宽（mm）">
              <div class="size-fields">
                <input aria-label="板件长度" data-field="length" type="number" min="1" max="10000" step="1" value="${part.length}" />
                <span>×</span>
                <input aria-label="板件宽度" data-field="width" type="number" min="1" max="10000" step="1" value="${part.width}" />
              </div>
            </td>
            <td data-label="数量"><input class="quantity-input" aria-label="数量" data-field="quantity" type="number" min="1" max="9999" step="1" value="${part.quantity}" /></td>
            <td data-label="木纹"><input class="grain-check" aria-label="锁定木纹方向" data-field="grainLocked" type="checkbox" ${part.grainLocked ? "checked" : ""} /></td>
            <td data-label="封边方式"><select class="edge-select" aria-label="封边方式" data-field="edgePreset">${edgePresetOptions(edgeValueFromPart(part))}</select></td>
            <td data-label="操作"><button class="delete-button" type="button" data-action="delete" aria-label="删除 ${escapeHtml(part.name)}">×</button></td>
          </tr>
        `,
      )
      .join("");
  }

  const count = state.parts.reduce((sum, part) => sum + Math.max(0, Number(part.quantity) || 0), 0);
  elements.partsSummary.textContent = `${state.parts.length} 种板件 · ${count} 片`;
  elements.calculationReady.textContent = count ? `共 ${count} 片，等待排版` : "请先添加板件";
  renderPartsReview();
  renderBatchToolbar();
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
  elements.resultFilterBar.hidden = true;
  elements.resultCaption.textContent = "结果仅在当前设备生成";
}

function renderParseFeedback(result) {
  const warnings = result.warnings.slice(0, 3);
  const coverage = result.stats.lineCount
    ? Math.round(((result.stats.lineCount - result.warnings.length) / result.stats.lineCount) * 100)
    : 0;
  const warningHtml = warnings.length
    ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "";
  elements.parseFeedback.innerHTML = `
    <strong>已识别 ${result.stats.partTypeCount} 种板件 / ${result.stats.pieceCount} 片</strong>
    <span>解析覆盖率约 ${coverage}% · 请在下方确认尺寸、颜色、木纹和封边。</span>
    ${warningHtml}
    ${result.warnings.length > warnings.length ? `<small>另有 ${result.warnings.length - warnings.length} 行未展示。</small>` : ""}
  `;
  elements.parseFeedback.classList.toggle("has-warning", result.warnings.length > 0);
}

function parseRawInput() {
  const raw = elements.rawInput.value.trim();
  if (!raw) {
    showToast("请先粘贴文字清单");
    elements.rawInput.focus();
    return;
  }

  const result = parsePartsText(raw);
  if (!result.parts.length) {
    renderParseFeedback(result);
    showToast("没有识别到板件尺寸，请检查文字格式");
    return;
  }

  const parsedParts = result.parts.map((part) =>
    newPart({
      name: part.name,
      material: part.material,
      length: part.length,
      width: part.width,
      quantity: part.quantity,
      grainLocked: part.grainLocked,
      edgeLong: part.edgeLong,
      edgeShort: part.edgeShort,
      reviewFlags: part.reviewFlags,
    }),
  );

  state.parts = elements.appendParse.checked ? [...state.parts, ...parsedParts] : parsedParts;
  selectedPartIds.clear();
  renderParts();
  resetResults();
  renderParseFeedback(result);
  saveState();
  document.getElementById("parts-title").scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(`已生成 ${result.stats.partTypeCount} 种板件，请二次确认`);
}

async function recognizeImage(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("请上传图片文件");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("apikey", OCR_SPACE_DEMO_KEY);
  formData.append("language", "chs");
  formData.append("OCREngine", "2");
  formData.append("scale", "true");
  formData.append("detectOrientation", "true");
  formData.append("isOverlayRequired", "false");

  elements.ocrButton.disabled = true;
  elements.ocrButton.textContent = "正在识别…";
  setOcrStatus("正在上传图片到 OCR.Space 免费接口识别，请稍等。");

  try {
    const response = await fetch(OCR_SPACE_ENDPOINT, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error(`OCR request failed: ${response.status}`);
    const payload = await response.json();
    const errors = [
      ...(Array.isArray(payload.ErrorMessage) ? payload.ErrorMessage : payload.ErrorMessage ? [payload.ErrorMessage] : []),
      ...(Array.isArray(payload.ErrorDetails) ? payload.ErrorDetails : payload.ErrorDetails ? [payload.ErrorDetails] : []),
    ].filter(Boolean);
    if (payload.IsErroredOnProcessing || errors.length) throw new Error(errors.join("；") || "OCR processing failed");

    const text = (payload.ParsedResults || [])
      .map((result) => result.ParsedText || "")
      .join("\n")
      .trim();
    if (!text) {
      setOcrStatus("没有识别到文字，可以换一张更清晰、正向的图片再试。");
      showToast("OCR 未识别到文字");
      return;
    }

    appendRawInput(text);
    setOcrStatus(`已识别 ${text.length} 个字符，可继续点击“解析到确认表”。`);
    showToast("OCR 识别完成，文字已放入输入框");
  } catch (error) {
    setOcrStatus(`识别失败：${error.message || "免费接口暂时不可用，请稍后重试。"}`);
    showToast("OCR 识别失败，请稍后再试");
  } finally {
    elements.ocrButton.disabled = false;
    elements.ocrButton.textContent = "上传图片识别";
    elements.ocrFile.value = "";
  }
}

function updateStateFromPartInput(target) {
  const row = target.closest("tr[data-id]");
  if (!row) return;
  const part = state.parts.find((item) => item.id === row.dataset.id);
  if (!part) return;
  const field = target.dataset.field;
  if (!field) return;

  if (field === "edgePreset") {
    const preset = edgePresetFromValue(target.value);
    part.edgeLong = preset.edgeLong;
    part.edgeShort = preset.edgeShort;
    part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("封边"));
  } else if (target.type === "checkbox") part[field] = target.checked;
  else if (target.type === "number" || target.tagName === "SELECT") part[field] = parseNumericValue(target.value);
  else part[field] = target.value;

  if (field === "material") part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("颜色"));
  if (field === "quantity") part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("数量"));
  if (field === "name") part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("板件名"));
  if (field === "length" || field === "width") part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("尺寸"));

  const count = state.parts.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  elements.partsSummary.textContent = `${state.parts.length} 种板件 · ${count} 片`;
  elements.calculationReady.textContent = count ? `共 ${count} 片，等待排版` : "请先添加板件";
  renderPartsReview();
  resetResults();
  saveState();
}

function selectedParts() {
  return state.parts.filter((part) => selectedPartIds.has(part.id));
}

function finishBatchChange(message) {
  renderParts();
  resetResults();
  saveState();
  showToast(message);
}

function applyBatchEdgePreset() {
  const targets = selectedParts();
  if (!targets.length) return;
  const preset = edgePresetFromValue(elements.batchEdgeSelect.value);
  targets.forEach((part) => {
    part.edgeLong = preset.edgeLong;
    part.edgeShort = preset.edgeShort;
    part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("封边"));
  });
  finishBatchChange(`已将所选 ${targets.length} 项改为${preset.label}`);
}

function applyBatchGrain() {
  const targets = selectedParts();
  if (!targets.length) return;
  const grainLocked = elements.batchGrainSelect.value === "true";
  targets.forEach((part) => {
    part.grainLocked = grainLocked;
  });
  finishBatchChange(`已将所选 ${targets.length} 项设为${grainLocked ? "锁定木纹" : "允许旋转"}`);
}

function applyBatchMaterial() {
  const material = elements.batchMaterialInput.value.trim();
  const targets = selectedParts();
  if (!targets.length) return;
  if (!material) {
    showToast("请先填写颜色或材质");
    elements.batchMaterialInput.focus();
    return;
  }
  targets.forEach((part) => {
    part.material = material;
    part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("颜色"));
  });
  elements.batchMaterialInput.value = "";
  finishBatchChange(`已将所选 ${targets.length} 项改为${material}`);
}

function deleteSelectedParts() {
  const count = selectedPartIds.size;
  if (!count) return;
  if (!window.confirm(`确认删除所选 ${count} 项板件？`)) return;
  state.parts = state.parts.filter((part) => !selectedPartIds.has(part.id));
  selectedPartIds.clear();
  finishBatchChange(`已删除 ${count} 项板件`);
}

function mergeDuplicateParts() {
  const { duplicates } = analyzeParts();
  if (!duplicates.length) {
    showToast("当前没有完全相同的重复规格");
    return;
  }
  const removedIds = new Set();
  duplicates.forEach((group) => {
    const [keeper, ...rest] = group;
    keeper.quantity = group.reduce((sum, part) => sum + Math.max(0, Number(part.quantity) || 0), 0);
    keeper.reviewFlags = [...new Set(group.flatMap((part) => part.reviewFlags || []))];
    rest.forEach((part) => removedIds.add(part.id));
  });
  state.parts = state.parts.filter((part) => !removedIds.has(part.id));
  selectedPartIds.clear();
  finishBatchChange(`已合并 ${duplicates.length} 组重复规格`);
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function renderMaterialSummaryItems(materialSummaries) {
  if (!materialSummaries?.length) return "";
  return materialSummaries
    .map((item) => `
      <article class="material-summary-card">
        <div>
          <strong>${escapeHtml(item.material)}</strong>
          <span>${item.partTypeCount} 种规格 · ${item.partCount} 片</span>
        </div>
        <dl>
          <div><dt>板材</dt><dd>${item.sheetCount} 张</dd></div>
          <div><dt>封边领料</dt><dd>${item.edgeBandOrderMeters} 米</dd></div>
          <div><dt>净封边</dt><dd>${(item.edgeBandRawMm / 1000).toFixed(2)} 米</dd></div>
          <div><dt>利用率</dt><dd>${formatPercent(item.utilization)}</dd></div>
        </dl>
      </article>
    `)
    .join("");
}

function createSheetSignature(sheet) {
  return JSON.stringify({
    material: sheet.material,
    utilization: Number(sheet.utilization).toFixed(4),
    placements: sheet.placements.map((placement) => ({
      name: placement.name,
      length: placement.length,
      width: placement.width,
      x: placement.x,
      y: placement.y,
      placedWidth: placement.placedWidth,
      placedHeight: placement.placedHeight,
      rotated: Boolean(placement.rotated),
      grainLocked: Boolean(placement.grainLocked),
      edgeLong: placement.edgeLong,
      edgeShort: placement.edgeShort,
    })),
  });
}

function groupSheetsByLayout(sheets) {
  const groups = [];
  const groupIndexBySignature = new Map();

  sheets.forEach((sheet) => {
    const signature = createSheetSignature(sheet);
    const existingIndex = groupIndexBySignature.get(signature);
    if (existingIndex === undefined) {
      groupIndexBySignature.set(signature, groups.length);
      groups.push({
        signature,
        representative: sheet,
        sheetNumbers: [sheet.number],
      });
      return;
    }
    groups[existingIndex].sheetNumbers.push(sheet.number);
  });

  return groups.map((group) => ({
    ...group,
    count: group.sheetNumbers.length,
  }));
}

function formatSheetNumbers(numbers) {
  const sorted = [...numbers].sort((first, second) => first - second);
  const ranges = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = current;
    previous = current;
  }

  return ranges.join("、");
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

function renderSheetCards(result, material = "") {
  const visibleSheets = material
    ? result.sheets.filter((sheet) => sheet.material === material)
    : result.sheets;
  const sheetGroups = groupSheetsByLayout(visibleSheets);
  elements.layoutSummary.textContent = `${visibleSheets.length} 张板 · ${sheetGroups.length} 种排版`;

  if (!visibleSheets.length) {
    elements.sheetList.innerHTML = '<div class="alert warning">该颜色暂时没有可展示的排版图。</div>';
    return;
  }

  elements.sheetList.innerHTML = sheetGroups
    .map((group, sheetIndex) => {
      const sheet = group.representative;
      const sheetLabel = group.count > 1
        ? `第 ${formatSheetNumbers(group.sheetNumbers)} 张`
        : `第 ${sheet.number} 张`;
      const countLabel = group.count > 1 ? `<b class="sheet-count-badge">同版 × ${group.count} 张</b>` : "";
      return `
      <article class="sheet-card">
        <div class="sheet-card-head">
          <div>
            <strong>${escapeHtml(sheet.material)} · ${sheetLabel}</strong>
            <span>${result.settings.boardWidth} × ${result.settings.boardHeight} mm · 单张 ${sheet.placements.length} 片${group.count > 1 ? ` · 共 ${group.count} 张同版` : ""}</span>
          </div>
          ${countLabel}
          <span class="usage-pill">利用率 ${formatPercent(sheet.utilization)}</span>
        </div>
        <div class="sheet-visual-wrap">
          ${renderSheetSvg(sheet, result.settings, sheetIndex)}
          <div class="placement-list">
            ${sheet.placements.map((placement, index) => `
              <div class="placement-row">
                <i>${index + 1}</i>
                <div><strong>${escapeHtml(placement.name)}</strong><span>${placement.length} × ${placement.width} mm · ${edgeLabelFromPart(placement)}${placement.rotated ? " · 已旋转" : ""}${placement.grainLocked ? " · 木纹锁定" : ""}</span></div>
              </div>
            `).join("")}
          </div>
        </div>
      </article>
    `;
    })
    .join("");
}

function createPrintDocument(result) {
  const totals = result.totals;
  const sheetGroups = groupSheetsByLayout(result.sheets);
  const printedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const materialRows = result.materialSummaries
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.material)}</td>
        <td>${item.sheetCount} 张</td>
        <td>${item.partCount} 片</td>
        <td>${(item.edgeBandRawMm / 1000).toFixed(2)} 米</td>
        <td>${item.edgeBandOrderMeters} 米</td>
        <td>${formatPercent(item.utilization)}</td>
      </tr>
    `)
    .join("");
  const sheetCards = sheetGroups
    .map((group, sheetIndex) => {
      const sheet = group.representative;
      const sheetLabel = group.count > 1
        ? `第 ${formatSheetNumbers(group.sheetNumbers)} 张`
        : `第 ${sheet.number} 张`;
      const countLabel = group.count > 1 ? `<b>同版 × ${group.count} 张</b>` : "";
      const placements = sheet.placements
        .map((placement, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(placement.name)}</td>
            <td>${placement.length} × ${placement.width}</td>
            <td>${edgeLabelFromPart(placement)} / ${placement.rotated ? "旋转" : "正常"}${placement.grainLocked ? " / 木纹锁定" : ""}</td>
          </tr>
        `)
        .join("");

      return `
        <section class="sheet-card">
          <header>
            <div>
              <h3>${escapeHtml(sheet.material)} · ${sheetLabel}</h3>
              <p>${result.settings.boardWidth} × ${result.settings.boardHeight} mm · 单张 ${sheet.placements.length} 片 · 利用率 ${formatPercent(sheet.utilization)}</p>
            </div>
            ${countLabel}
          </header>
          <div class="sheet-layout">
            ${renderSheetSvg(sheet, result.settings, sheetIndex)}
            <table>
              <thead><tr><th>#</th><th>板件</th><th>尺寸 mm</th><th>封边 / 方向</th></tr></thead>
              <tbody>${placements}</tbody>
            </table>
          </div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(state.projectName || "开料项目")} - 打印结果</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #14271e; background: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 11px; }
    h1, h2, h3, p { margin: 0; }
    .print-report { display: grid; gap: 12px; }
    .report-head { padding-bottom: 10px; display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #14271e; }
    .report-head h1 { font-size: 20px; }
    .report-head p { margin-top: 5px; color: #66736c; }
    .report-meta { text-align: right; color: #66736c; line-height: 1.7; white-space: nowrap; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .stat { padding: 9px 10px; border: 1px solid #d8e0d9; border-radius: 8px; }
    .stat span { display: block; color: #66736c; font-size: 9px; }
    .stat strong { display: block; margin-top: 4px; font-size: 15px; }
    .summary-block { break-inside: avoid; }
    .summary-block h2 { margin-bottom: 7px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 5px 6px; border: 1px solid #dfe5df; text-align: left; vertical-align: top; }
    th { color: #536259; background: #f2f5f2; font-size: 9px; }
    td { font-size: 9px; }
    .sheet-card { padding: 9px; display: grid; gap: 8px; border: 1px solid #cfd9d1; border-radius: 8px; break-inside: avoid; page-break-inside: avoid; }
    .sheet-card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .sheet-card h3 { font-size: 12px; }
    .sheet-card p { margin-top: 3px; color: #66736c; font-size: 8px; }
    .sheet-card b { padding: 4px 6px; border-radius: 999px; color: white; background: #14271e; font-size: 8px; white-space: nowrap; }
    .sheet-layout { display: grid; grid-template-columns: minmax(130px, .9fr) minmax(190px, 1.1fr); gap: 8px; align-items: start; }
    .sheet-svg { width: 100%; max-height: 285px; border: 1px solid #aeb9b1; background: #eef2ed; }
    @media print {
      .sheet-card { margin-bottom: 8px; }
      .sheet-layout { grid-template-columns: minmax(120px, .85fr) minmax(180px, 1.15fr); }
    }
  </style>
</head>
<body>
  <main class="print-report">
    <header class="report-head">
      <div>
        <h1>${escapeHtml(state.projectName || "开料项目")}</h1>
        <p>柜体板开料计算结果</p>
      </div>
      <div class="report-meta">
        <div>打印时间：${printedAt}</div>
        <div>标准板：${result.settings.boardWidth} × ${result.settings.boardHeight} mm</div>
      </div>
    </header>

    <section class="stats">
      <div class="stat"><span>板材用量</span><strong>${totals.sheetCount} 张</strong></div>
      <div class="stat"><span>封边领料</span><strong>${totals.edgeBandOrderMeters} 米</strong></div>
      <div class="stat"><span>整体利用率</span><strong>${formatPercent(totals.utilization)}</strong></div>
      <div class="stat"><span>已排板件</span><strong>${totals.placedPartCount} 片</strong></div>
    </section>

    <section class="summary-block">
      <h2>按颜色汇总</h2>
      <table>
        <thead><tr><th>颜色 / 材质</th><th>板材</th><th>片数</th><th>封边净用量</th><th>封边领料</th><th>利用率</th></tr></thead>
        <tbody>${materialRows}</tbody>
      </table>
    </section>

    ${sheetCards}
  </main>
</body>
</html>`;
}

function printResult() {
  if (!lastResult) {
    showToast("请先完成排版计算");
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("浏览器拦截了打印窗口，请允许弹窗后重试");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(createPrintDocument(lastResult));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function renderResults(result) {
  lastResult = result;
  elements.resultPlaceholder.hidden = true;
  elements.resultContent.hidden = false;
  elements.resultActions.hidden = false;
  elements.resultCaption.textContent = `${state.projectName} · ${new Date().toLocaleString("zh-CN", { hour12: false })}`;

  const totals = result.totals;
  const productionReady =
    totals.integrityOk &&
    result.invalidParts.length === 0 &&
    result.oversized.length === 0 &&
    totals.placedPartCount === totals.partCount;
  elements.resultQuality.className = `result-quality ${productionReady ? "is-ready" : "needs-review"}`;
  elements.resultQuality.innerHTML = productionReady
    ? `<i>✓</i><div><strong>生产校验通过</strong><span>${totals.partCount} 片已全部排入，无越界、重叠或少算；已比较 ${totals.strategyCount || 1} 套排版策略。</span></div>`
    : `<i>!</i><div><strong>结果需要处理后再下单</strong><span>请先解决下方异常项，系统不会把异常结果标记为可生产。</span></div>`;
  elements.resultStats.innerHTML = `
    <article class="stat-card accent"><span>板材用量</span><strong>${totals.sheetCount}<em>张</em></strong><small>${totals.materialCount} 种颜色 / 材质</small></article>
    <article class="stat-card"><span>封边领料</span><strong>${totals.edgeBandOrderMeters}<em>米</em></strong><small>按颜色分别损耗取整后汇总</small></article>
    <article class="stat-card"><span>整体利用率</span><strong>${formatPercent(totals.utilization)}</strong><small>板件面积 ${formatArea(totals.usedArea)}</small></article>
    <article class="stat-card"><span>已排板件</span><strong>${totals.placedPartCount}<em>片</em></strong><small>共录入 ${totals.partCount} 片</small></article>
  `;
  elements.materialSummary.innerHTML = renderMaterialSummaryItems(result.materialSummaries);
  elements.printSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(state.projectName || "开料项目")}</strong>
      <span>${new Date().toLocaleString("zh-CN", { hour12: false })}</span>
    </div>
    <dl>
      <div><dt>标准板</dt><dd>${result.settings.boardWidth} × ${result.settings.boardHeight} mm</dd></div>
      <div><dt>板材张数</dt><dd>${totals.sheetCount} 张</dd></div>
      <div><dt>封边领料</dt><dd>${totals.edgeBandOrderMeters} 米</dd></div>
      <div><dt>整体利用率</dt><dd>${formatPercent(totals.utilization)}</dd></div>
    </dl>
    <section>
      <h3>按颜色汇总</h3>
      ${renderMaterialSummaryItems(result.materialSummaries)}
    </section>
  `;

  const alerts = [];
  if (result.invalidParts.length) {
    alerts.push(`<div class="alert warning">有 ${result.invalidParts.length} 行尺寸或数量无效，已跳过：${result.invalidParts.map((part) => escapeHtml(part.name)).join("、")}</div>`);
  }
  if (result.oversized.length) {
    const names = result.oversized.map((part) => `${escapeHtml(part.name)}（${part.length} × ${part.width}）`).join("、");
    alerts.push(`<div class="alert error">有 ${result.oversized.length} 片无法放入标准板，请检查尺寸、修边或木纹方向：${names}</div>`);
  }
  if (!result.totals.integrityOk || result.totals.unplacedPartCount > 0) {
    alerts.push(`<div class="alert error">排版数量校验未通过：录入 ${result.totals.partCount} 片，已排 ${result.totals.placedPartCount} 片，超尺寸 ${result.oversized.length} 片。请调整规则后重新计算。</div>`);
  }
  elements.resultAlerts.innerHTML = alerts.join("");

  if (!result.sheets.length) {
    elements.sheetList.innerHTML = '<div class="alert error">没有可生成的排版图，请先检查板件尺寸和数量。</div>';
    elements.resultFilterBar.hidden = true;
  } else {
    const materials = result.materialSummaries.map((item) => item.material);
    elements.resultMaterialFilter.innerHTML = [
      '<option value="">全部颜色</option>',
      ...materials.map((material) => `<option value="${escapeHtml(material)}">${escapeHtml(material)}</option>`),
    ].join("");
    elements.resultFilterBar.hidden = materials.length < 2;
    renderSheetCards(result);
  }

  const edgeFormula = `${(totals.edgeBandRawMm / 1000).toFixed(2)} m × (1 + ${result.settings.edgeLoss}%)`;
  elements.calculationNotes.innerHTML = `
    <div><span>板材计算</span><strong>按颜色 / 材质分板</strong><small>相同材质参与同一组二维排版，不同材质自动分开。</small></div>
    <div><span>切割余量</span><strong>${result.settings.kerf} mm 锯缝 · ${result.settings.trim} mm 修边</strong><small>板件之间预留锯缝，标准板四周扣除修边宽度。</small></div>
    <div><span>封边公式</span><strong>${edgeFormula}</strong><small>${result.settings.roundEdgeBand ? "不同颜色分别按整米向上取整，再汇总领料。" : "不同颜色分别保留两位小数，再汇总领料。"}</small></div>
  `;
}

function runOptimizationInWorker(parts, settings) {
  if (!("Worker" in window)) {
    return Promise.resolve(optimizeCutting(parts, settings));
  }

  calculationWorker?.terminate();
  calculationWorker = new Worker("./optimizer-worker.js?v=20260729-4", { type: "module" });
  const requestId = makeId();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      calculationWorker?.terminate();
      calculationWorker = null;
      reject(new Error("计算时间过长，请检查板件数量或拆分项目"));
    }, 90000);

    calculationWorker.addEventListener("message", (event) => {
      if (event.data?.requestId !== requestId) return;
      clearTimeout(timeout);
      calculationWorker?.terminate();
      calculationWorker = null;
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    });
    calculationWorker.addEventListener("error", () => {
      clearTimeout(timeout);
      calculationWorker?.terminate();
      calculationWorker = null;
      reject(new Error("后台计算模块加载失败"));
    });
    calculationWorker.postMessage({ requestId, parts, settings });
  });
}

async function calculate() {
  if (!state.parts.length) {
    showToast("请先添加至少一个板件");
    return;
  }

  const analysis = analyzeParts();
  if (analysis.invalidIds.size) {
    showToast(`有 ${analysis.invalidIds.size} 行数据无效，请先修正`);
    document.getElementById("parts-title").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (analysis.pieceCount > 20000) {
    showToast("单次最多计算 20000 片，请拆分项目后再计算");
    return;
  }

  elements.calculateButton.disabled = true;
  elements.calculateButton.querySelector("span").textContent = "正在比较排版方案…";

  try {
    const result = await runOptimizationInWorker(state.parts, state.settings);
    renderResults(result);
    elements.calculateButton.querySelector("span").textContent = "重新排版计算";
    document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`计算完成：${result.totals.sheetCount} 张板，封边 ${result.totals.edgeBandOrderMeters} 米`);
  } catch (error) {
    elements.calculateButton.querySelector("span").textContent = "重新开始排版";
    showToast(error.message || "计算失败，请检查数据后重试");
  } finally {
    elements.calculateButton.disabled = false;
  }
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
    ["按颜色汇总"],
    ["颜色/材质", "规格数", "片数", "板材张数", "封边净用量(米)", "封边领料(米)", "利用率"],
    ...lastResult.materialSummaries.map((item) => [
      item.material,
      item.partTypeCount,
      item.partCount,
      item.sheetCount,
      (item.edgeBandRawMm / 1000).toFixed(2),
      item.edgeBandOrderMeters,
      formatPercent(item.utilization),
    ]),
    [],
    ["生产板件清单"],
    ["板件", "颜色/材质", "长度(mm)", "宽度(mm)", "数量", "木纹", "封边方式", "净封边(m)"],
    ...lastResult.parts.map((part) => [
      part.name,
      part.material,
      part.length,
      part.width,
      part.quantity,
      part.grainLocked ? "锁定" : "自由",
      edgeLabelFromPart(part),
      ((part.quantity * (part.length * part.edgeLong + part.width * part.edgeShort)) / 1000).toFixed(2),
    ]),
    [],
    ["排版定位清单"],
    ["颜色/材质", "板号", "序号", "板件", "长度(mm)", "宽度(mm)", "封边方式", "旋转", "木纹锁定", "X(mm)", "Y(mm)"],
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
        edgeLabelFromPart(placement),
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
    selectedPartIds.clear();
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
  selectedPartIds.clear();
  state.settings = { ...DEFAULT_SETTINGS };
  renderSettings();
  renderParts();
  resetResults();
  saveState({ immediate: true });
  showToast("已载入 1 张标准板的示例数据");
});

document.querySelectorAll("[data-parser-example]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.rawInput.value = createParserExampleByType(button.dataset.parserExample);
    elements.rawInput.focus();
    showToast(`已填入${button.textContent.trim()}示例`);
  });
});

document.getElementById("clear-raw-button").addEventListener("click", () => {
  elements.rawInput.value = "";
  elements.parseFeedback.textContent = "粘贴后点击解析，系统会先生成可编辑清单。";
  elements.parseFeedback.classList.remove("has-warning");
  setOcrStatus("使用 OCR.Space 免费接口，图片会发送到第三方服务。");
  elements.rawInput.focus();
});

elements.parseButton.addEventListener("click", parseRawInput);
elements.ocrButton.addEventListener("click", () => elements.ocrFile.click());
elements.ocrFile.addEventListener("change", () => {
  if (elements.ocrFile.files?.[0]) recognizeImage(elements.ocrFile.files[0]);
});

elements.partsBody.addEventListener("input", (event) => updateStateFromPartInput(event.target));
elements.partsBody.addEventListener("change", (event) => updateStateFromPartInput(event.target));
elements.partsBody.addEventListener("change", (event) => {
  if (!event.target.classList.contains("row-select")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  if (event.target.checked) selectedPartIds.add(row.dataset.id);
  else selectedPartIds.delete(row.dataset.id);
  renderBatchToolbar();
});
elements.partsBody.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="delete"]');
  if (!button) return;
  const row = button.closest("tr[data-id]");
  state.parts = state.parts.filter((part) => part.id !== row.dataset.id);
  selectedPartIds.delete(row.dataset.id);
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
elements.applyEdgeButton.addEventListener("click", applyBatchEdgePreset);
elements.applyGrainButton.addEventListener("click", applyBatchGrain);
elements.applyMaterialButton.addEventListener("click", applyBatchMaterial);
elements.deleteSelectedButton.addEventListener("click", deleteSelectedParts);
elements.mergeDuplicatesButton.addEventListener("click", mergeDuplicateParts);
elements.selectAllParts.addEventListener("change", () => {
  selectedPartIds = elements.selectAllParts.checked
    ? new Set(state.parts.map((part) => part.id))
    : new Set();
  renderParts();
});
elements.resultMaterialFilter.addEventListener("change", () => {
  if (lastResult) renderSheetCards(lastResult, elements.resultMaterialFilter.value);
});
document.getElementById("export-button").addEventListener("click", exportProject);
document.getElementById("import-button").addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", () => {
  if (elements.importFile.files?.[0]) importProject(elements.importFile.files[0]);
});
document.getElementById("csv-button").addEventListener("click", exportCsv);
document.getElementById("print-button").addEventListener("click", printResult);

renderAll();
