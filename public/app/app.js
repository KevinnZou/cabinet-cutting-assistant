import {
  DEFAULT_SETTINGS,
  createSampleParts,
  formatArea,
  normalizeMaterialRules,
  normalizeSettings,
  optimizeCutting,
} from "./optimizer.js";
import { createParserExampleByType, parsePartsText } from "./parser.js?v=20260809-1";
import {
  createCalculationBaseline,
  createProductionVersion,
  diffCalculationInputs,
  isCalculationCurrent,
} from "./calculation-state.js";
import {
  createProjectRecord,
  createSnapshot,
  duplicateProject,
  exportWorkspace,
  formatProjectStatus,
  getActiveProject,
  importWorkspace,
  loadWorkspace,
  persistWorkspace,
  restoreSnapshot,
  upsertProject,
} from "./project-store.js";
import {
  calculateQuotation,
  createQuoteVersion,
  normalizePriceBook,
} from "./pricing.js";

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
  customerName: document.getElementById("customer-name"),
  customerPhone: document.getElementById("customer-phone"),
  deliveryDate: document.getElementById("delivery-date"),
  projectStatus: document.getElementById("project-status"),
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
  resultValidity: document.getElementById("result-validity"),
  lockProductionButton: document.getElementById("lock-production-button"),
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
  leftoverRulesList: document.getElementById("leftover-rules-list"),
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
  quotationSection: document.getElementById("quotation-section"),
  materialPriceList: document.getElementById("material-price-list"),
  quoteDiscount: document.getElementById("quote-discount"),
  leftoverOwnership: document.getElementById("leftover-ownership"),
  quoteNote: document.getElementById("quote-note"),
  quoteSummary: document.getElementById("quote-summary"),
  quoteVersionList: document.getElementById("quote-version-list"),
  projectCenterDialog: document.getElementById("project-center-dialog"),
  projectList: document.getElementById("project-list"),
  projectSearch: document.getElementById("project-search"),
  projectFilter: document.getElementById("project-filter"),
  historyDialog: document.getElementById("history-dialog"),
  historyList: document.getElementById("history-list"),
  priceBookDialog: document.getElementById("price-book-dialog"),
  workspaceFile: document.getElementById("workspace-file"),
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `part-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newPart(overrides = {}) {
  const manualProvenance = {
    origin: "manual",
    sourceLine: null,
    sourceText: "手动录入",
    fields: Object.fromEntries(
      ["name", "material", "size", "quantity", "edges", "grain"].map((field) => [
        field,
        { kind: "confirmed", sourceLine: null, note: "人工录入" },
      ]),
    ),
  };
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
    provenance: manualProvenance,
    ...overrides,
  };
}

function createInitialState() {
  return {
    version: 3,
    projectName: "新建柜体项目",
    settings: { ...DEFAULT_SETTINGS },
    materialRules: {},
    customer: { name: "", phone: "", address: "" },
    status: "draft",
    deliveryDate: "",
    projectNotes: "",
    pricing: { discount: 0, leftoverOwnership: "customer", note: "" },
    snapshots: [],
    quoteVersions: [],
    productionVersions: [],
    currentProductionLockId: null,
    calculationBaseline: null,
    calculationState: { status: "not-calculated" },
    parts: createSampleParts().map((part) => ({ ...part, id: makeId() })),
    updatedAt: new Date().toISOString(),
  };
}

function hydrateProject(stored) {
  const base = createInitialState();
  const project = createProjectRecord({ ...base, ...(stored || {}) });
  return {
    ...project,
    settings: normalizeSettings(project.settings),
    materialRules: normalizeMaterialRules(
      project.materialRules || project.settings?.materialRules,
    ),
    parts: Array.isArray(project.parts)
      ? project.parts.map((part) => newPart(part))
      : base.parts,
    pricing: {
      discount: 0,
      leftoverOwnership: "customer",
      note: "",
      ...(project.pricing || {}),
    },
    calculationBaseline: project.calculationBaseline || null,
    calculationState: project.calculationState || { status: "not-calculated" },
    productionVersions: Array.isArray(project.productionVersions)
      ? project.productionVersions
      : [],
    currentProductionLockId: project.currentProductionLockId || null,
  };
}

let workspace = loadWorkspace(createInitialState());
let state = hydrateProject(getActiveProject(workspace) || createInitialState());
workspace.activeProjectId = state.id;
let lastResult = null;
let lastQuotation = null;
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
      state = upsertProject(workspace, state);
      persistWorkspace(workspace);
      elements.saveStatus.textContent = "已保存到本机";
    } catch {
      elements.saveStatus.textContent = "浏览器阻止了本地保存";
    }
  };

  if (immediate) persist();
  else saveTimer = setTimeout(persist, 320);
}

function saveSnapshot(reason) {
  createSnapshot(state, reason);
  state = upsertProject(workspace, state);
  persistWorkspace(workspace);
  renderHistory();
}

function switchProject(projectId) {
  const project = workspace.projects.find(
    (item) => item.id === projectId && !item.deletedAt,
  );
  if (!project) return;
  saveState({ immediate: true });
  workspace.activeProjectId = project.id;
  state = hydrateProject(project);
  selectedPartIds.clear();
  lastResult = null;
  lastQuotation = null;
  renderAll();
  persistWorkspace(workspace);
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

function materialRuleFor(material) {
  const normalized = normalizeMaterialRules(state.materialRules);
  return normalized[material] || {
    leftoverEdgeMode: "0/0",
    minLeftoverWidth: 50,
  };
}

function renderLeftoverRules() {
  if (!elements.leftoverRulesList) return;
  const materials = [...new Set(state.parts.map((part) => String(part.material || "未分类").trim() || "未分类"))];
  state.materialRules = normalizeMaterialRules(state.materialRules);

  if (!materials.length) {
    elements.leftoverRulesList.innerHTML = '<p class="leftover-empty">添加板件后，可按颜色设置余料封边。</p>';
    return;
  }

  elements.leftoverRulesList.innerHTML = materials
    .map((material) => {
      const rule = materialRuleFor(material);
      return `
        <div class="leftover-rule-row" data-material="${escapeHtml(material)}">
          <div class="leftover-material">
            <strong>${escapeHtml(material)}</strong>
            <span>可回收余料按本颜色单独统计</span>
          </div>
          <label>
            <span>余料封边</span>
            <select data-material-rule="leftoverEdgeMode">${edgePresetOptions(rule.leftoverEdgeMode)}</select>
          </label>
          <label>
            <span>最小短边</span>
            <div class="unit-input"><input data-material-rule="minLeftoverWidth" type="number" min="0" max="1000" step="1" value="${rule.minLeftoverWidth}" /><em>mm</em></div>
          </label>
        </div>`;
    })
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

const PROVENANCE_FIELD_LABELS = {
  name: "板件名",
  material: "颜色/材质",
  size: "尺寸",
  quantity: "数量",
  grain: "木纹",
  edges: "封边",
};

const PROVENANCE_KIND_LABELS = {
  explicit: "原文明确",
  inherited: "上下文继承",
  inferred: "系统推断",
  default: "待确认",
  confirmed: "人工确认",
};

function normalizedProvenance(part) {
  if (part.provenance?.fields) return part.provenance;
  return {
    origin: "legacy",
    sourceLine: part.sourceLine || null,
    sourceText: part.sourceText || "历史项目数据",
    fields: Object.fromEntries(
      Object.keys(PROVENANCE_FIELD_LABELS).map((field) => [
        field,
        { kind: "confirmed", sourceLine: part.sourceLine || null, note: "历史数据" },
      ]),
    ),
  };
}

function renderPartSourceDetail(part) {
  const provenance = normalizedProvenance(part);
  const sourceLabel = provenance.sourceLine
    ? `原文第 ${provenance.sourceLine} 行`
    : provenance.origin === "manual"
      ? "手动录入"
      : "历史项目数据";
  return `
    <tr class="source-detail-row" data-source-detail="${escapeHtml(part.id)}" hidden>
      <td colspan="7">
        <div class="source-detail">
          <div class="source-quote">
            <span>${sourceLabel}</span>
            <blockquote>${escapeHtml(provenance.sourceText || "—")}</blockquote>
          </div>
          <div class="source-fields">
            ${Object.entries(PROVENANCE_FIELD_LABELS)
              .map(([field, label]) => {
                const trace = provenance.fields[field] || { kind: "default", note: "待确认" };
                return `
                  <div class="source-field ${escapeHtml(trace.kind)}">
                    <span>${label}</span>
                    <strong>${PROVENANCE_KIND_LABELS[trace.kind] || "待确认"}</strong>
                    <small>${escapeHtml(trace.note || "")}</small>
                  </div>`;
              })
              .join("")}
          </div>
          ${part.reviewFlags?.length
            ? `<div class="source-review-actions"><span>${escapeHtml(part.reviewFlags.join("；"))}</span><button class="mini-action" data-action="confirm-source" type="button">确认本行无误</button></div>`
            : ""}
        </div>
      </td>
    </tr>`;
}

function markProvenanceConfirmed(part, field) {
  const provenance = normalizedProvenance(part);
  provenance.fields[field] = {
    kind: "confirmed",
    sourceLine: provenance.sourceLine,
    note: "已由人工修改或确认",
  };
  part.provenance = provenance;
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
                  <button class="source-button" data-action="toggle-source" type="button" aria-label="查看 ${escapeHtml(part.name)} 的解析来源">${part.provenance?.sourceLine ? `第${part.provenance.sourceLine}行` : "来源"}</button>
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
          ${renderPartSourceDetail(part)}
        `,
      )
      .join("");
  }

  const count = state.parts.reduce((sum, part) => sum + Math.max(0, Number(part.quantity) || 0), 0);
  elements.partsSummary.textContent = `${state.parts.length} 种板件 · ${count} 片`;
  elements.calculationReady.textContent = count ? `共 ${count} 片，等待排版` : "请先添加板件";
  renderPartsReview();
  renderBatchToolbar();
  renderLeftoverRules();
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
  const modeLabel =
    settings.optimizationMode === "aggressive"
      ? "极限省板"
      : settings.optimizationMode === "save"
        ? "省板优先"
        : "当前算法";
  elements.ruleSummary.textContent = `标准板 ${settings.boardWidth} × ${settings.boardHeight} mm · 锯缝 ${settings.kerf} mm · 修边 ${settings.trim} mm · ${modeLabel}`;
}

const RESULT_DEPENDENT_ACTIONS = [
  "csv-button",
  "print-button",
  "save-quote-button",
  "customer-quote-button",
  "production-order-button",
  "lock-production-button",
];

function isCurrentResult() {
  return Boolean(
    lastResult &&
    state.calculationBaseline?.signature &&
    lastResult.inputSignature === state.calculationBaseline.signature &&
    isCalculationCurrent(state, state.calculationBaseline),
  );
}

function setResultDependentControls(enabled) {
  RESULT_DEPENDENT_ACTIONS.forEach((id) => {
    const control = document.getElementById(id);
    if (control) control.disabled = !enabled;
  });
  elements.quotationSection
    ?.querySelectorAll("input, select")
    .forEach((control) => {
      control.disabled = !enabled;
    });
  elements.quotationSection?.classList.toggle("is-stale", !enabled);
}

function renderResultValidity() {
  if (!lastResult || !elements.resultValidity) {
    if (elements.resultValidity) elements.resultValidity.hidden = true;
    return;
  }

  const current = isCurrentResult();
  elements.resultValidity.hidden = false;
  setResultDependentControls(current);
  if (current) {
    const lockedVersion = (state.productionVersions || []).find(
      (version) =>
        version.id === state.currentProductionLockId &&
        version.signature === state.calculationBaseline?.signature,
    );
    elements.resultValidity.className = `result-validity ${lockedVersion ? "is-locked" : "is-current"}`;
    elements.resultValidity.innerHTML = lockedVersion
      ? `<i>✓</i><div><strong>生产版本已锁定</strong><span>${escapeHtml(lockedVersion.number)} · ${formatDateTime(lockedVersion.lockedAt)}，当前清单与锁定版本一致。</span></div>`
      : `<i>✓</i><div><strong>当前排版结果有效</strong><span>清单和加工规则与本次计算一致，可继续报价、打印或锁定生产版本。</span></div>`;
    elements.lockProductionButton.disabled = Boolean(lockedVersion);
    elements.lockProductionButton.textContent = lockedVersion ? `${lockedVersion.number} 已锁定` : "锁定生产版本";
    return;
  }

  const diff = diffCalculationInputs(state.calculationBaseline?.input, state);
  const reason = state.calculationState?.reason || "清单或加工规则已修改";
  const lockedVersion = (state.productionVersions || []).find(
    (version) => version.id === state.currentProductionLockId,
  );
  elements.resultValidity.className = "result-validity is-stale";
  elements.resultValidity.innerHTML = `
    <i>!</i>
    <div>
      <strong>当前排版结果已过期，禁止用于报价或生产</strong>
      <span>${escapeHtml(reason)}${lockedVersion ? `；已锁定版本 ${escapeHtml(lockedVersion.number)} 不会被覆盖` : ""}。</span>
      <div class="result-diff">
        ${diff.labels.length ? diff.labels.map((label) => `<b>${escapeHtml(label)}</b>`).join("") : "<b>计算输入已发生变化</b>"}
      </div>
    </div>
  `;
  elements.lockProductionButton.textContent = "重新计算后锁定";
}

function resetResults() {
  lastResult = null;
  lastQuotation = null;
  elements.resultPlaceholder.hidden = false;
  elements.resultContent.hidden = true;
  elements.resultActions.hidden = true;
  elements.resultFilterBar.hidden = true;
  elements.resultCaption.textContent = "结果仅在当前设备生成";
  elements.quotationSection.hidden = true;
  if (elements.resultValidity) elements.resultValidity.hidden = true;
  setResultDependentControls(false);
}

function invalidateCalculation(reason = "清单或加工规则已修改") {
  if (state.calculationBaseline) {
    state.calculationState = {
      status: "stale",
      reason,
      changedAt: new Date().toISOString(),
    };
    if (["calculated", "quoted", "production"].includes(state.status)) {
      state.status = "review";
      elements.projectStatus.value = state.status;
    }
  }
  if (lastResult) {
    lastQuotation = null;
    elements.resultCaption.textContent = "旧结果仅供对照 · 请重新计算";
    renderResultValidity();
  } else {
    resetResults();
  }
}

function requireCurrentResult(message = "清单或规则已变化，请重新计算") {
  if (!lastResult) {
    showToast("请先完成排版计算");
    return false;
  }
  if (!isCurrentResult()) {
    renderResultValidity();
    showToast(message);
    return false;
  }
  return true;
}

function renderParseFeedback(result) {
  const warnings = result.warnings.slice(0, 3);
  const coverage = result.stats.lineCount
    ? Math.round(((result.stats.lineCount - result.warnings.length) / result.stats.lineCount) * 100)
    : 0;
  const warningHtml = warnings.length
    ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "";
  const provenance = result.stats.provenance || {};
  elements.parseFeedback.innerHTML = `
    <strong>已识别 ${result.stats.partTypeCount} 种板件 / ${result.stats.pieceCount} 片${result.stats.materialRuleCount ? ` · ${result.stats.materialRuleCount} 条余料规则` : ""}</strong>
    <span>解析覆盖率约 ${coverage}% · 请在下方确认尺寸、颜色、木纹、板件封边和余料规则。</span>
    <div class="parse-trace-summary">
      <b>原文明确 ${provenance.explicit || 0}</b>
      <b>上下文继承 ${provenance.inherited || 0}</b>
      <b>系统推断 ${provenance.inferred || 0}</b>
      <b class="${provenance.default ? "needs-review" : ""}">待确认 ${provenance.default || 0}</b>
    </div>
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
      sourceText: part.sourceText,
      sourceLine: part.sourceLine,
      provenance: part.provenance,
    }),
  );

  state.parts = elements.appendParse.checked ? [...state.parts, ...parsedParts] : parsedParts;
  state.materialRules = elements.appendParse.checked
    ? { ...state.materialRules, ...result.materialRules }
    : result.materialRules;
  selectedPartIds.clear();
  renderParts();
  invalidateCalculation("重新解析了文字清单");
  renderParseFeedback(result);
  saveSnapshot("文字清单解析");
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
    markProvenanceConfirmed(part, "edges");
    markProvenanceConfirmed(part, "edges");
  } else if (target.type === "checkbox") part[field] = target.checked;
  else if (target.type === "number" || target.tagName === "SELECT") part[field] = parseNumericValue(target.value);
  else part[field] = target.value;

  if (field === "material") {
    part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("颜色"));
    markProvenanceConfirmed(part, "material");
    renderLeftoverRules();
  }
  if (field === "quantity") {
    part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("数量"));
    markProvenanceConfirmed(part, "quantity");
  }
  if (field === "name") {
    part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("板件名"));
    markProvenanceConfirmed(part, "name");
  }
  if (field === "length" || field === "width") {
    part.reviewFlags = (part.reviewFlags || []).filter((flag) => !flag.includes("尺寸"));
    markProvenanceConfirmed(part, "size");
  }
  if (field === "grainLocked") markProvenanceConfirmed(part, "grain");

  const count = state.parts.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  elements.partsSummary.textContent = `${state.parts.length} 种板件 · ${count} 片`;
  elements.calculationReady.textContent = count ? `共 ${count} 片，等待排版` : "请先添加板件";
  renderPartsReview();
  invalidateCalculation(`修改了“${part.name || "板件"}”`);
  saveState();
}

function selectedParts() {
  return state.parts.filter((part) => selectedPartIds.has(part.id));
}

function finishBatchChange(message) {
  renderParts();
  invalidateCalculation(message);
  saveSnapshot(message);
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
    markProvenanceConfirmed(part, "grain");
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
    markProvenanceConfirmed(part, "material");
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

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function renderProjectList() {
  const query = elements.projectSearch.value.trim().toLowerCase();
  const filter = elements.projectFilter.value;
  const projects = workspace.projects
    .filter((project) => {
      if (filter === "trash") return Boolean(project.deletedAt);
      if (filter === "archived") return !project.deletedAt && project.status === "archived";
      if (filter === "active") return !project.deletedAt && project.status !== "archived";
      return true;
    })
    .filter((project) => {
      if (!query) return true;
      return `${project.projectName} ${project.customer?.name || ""}`.toLowerCase().includes(query);
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  elements.projectList.innerHTML = projects.length
    ? projects
        .map((project) => {
          const pieceCount = (project.parts || []).reduce(
            (sum, part) => sum + Math.max(0, Number(part.quantity) || 0),
            0,
          );
          const isTrash = Boolean(project.deletedAt);
          return `
            <article class="project-row ${project.id === state.id ? "is-active" : ""}" data-project-id="${escapeHtml(project.id)}">
              <div class="project-row-main">
                <strong>${escapeHtml(project.projectName)}</strong>
                <span>${escapeHtml(project.customer?.name || "未填写客户")} · ${project.parts?.length || 0} 种 / ${pieceCount} 片</span>
              </div>
              <div class="project-row-meta">
                <b class="project-status-pill">${isTrash ? "回收站" : formatProjectStatus(project.status)}</b>
                <span>更新 ${formatDateTime(project.updatedAt)}</span>
              </div>
              <div class="project-row-meta">
                <span>报价版本 ${project.quoteVersions?.length || 0}</span>
                <span>历史版本 ${project.snapshots?.length || 0}</span>
              </div>
              <div class="project-row-actions">
                ${isTrash
                  ? `<button class="mini-action" data-project-action="restore" type="button">恢复</button>`
                  : `
                    <button class="mini-action" data-project-action="open" type="button">打开</button>
                    <button class="mini-action" data-project-action="duplicate" type="button">复制</button>
                    <button class="mini-action" data-project-action="archive" type="button">${project.status === "archived" ? "取消归档" : "归档"}</button>
                    <button class="mini-action danger" data-project-action="trash" type="button">删除</button>
                  `}
              </div>
            </article>`;
        })
        .join("")
    : '<div class="empty-panel">没有符合条件的项目</div>';
}

function renderHistory() {
  if (!elements.historyList) return;
  const snapshots = state.snapshots || [];
  elements.historyList.innerHTML = snapshots.length
    ? snapshots
        .map(
          (snapshot) => `
            <div class="history-row" data-snapshot-id="${escapeHtml(snapshot.id)}">
              <div><strong>${escapeHtml(snapshot.reason)}</strong><span>${formatDateTime(snapshot.createdAt)} · ${snapshot.data?.parts?.length || 0} 种板件</span></div>
              <button class="mini-action" data-history-action="restore" type="button">恢复此版本</button>
            </div>`,
        )
        .join("")
    : '<div class="empty-panel">当前项目还没有历史版本</div>';
}

function createNewProject() {
  saveState({ immediate: true });
  const initial = createInitialState();
  initial.parts = [];
  initial.projectName = `新项目 ${workspace.projects.filter((project) => !project.deletedAt).length + 1}`;
  const project = createProjectRecord(initial);
  workspace.projects.unshift(project);
  workspace.activeProjectId = project.id;
  persistWorkspace(workspace);
  state = hydrateProject(project);
  selectedPartIds.clear();
  lastResult = null;
  lastQuotation = null;
  renderAll();
  renderProjectList();
  if (elements.projectCenterDialog.open) elements.projectCenterDialog.close();
  showToast("已创建新项目");
}

function handleProjectAction(projectId, action) {
  const project = workspace.projects.find((item) => item.id === projectId);
  if (!project) return;
  if (action === "open") {
    switchProject(projectId);
    elements.projectCenterDialog.close();
    return;
  }
  if (action === "duplicate") {
    const copy = duplicateProject(workspace, projectId);
    persistWorkspace(workspace);
    if (copy) switchProject(copy.id);
    renderProjectList();
    elements.projectCenterDialog.close();
    showToast("项目副本已创建");
    return;
  }
  if (action === "archive") {
    project.status = project.status === "archived" ? "draft" : "archived";
  } else if (action === "trash") {
    project.deletedAt = new Date().toISOString();
    if (project.id === state.id) {
      let next = workspace.projects.find((item) => !item.deletedAt && item.id !== project.id);
      if (!next) {
        next = createProjectRecord({ ...createInitialState(), parts: [] });
        workspace.projects.unshift(next);
      }
      workspace.activeProjectId = next.id;
      state = hydrateProject(next);
      renderAll();
    }
  } else if (action === "restore") {
    project.deletedAt = null;
    project.status = "draft";
  }
  project.updatedAt = new Date().toISOString();
  persistWorkspace(workspace);
  renderProjectList();
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
          <div><dt>板件封边</dt><dd>${(item.partEdgeBandRawMm / 1000).toFixed(2)} 米</dd></div>
          <div><dt>余料封边</dt><dd>${(item.leftoverEdgeBandRawMm / 1000).toFixed(2)} 米</dd></div>
          <div><dt>封边领料</dt><dd>${item.edgeBandOrderMeters} 米</dd></div>
          <div><dt>可回收余料</dt><dd>${item.leftoverCount} 块</dd></div>
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
    leftoverRule: sheet.leftoverRule,
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
    leftovers: sheet.leftovers.map((leftover) => ({
      length: leftover.length,
      width: leftover.width,
      x: leftover.x,
      y: leftover.y,
      placedWidth: leftover.placedWidth,
      placedHeight: leftover.placedHeight,
      edgeMode: leftover.edgeMode,
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
  const leftovers = sheet.leftovers
    .map((leftover) => {
      const labelFits =
        leftover.placedWidth > boardW * 0.1 &&
        leftover.placedHeight > boardH * 0.03;
      return `
        <g class="leftover-shape">
          <rect x="${leftover.x}" y="${leftover.y}" width="${leftover.placedWidth}" height="${leftover.placedHeight}" fill="#fff4c7" fill-opacity="0.72" stroke="#9a6a1a" stroke-width="2" stroke-dasharray="10 7" />
          ${labelFits ? `<text x="${leftover.x + leftover.placedWidth / 2}" y="${leftover.y + leftover.placedHeight / 2}" text-anchor="middle" dominant-baseline="middle" fill="#6d4a10" font-size="24" font-weight="700">余料 ${leftover.length}×${leftover.width}</text>` : ""}
        </g>`;
    })
    .join("");
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
      ${leftovers}
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
            <span>${result.settings.boardWidth} × ${result.settings.boardHeight} mm · 单张 ${sheet.placements.length} 片 · 余料 ${sheet.leftovers.length} 块${group.count > 1 ? ` · 共 ${group.count} 张同版` : ""}</span>
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
            ${sheet.leftovers.map((leftover, index) => `
              <div class="placement-row leftover-row">
                <i>余</i>
                <div><strong>可回收余料 ${index + 1}</strong><span>${leftover.length} × ${leftover.width} mm · ${edgeLabelFromPart(leftover)} · 净封边 ${(leftover.edgeBandRawMm / 1000).toFixed(2)} 米</span></div>
              </div>
            `).join("")}
          </div>
        </div>
      </article>
    `;
    })
    .join("");
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function effectivePriceBook() {
  const book = normalizePriceBook(workspace.priceBook);
  return {
    ...book,
    materialPrices: {
      ...book.materialPrices,
      ...(state.pricing?.materialPrices || {}),
    },
  };
}

function renderPriceBook() {
  const book = normalizePriceBook(workspace.priceBook);
  document.querySelectorAll("[data-price-book]").forEach((input) => {
    input.value = book[input.dataset.priceBook];
  });
}

function renderMaterialPrices(result = lastResult) {
  if (!result) return;
  const book = effectivePriceBook();
  elements.materialPriceList.innerHTML = result.materialSummaries
    .map((material) => {
      const price = book.materialPrices[material.material] || { cost: 0, sale: 0 };
      return `
        <div class="material-price-row" data-material-price="${escapeHtml(material.material)}">
          <div><strong>${escapeHtml(material.material)}</strong><small>${material.sheetCount} 张整板 · ${material.partCount} 片</small></div>
          <label><span>进价 / 张</span><input data-price-field="cost" type="number" min="0" step="0.01" value="${Number(price.cost || 0)}" /></label>
          <label><span>售价 / 张</span><input data-price-field="sale" type="number" min="0" step="0.01" value="${Number(price.sale || 0)}" /></label>
          <b>${money(material.sheetCount * Number(price.sale || 0))}</b>
        </div>`;
    })
    .join("");
}

function updateQuotation() {
  if (!lastResult) return;
  state.pricing = {
    discount: Math.max(0, parseNumericValue(elements.quoteDiscount.value, 0)),
    leftoverOwnership: elements.leftoverOwnership.value,
    note: elements.quoteNote.value.trim(),
    materialPrices: state.pricing?.materialPrices || {},
  };
  lastQuotation = calculateQuotation(lastResult, effectivePriceBook(), state.pricing);
  const totals = lastQuotation.totals;
  elements.quoteSummary.innerHTML = `
    <h3>本单报价汇总</h3>
    <div class="quote-summary-lines">
      ${lastQuotation.lines.map((line) => `<div class="quote-summary-line"><span>${escapeHtml(line.name)} · ${line.quantity} ${line.unit}</span><strong>${money(line.saleAmount)}</strong></div>`).join("")}
      ${lastQuotation.discount ? `<div class="quote-summary-line"><span>订单优惠</span><strong>-${money(lastQuotation.discount)}</strong></div>` : ""}
      ${lastQuotation.tax ? `<div class="quote-summary-line"><span>税费 ${lastQuotation.taxRate}%</span><strong>${money(lastQuotation.tax)}</strong></div>` : ""}
    </div>
    <div class="quote-margin">
      <div><span>内部成本</span><strong>${money(totals.costTotal)}</strong></div>
      <div><span>预计毛利</span><strong>${money(totals.grossProfit)}</strong></div>
      <div><span>毛利率</span><strong>${totals.grossMargin.toFixed(1)}%</strong></div>
      <div><span>余料归属</span><strong>${lastQuotation.leftoverOwnership === "customer" ? "客户" : lastQuotation.leftoverOwnership === "factory" ? "加工厂" : "折价返还"}</strong></div>
    </div>
    <div class="quote-summary-total"><span>客户应付</span><strong>${money(totals.saleTotal)}</strong></div>
  `;
  saveState();
}

function renderQuoteVersions() {
  const versions = state.quoteVersions || [];
  elements.quoteVersionList.innerHTML = versions.length
    ? versions
        .map(
          (quote) =>
            `<span class="quote-version-chip">${escapeHtml(quote.number)} · ${money(quote.quotation?.totals?.saleTotal)} · ${formatDateTime(quote.createdAt)}</span>`,
        )
        .join("")
    : "<span>尚未保存正式报价版本</span>";
}

function renderQuotation(result) {
  elements.quotationSection.hidden = false;
  elements.quoteDiscount.value = state.pricing?.discount || 0;
  elements.leftoverOwnership.value = state.pricing?.leftoverOwnership || "customer";
  elements.quoteNote.value = state.pricing?.note || "";
  renderMaterialPrices(result);
  renderQuoteVersions();
  updateQuotation();
}

function saveQuoteVersion() {
  if (!requireCurrentResult("当前排版已过期，重新计算后才能保存报价")) return;
  if (!lastQuotation) return;
  const quote = createQuoteVersion(state, lastResult, lastQuotation);
  state.quoteVersions = [quote, ...(state.quoteVersions || [])];
  state.status = "quoted";
  elements.projectStatus.value = state.status;
  saveSnapshot(`保存报价 ${quote.number}`);
  renderQuoteVersions();
  showToast(`已保存报价版本 ${quote.number}`);
}

function createCustomerQuoteDocument() {
  const quotation = lastQuotation;
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 7);
  const rows = quotation.lines
    .map(
      (line) => `<tr><td>${escapeHtml(line.category)}</td><td>${escapeHtml(line.name)}</td><td>${line.quantity} ${line.unit}</td><td>${money(line.saleUnitPrice)}</td><td>${money(line.saleAmount)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(state.projectName)}报价单</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#17231d;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
    header{display:flex;justify-content:space-between;gap:24px;padding-bottom:16px;border-bottom:3px solid #17291f}h1{margin:0;font-size:25px}p{margin:6px 0 0;color:#6b776f}.meta{text-align:right;line-height:1.8}
    .customer{margin:18px 0;padding:13px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:#f4f7f3;border-radius:8px}.customer span{display:block;color:#768279;font-size:9px}.customer strong{display:block;margin-top:4px}
    table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #dce3dc;text-align:left}th{background:#f2f5f2;color:#58665d;font-size:10px}td:last-child,th:last-child{text-align:right}
    .total{margin-left:auto;margin-top:18px;width:300px;display:grid;gap:8px}.total div{display:flex;justify-content:space-between}.total .grand{padding-top:12px;border-top:2px solid #17291f;font-size:18px;font-weight:800}.note{margin-top:28px;padding:14px;border:1px solid #dce3dc;border-radius:8px;line-height:1.8}
  </style></head><body>
    <header><div><h1>柜体板开料报价单</h1><p>${escapeHtml(state.projectName)}</p></div><div class="meta">报价日期：${new Date().toLocaleDateString("zh-CN")}<br>有效期至：${validUntil.toLocaleDateString("zh-CN")}</div></header>
    <section class="customer"><div><span>客户名称</span><strong>${escapeHtml(state.customer?.name || "—")}</strong></div><div><span>联系电话</span><strong>${escapeHtml(state.customer?.phone || "—")}</strong></div><div><span>预计交付</span><strong>${escapeHtml(state.deliveryDate || "待确认")}</strong></div></section>
    <table><thead><tr><th>分类</th><th>项目</th><th>数量</th><th>单价</th><th>金额</th></tr></thead><tbody>${rows}</tbody></table>
    <section class="total"><div><span>费用小计</span><strong>${money(quotation.totals.saleSubtotal)}</strong></div>${quotation.discount ? `<div><span>优惠</span><strong>-${money(quotation.discount)}</strong></div>` : ""}${quotation.totals.tax ? `<div><span>税费</span><strong>${money(quotation.totals.tax)}</strong></div>` : ""}<div class="grand"><span>合计</span><strong>${money(quotation.totals.saleTotal)}</strong></div></section>
    <section class="note">余料归属：${quotation.leftoverOwnership === "customer" ? "余料归客户" : quotation.leftoverOwnership === "factory" ? "余料归加工厂" : "余料折价返还"}<br>${escapeHtml(state.pricing?.note || "本报价根据当前确认的板件清单及排版结果生成，清单变更后需重新报价。")}</section>
  </body></html>`;
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
        <td>${(item.partEdgeBandRawMm / 1000).toFixed(2)} 米</td>
        <td>${(item.leftoverEdgeBandRawMm / 1000).toFixed(2)} 米</td>
        <td>${item.edgeBandOrderMeters} 米</td>
        <td>${item.leftoverCount} 块</td>
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
      const leftovers = sheet.leftovers
        .map((leftover, index) => `
          <tr>
            <td>余${index + 1}</td>
            <td>可回收余料</td>
            <td>${leftover.length} × ${leftover.width}</td>
            <td>${edgeLabelFromPart(leftover)} / 净 ${(leftover.edgeBandRawMm / 1000).toFixed(2)} 米</td>
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
              <tbody>${placements}${leftovers}</tbody>
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
  <title>${escapeHtml(state.projectName || "开料项目")} - 内部生产单</title>
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
        <p>内部生产单 · 客户：${escapeHtml(state.customer?.name || "未填写")} · 交付：${escapeHtml(state.deliveryDate || "待确认")}</p>
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
      <div class="stat"><span>余料 / 板件</span><strong>${totals.leftoverCount} 块 / ${totals.placedPartCount} 片</strong></div>
    </section>

    <section class="summary-block">
      <h2>按颜色汇总</h2>
      <table>
        <thead><tr><th>颜色 / 材质</th><th>板材</th><th>片数</th><th>板件封边</th><th>余料封边</th><th>领料</th><th>余料</th><th>利用率</th></tr></thead>
        <tbody>${materialRows}</tbody>
      </table>
    </section>

    ${sheetCards}
  </main>
</body>
</html>`;
}

function openPrintDocument(content) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("浏览器拦截了打印窗口，请允许弹窗后重试");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function printResult() {
  if (!requireCurrentResult("当前排版已过期，重新计算后才能打印")) return;
  openPrintDocument(createPrintDocument(lastResult));
}

function lockProductionVersion() {
  if (!requireCurrentResult("当前排版已过期，重新计算后才能锁定生产")) return;
  if (!lastResult.totals?.integrityOk || lastResult.totals?.placedPartCount !== lastResult.totals?.partCount) {
    showToast("生产完整性校验未通过，暂时不能锁定");
    return;
  }
  const existingLock = (state.productionVersions || []).find(
    (version) => version.signature === state.calculationBaseline.signature,
  );
  if (existingLock) {
    state.currentProductionLockId = existingLock.id;
    renderResultValidity();
    showToast(`${existingLock.number} 已经锁定`);
    return;
  }
  const version = createProductionVersion(
    state,
    lastResult,
    state.calculationBaseline,
  );
  state.productionVersions = [version, ...(state.productionVersions || [])].slice(0, 5);
  state.currentProductionLockId = version.id;
  state.status = "production";
  elements.projectStatus.value = state.status;
  saveSnapshot(`锁定生产版本 ${version.number}`);
  renderResultValidity();
  showToast(`已锁定生产版本 ${version.number}`);
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
    ? `<i>✓</i><div><strong>生产校验通过</strong><span>${totals.partCount} 片已全部排入，无越界、重叠或少算；识别 ${totals.leftoverCount} 块可回收余料，并已比较 ${totals.strategyCount || 1} 套排版策略。</span></div>`
    : `<i>!</i><div><strong>结果需要处理后再下单</strong><span>请先解决下方异常项，系统不会把异常结果标记为可生产。</span></div>`;
  elements.resultStats.innerHTML = `
    <article class="stat-card accent"><span>板材用量</span><strong>${totals.sheetCount}<em>张</em></strong><small>${totals.materialCount} 种颜色 / 材质</small></article>
    <article class="stat-card"><span>封边领料</span><strong>${totals.edgeBandOrderMeters}<em>米</em></strong><small>板件 ${(totals.partEdgeBandRawMm / 1000).toFixed(2)} m + 余料 ${(totals.leftoverEdgeBandRawMm / 1000).toFixed(2)} m</small></article>
    <article class="stat-card"><span>整体利用率</span><strong>${formatPercent(totals.utilization)}</strong><small>板件面积 ${formatArea(totals.usedArea)}</small></article>
    <article class="stat-card"><span>可回收余料</span><strong>${totals.leftoverCount}<em>块</em></strong><small>面积 ${formatArea(totals.leftoverArea)}</small></article>
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
      <div><dt>可回收余料</dt><dd>${totals.leftoverCount} 块</dd></div>
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

  const edgeFormula = `(${(totals.partEdgeBandRawMm / 1000).toFixed(2)} + ${(totals.leftoverEdgeBandRawMm / 1000).toFixed(2)}) m × (1 + ${result.settings.edgeLoss}%)`;
  elements.calculationNotes.innerHTML = `
    <div><span>板材计算</span><strong>按颜色 / 材质分板</strong><small>相同材质参与同一组二维排版，不同材质自动分开。</small></div>
    <div><span>切割余量</span><strong>${result.settings.kerf} mm 锯缝 · ${result.settings.trim} mm 修边</strong><small>板件之间预留锯缝，标准板四周扣除修边宽度。</small></div>
    <div><span>余料口径</span><strong>${totals.leftoverCount} 块 · ${formatArea(totals.leftoverArea)}</strong><small>按每种颜色设置的最小短边过滤，锯缝与修边不计入可回收余料。</small></div>
    <div><span>封边公式</span><strong>${edgeFormula}</strong><small>板件与余料封边合并计损耗；${result.settings.roundEdgeBand ? "不同颜色分别按整米向上取整，再汇总领料。" : "不同颜色分别保留两位小数，再汇总领料。"}</small></div>
  `;
  renderQuotation(result);
  renderResultValidity();
}

function runOptimizationInWorker(parts, settings) {
  if (!("Worker" in window)) {
    return Promise.resolve(optimizeCutting(parts, settings));
  }

  calculationWorker?.terminate();
  calculationWorker = new Worker("./optimizer-worker.js?v=20260730-2", { type: "module" });
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

  const settings = normalizeSettings(state.settings);
  elements.calculateButton.disabled = true;
  const calculatingText =
    settings.optimizationMode === "aggressive"
      ? "正在极限省板…"
      : settings.optimizationMode === "save"
        ? "正在省板优化…"
        : "正在比较排版方案…";
  elements.calculateButton.querySelector("span").textContent = calculatingText;

  try {
    const result = await runOptimizationInWorker(state.parts, {
      ...settings,
      materialRules: state.materialRules,
    });
    state.calculationBaseline = createCalculationBaseline(state, result);
    state.calculationState = {
      status: "current",
      calculatedAt: state.calculationBaseline.calculatedAt,
    };
    result.inputSignature = state.calculationBaseline.signature;
    state.status = "calculated";
    elements.projectStatus.value = state.status;
    renderResults(result);
    saveSnapshot("排版计算完成");
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
  if (!requireCurrentResult("当前排版已过期，重新计算后才能导出清单")) return;
  const rows = [
    ["项目", state.projectName],
    ["标准板", `${lastResult.settings.boardWidth} × ${lastResult.settings.boardHeight} mm`],
    ["板材张数", lastResult.totals.sheetCount],
    ["板件净封边（米）", (lastResult.totals.partEdgeBandRawMm / 1000).toFixed(2)],
    ["余料净封边（米）", (lastResult.totals.leftoverEdgeBandRawMm / 1000).toFixed(2)],
    ["封边领料（米）", lastResult.totals.edgeBandOrderMeters],
    [],
    ["按颜色汇总"],
    ["颜色/材质", "规格数", "片数", "板材张数", "板件封边(m)", "余料封边(m)", "封边领料(m)", "余料块数", "余料面积(m²)", "利用率"],
    ...lastResult.materialSummaries.map((item) => [
      item.material,
      item.partTypeCount,
      item.partCount,
      item.sheetCount,
      (item.partEdgeBandRawMm / 1000).toFixed(2),
      (item.leftoverEdgeBandRawMm / 1000).toFixed(2),
      item.edgeBandOrderMeters,
      item.leftoverCount,
      (item.leftoverArea / 1_000_000).toFixed(3),
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
  rows.push(
    [],
    ["可回收余料清单"],
    ["颜色/材质", "板号", "序号", "长度(mm)", "宽度(mm)", "封边方式", "净封边(m)", "面积(m²)", "X(mm)", "Y(mm)"],
  );
  lastResult.sheets.forEach((sheet) => {
    sheet.leftovers.forEach((leftover, index) => {
      rows.push([
        sheet.material,
        sheet.number,
        index + 1,
        leftover.length,
        leftover.width,
        edgeLabelFromPart(leftover),
        (leftover.edgeBandRawMm / 1000).toFixed(2),
        (leftover.area / 1_000_000).toFixed(3),
        leftover.x,
        leftover.y,
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
    const imported = createProjectRecord({
      ...createInitialState(),
      ...stored,
      id: makeId(),
      version: 3,
      projectName: String(stored.projectName || file.name.replace(/\.json$/i, "")),
      settings: normalizeSettings(stored.settings),
      materialRules: normalizeMaterialRules(
        stored.materialRules || stored.settings?.materialRules,
      ),
      parts: stored.parts.map((part) => newPart(part)),
      updatedAt: new Date().toISOString(),
      snapshots: [],
      quoteVersions: stored.quoteVersions || [],
    });
    workspace.projects.unshift(imported);
    workspace.activeProjectId = imported.id;
    state = hydrateProject(imported);
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

function exportAllData() {
  saveState({ immediate: true });
  downloadFile(
    `开料助手全部数据-${new Date().toISOString().slice(0, 10)}.json`,
    exportWorkspace(workspace),
    "application/json;charset=utf-8",
  );
  showToast("全部项目与价格档案已备份");
}

async function importAllData(file) {
  try {
    const imported = importWorkspace(await file.text());
    if (!window.confirm(`将恢复 ${imported.projects.length} 个项目并覆盖当前本地数据，是否继续？`)) return;
    workspace = imported;
    persistWorkspace(workspace);
    state = hydrateProject(getActiveProject(workspace) || workspace.projects[0]);
    selectedPartIds.clear();
    renderAll();
    renderProjectList();
    showToast("全部项目与价格档案已恢复");
  } catch {
    showToast("恢复失败：备份文件格式不正确");
  } finally {
    elements.workspaceFile.value = "";
  }
}

function renderAll() {
  elements.projectName.value = state.projectName;
  elements.customerName.value = state.customer?.name || "";
  elements.customerPhone.value = state.customer?.phone || "";
  elements.deliveryDate.value = state.deliveryDate || "";
  elements.projectStatus.value = state.status || "draft";
  renderSettings();
  renderParts();
  renderHistory();
  renderQuoteVersions();
  renderPriceBook();
  resetResults();
}

document.getElementById("add-part-button").addEventListener("click", () => {
  state.parts.push(newPart());
  renderParts();
  invalidateCalculation("新增了板件");
  saveState();
  elements.partsBody.querySelector("tr:last-child input")?.focus();
});

document.getElementById("sample-button").addEventListener("click", () => {
  state.parts = createSampleParts().map((part) => newPart({ ...part, id: makeId() }));
  state.materialRules = {};
  selectedPartIds.clear();
  state.settings = { ...DEFAULT_SETTINGS };
  renderSettings();
  renderParts();
  invalidateCalculation("载入了示例数据");
  saveSnapshot("载入示例数据");
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
elements.leftoverRulesList.addEventListener("change", (event) => {
  const control = event.target.closest("[data-material-rule]");
  const row = control?.closest("[data-material]");
  if (!control || !row) return;
  const material = row.dataset.material;
  const rule = materialRuleFor(material);
  if (control.dataset.materialRule === "minLeftoverWidth") {
    rule.minLeftoverWidth = Math.max(
      0,
      Math.min(1000, Math.round(parseNumericValue(control.value, 50))),
    );
  } else {
    rule.leftoverEdgeMode = edgePresetFromValue(control.value).value;
  }
  state.materialRules = {
    ...state.materialRules,
    [material]: rule,
  };
  renderLeftoverRules();
  invalidateCalculation(`修改了“${material}”余料规则`);
  saveState();
});
elements.partsBody.addEventListener("click", (event) => {
  const sourceButton = event.target.closest('[data-action="toggle-source"]');
  if (sourceButton) {
    const row = sourceButton.closest("tr[data-id]");
    const detail = elements.partsBody.querySelector(
      `[data-source-detail="${CSS.escape(row.dataset.id)}"]`,
    );
    if (detail) {
      detail.hidden = !detail.hidden;
      sourceButton.classList.toggle("is-open", !detail.hidden);
    }
    return;
  }

  const confirmButton = event.target.closest('[data-action="confirm-source"]');
  if (confirmButton) {
    const detail = confirmButton.closest("[data-source-detail]");
    const part = state.parts.find((item) => item.id === detail?.dataset.sourceDetail);
    if (!part) return;
    Object.keys(PROVENANCE_FIELD_LABELS).forEach((field) =>
      markProvenanceConfirmed(part, field),
    );
    part.reviewFlags = [];
    renderParts();
    saveState();
    showToast(`已确认“${part.name}”`);
    return;
  }

  const button = event.target.closest('[data-action="delete"]');
  if (!button) return;
  const row = button.closest("tr[data-id]");
  state.parts = state.parts.filter((part) => part.id !== row.dataset.id);
  selectedPartIds.delete(row.dataset.id);
  renderParts();
  invalidateCalculation("删除了板件");
  saveState();
});

document.querySelectorAll("[data-setting]").forEach((input) => {
  input.addEventListener("change", () => {
    const key = input.dataset.setting;
    if (input.type === "checkbox") state.settings[key] = input.checked;
    else if (input.tagName === "SELECT") state.settings[key] = input.value;
    else state.settings[key] = parseNumericValue(input.value, state.settings[key]);
    state.settings = normalizeSettings(state.settings);
    renderSettings();
    invalidateCalculation("修改了加工规则");
    saveState();
  });
});

elements.projectName.addEventListener("input", () => {
  state.projectName = elements.projectName.value || "未命名项目";
  saveState();
});
elements.customerName.addEventListener("input", () => {
  state.customer = { ...state.customer, name: elements.customerName.value.trimStart() };
  saveState();
});
elements.customerPhone.addEventListener("input", () => {
  state.customer = { ...state.customer, phone: elements.customerPhone.value.trimStart() };
  saveState();
});
elements.deliveryDate.addEventListener("change", () => {
  state.deliveryDate = elements.deliveryDate.value;
  saveState();
});
elements.projectStatus.addEventListener("change", () => {
  state.status = elements.projectStatus.value;
  saveState({ immediate: true });
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
elements.lockProductionButton.addEventListener("click", lockProductionVersion);

document.getElementById("project-center-button").addEventListener("click", () => {
  saveState({ immediate: true });
  renderProjectList();
  elements.projectCenterDialog.showModal();
});
document.getElementById("quick-new-project-button").addEventListener("click", createNewProject);
document.getElementById("price-book-button").addEventListener("click", () => {
  renderPriceBook();
  elements.priceBookDialog.showModal();
});
document.getElementById("history-button").addEventListener("click", () => {
  renderHistory();
  elements.historyDialog.showModal();
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.closeDialog)?.close();
  });
});
document.getElementById("new-project-button").addEventListener("click", createNewProject);
elements.projectSearch.addEventListener("input", renderProjectList);
elements.projectFilter.addEventListener("change", renderProjectList);
elements.projectList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-project-action]");
  const row = button?.closest("[data-project-id]");
  if (button && row) handleProjectAction(row.dataset.projectId, button.dataset.projectAction);
});
document.getElementById("manual-snapshot-button").addEventListener("click", () => {
  saveSnapshot("手动保存");
  showToast("当前项目版本已保存");
});
elements.historyList.addEventListener("click", (event) => {
  const button = event.target.closest('[data-history-action="restore"]');
  const row = button?.closest("[data-snapshot-id]");
  if (!button || !row) return;
  if (!window.confirm("恢复后将替换当前板件与设置，是否继续？")) return;
  saveSnapshot("恢复历史版本前");
  state = hydrateProject(restoreSnapshot(state, row.dataset.snapshotId));
  state = upsertProject(workspace, state);
  persistWorkspace(workspace);
  selectedPartIds.clear();
  renderAll();
  elements.historyDialog.close();
  showToast("历史版本已恢复");
});
document.getElementById("export-workspace-button").addEventListener("click", exportAllData);
document.getElementById("import-workspace-button").addEventListener("click", () => {
  elements.workspaceFile.click();
});
elements.workspaceFile.addEventListener("change", () => {
  if (elements.workspaceFile.files?.[0]) importAllData(elements.workspaceFile.files[0]);
});
document.getElementById("save-price-book-button").addEventListener("click", () => {
  const values = {};
  document.querySelectorAll("[data-price-book]").forEach((input) => {
    values[input.dataset.priceBook] = parseNumericValue(input.value, 0);
  });
  workspace.priceBook = normalizePriceBook({
    ...workspace.priceBook,
    ...values,
  });
  persistWorkspace(workspace);
  elements.priceBookDialog.close();
  if (lastResult) {
    renderMaterialPrices(lastResult);
    updateQuotation();
  }
  showToast("默认价格已保存");
});
elements.materialPriceList.addEventListener("input", (event) => {
  const input = event.target.closest("[data-price-field]");
  const row = input?.closest("[data-material-price]");
  if (!input || !row) return;
  const material = row.dataset.materialPrice;
  const current = state.pricing?.materialPrices?.[material] || {};
  state.pricing = {
    ...state.pricing,
    materialPrices: {
      ...(state.pricing?.materialPrices || {}),
      [material]: {
        ...current,
        [input.dataset.priceField]: Math.max(0, parseNumericValue(input.value, 0)),
      },
    },
  };
  const price = state.pricing.materialPrices[material];
  const sheetCount = lastResult?.materialSummaries?.find(
    (item) => item.material === material,
  )?.sheetCount || 0;
  row.querySelector("b").textContent = money(sheetCount * Number(price.sale || 0));
  updateQuotation();
});
[elements.quoteDiscount, elements.quoteNote].forEach((input) => {
  input.addEventListener("input", updateQuotation);
});
elements.leftoverOwnership.addEventListener("change", updateQuotation);
document.getElementById("save-quote-button").addEventListener("click", saveQuoteVersion);
document.getElementById("customer-quote-button").addEventListener("click", () => {
  if (!requireCurrentResult("当前排版已过期，重新计算后才能生成报价单")) return;
  if (!lastQuotation) return;
  openPrintDocument(createCustomerQuoteDocument());
});
document.getElementById("production-order-button").addEventListener("click", () => {
  if (!requireCurrentResult("当前排版已过期，重新计算后才能生成生产单")) return;
  openPrintDocument(createPrintDocument(lastResult));
});

renderAll();
