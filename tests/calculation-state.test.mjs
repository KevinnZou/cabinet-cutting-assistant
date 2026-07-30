import assert from "node:assert/strict";
import test from "node:test";
import {
  calculationSignature,
  createCalculationBaseline,
  createProductionVersion,
  diffCalculationInputs,
  isCalculationCurrent,
} from "../public/app/calculation-state.js";

function projectFixture() {
  return {
    projectName: "皓月白衣柜",
    customer: { name: "张先生" },
    deliveryDate: "2026-08-10",
    settings: { boardWidth: 2440, boardHeight: 1220, kerf: 3 },
    materialRules: {
      皓月白: { leftoverEdgeMode: "1/0", minLeftoverWidth: 80 },
    },
    parts: [
      {
        id: "part-a",
        name: "侧板",
        material: "皓月白",
        length: 2440,
        width: 460,
        quantity: 14,
        grainLocked: true,
        edgeLong: 1,
        edgeShort: 0,
      },
    ],
    productionVersions: [],
  };
}

const resultFixture = {
  totals: {
    sheetCount: 6,
    partCount: 14,
    placedPartCount: 14,
    edgeBandOrderMeters: 36,
    materialCount: 1,
    integrityOk: true,
  },
  parts: [],
  sheets: [],
};

test("清单和加工规则未变化时计算签名保持有效", () => {
  const project = projectFixture();
  const baseline = createCalculationBaseline(project, resultFixture);

  assert.equal(baseline.signature, calculationSignature(project));
  assert.equal(isCalculationCurrent(project, baseline), true);
  assert.equal(baseline.resultSummary.sheetCount, 6);
});

test("修改数量、规格或余料规则会让旧结果失效并生成差异摘要", () => {
  const project = projectFixture();
  const baseline = createCalculationBaseline(project, resultFixture);
  project.parts[0].quantity = 17;
  project.parts.push({
    id: "part-b",
    name: "层板",
    material: "皓月白",
    length: 760,
    width: 520,
    quantity: 2,
    grainLocked: false,
    edgeLong: 1,
    edgeShort: 0,
  });
  project.materialRules["皓月白"].minLeftoverWidth = 100;
  const diff = diffCalculationInputs(baseline.input, project);

  assert.equal(isCalculationCurrent(project, baseline), false);
  assert.equal(diff.quantityDelta, 5);
  assert.equal(diff.addedLines, 1);
  assert.equal(diff.changedLines, 1);
  assert.equal(diff.materialRulesChanged, true);
  assert.ok(diff.labels.includes("数量 +5 片"));
  assert.ok(diff.labels.includes("余料规则已变更"));
});

test("锁定生产版本会保存独立快照而不被后续修改覆盖", () => {
  const project = projectFixture();
  const baseline = createCalculationBaseline(project, resultFixture);
  const version = createProductionVersion(project, resultFixture, baseline);

  project.parts[0].quantity = 99;
  resultFixture.totals.sheetCount = 99;
  assert.match(version.number, /^P\d{8}-001$/);
  assert.equal(version.input.parts[0].quantity, 14);
  assert.equal(version.result.totals.sheetCount, 6);
});
