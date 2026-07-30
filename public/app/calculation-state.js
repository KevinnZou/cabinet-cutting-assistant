function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePart(part) {
  return {
    id: String(part.id || ""),
    name: String(part.name || "").trim(),
    material: String(part.material || "").trim(),
    length: Number(part.length) || 0,
    width: Number(part.width) || 0,
    quantity: Number(part.quantity) || 0,
    grainLocked: Boolean(part.grainLocked),
    edgeLong: Number(part.edgeLong) || 0,
    edgeShort: Number(part.edgeShort) || 0,
  };
}

export function canonicalCalculationInput(project) {
  return {
    parts: (project.parts || []).map(normalizePart),
    settings: clone(project.settings || {}),
    materialRules: clone(project.materialRules || {}),
  };
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function calculationSignature(projectOrInput) {
  const input = Array.isArray(projectOrInput?.parts) &&
    Object.hasOwn(projectOrInput || {}, "materialRules") &&
    Object.hasOwn(projectOrInput || {}, "settings")
    ? canonicalCalculationInput(projectOrInput)
    : projectOrInput;
  return `calc-v1-${hashText(JSON.stringify(input || {}))}`;
}

export function createCalculationBaseline(project, result) {
  const input = canonicalCalculationInput(project);
  return {
    signature: calculationSignature(input),
    calculatedAt: new Date().toISOString(),
    input,
    resultSummary: {
      sheetCount: Number(result?.totals?.sheetCount) || 0,
      partCount: Number(result?.totals?.partCount) || 0,
      edgeBandOrderMeters: Number(result?.totals?.edgeBandOrderMeters) || 0,
      materialCount: Number(result?.totals?.materialCount) || 0,
      integrityOk: Boolean(result?.totals?.integrityOk),
    },
  };
}

export function isCalculationCurrent(project, baseline = project?.calculationBaseline) {
  return Boolean(baseline?.signature) &&
    baseline.signature === calculationSignature(project);
}

function partTotal(parts) {
  return (parts || []).reduce(
    (sum, part) => sum + Math.max(0, Number(part.quantity) || 0),
    0,
  );
}

export function diffCalculationInputs(previousInput, projectOrInput) {
  const currentInput = projectOrInput?.materialRules && projectOrInput?.settings
    ? canonicalCalculationInput(projectOrInput)
    : projectOrInput || { parts: [], settings: {}, materialRules: {} };
  const previous = previousInput || { parts: [], settings: {}, materialRules: {} };
  const previousById = new Map((previous.parts || []).map((part) => [part.id, part]));
  const currentById = new Map((currentInput.parts || []).map((part) => [part.id, part]));
  let addedLines = 0;
  let removedLines = 0;
  let changedLines = 0;

  for (const [id, part] of currentById) {
    if (!previousById.has(id)) addedLines += 1;
    else if (JSON.stringify(part) !== JSON.stringify(previousById.get(id))) changedLines += 1;
  }
  for (const id of previousById.keys()) {
    if (!currentById.has(id)) removedLines += 1;
  }

  const quantityDelta = partTotal(currentInput.parts) - partTotal(previous.parts);
  const settingsChanged =
    JSON.stringify(previous.settings || {}) !== JSON.stringify(currentInput.settings || {});
  const materialRulesChanged =
    JSON.stringify(previous.materialRules || {}) !== JSON.stringify(currentInput.materialRules || {});
  const labels = [];
  if (quantityDelta) labels.push(`数量 ${quantityDelta > 0 ? "+" : ""}${quantityDelta} 片`);
  if (addedLines) labels.push(`新增 ${addedLines} 项`);
  if (removedLines) labels.push(`删除 ${removedLines} 项`);
  if (changedLines) labels.push(`修改 ${changedLines} 项`);
  if (settingsChanged) labels.push("加工规则已变更");
  if (materialRulesChanged) labels.push("余料规则已变更");

  return {
    quantityDelta,
    addedLines,
    removedLines,
    changedLines,
    settingsChanged,
    materialRulesChanged,
    labels,
    hasChanges: labels.length > 0,
  };
}

export function createProductionVersion(project, result, baseline) {
  const existing = project.productionVersions || [];
  return clone({
    id: globalThis.crypto?.randomUUID?.() || `production-${Date.now()}`,
    number: `P${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(existing.length + 1).padStart(3, "0")}`,
    lockedAt: new Date().toISOString(),
    signature: baseline.signature,
    projectName: project.projectName,
    customer: project.customer,
    deliveryDate: project.deliveryDate,
    input: baseline.input,
    resultSummary: baseline.resultSummary,
    result,
  });
}
