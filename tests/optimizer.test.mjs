import test from "node:test";
import assert from "node:assert/strict";

import {
  createSampleParts,
  optimizeCutting,
} from "../public/app/optimizer.js";
import { parsePartsText } from "../public/app/parser.js";

test("示例板件排入一张标准板并计算 8 米封边", () => {
  const result = optimizeCutting(createSampleParts(), {
    boardWidth: 1220,
    boardHeight: 2440,
    kerf: 3,
    edgeLoss: 3,
  });

  assert.equal(result.totals.sheetCount, 1);
  assert.equal(result.totals.placedPartCount, 3);
  assert.equal(result.totals.edgeBandOrderMeters, 8);
  assert.ok(result.totals.utilization > 99 && result.totals.utilization < 100);
  assert.equal(result.oversized.length, 0);
});

test("无纹理板件可以旋转后排入板材", () => {
  const part = {
    id: "rotate",
    name: "可旋转板件",
    material: "白色",
    length: 1100,
    width: 2000,
    quantity: 1,
    grainLocked: false,
  };
  const result = optimizeCutting([part]);

  assert.equal(result.totals.sheetCount, 1);
  assert.equal(result.sheets[0].placements[0].rotated, true);
});

test("锁定纹理后无法旋转的超宽板件会给出异常", () => {
  const part = {
    id: "grain",
    name: "纹理锁定板件",
    material: "木纹",
    length: 1100,
    width: 2000,
    quantity: 1,
    grainLocked: true,
  };
  const result = optimizeCutting([part]);

  assert.equal(result.totals.sheetCount, 0);
  assert.equal(result.oversized.length, 1);
});

test("不同颜色板件分开计算板材", () => {
  const result = optimizeCutting([
    {
      id: "one",
      name: "A",
      material: "白色",
      length: 500,
      width: 500,
      quantity: 1,
    },
    {
      id: "two",
      name: "B",
      material: "灰色",
      length: 500,
      width: 500,
      quantity: 1,
    },
  ]);

  assert.equal(result.totals.materialCount, 2);
  assert.equal(result.totals.sheetCount, 2);
  assert.equal(result.totals.integrityOk, true);
  assert.equal(result.totals.unplacedPartCount, 0);
});

test("多颜色条子料按颜色分板并分别计算封边领料", () => {
  const result = optimizeCutting(
    [
      { id: "white-460", name: "板件", material: "皓月白", length: 2440, width: 460, quantity: 14, edgeLong: 1, edgeShort: 0, grainLocked: true },
      { id: "white-400", name: "板件", material: "皓月白", length: 2440, width: 400, quantity: 20, edgeLong: 1, edgeShort: 0, grainLocked: true },
      { id: "white-60", name: "板件", material: "皓月白", length: 2440, width: 60, quantity: 3, edgeLong: 1, edgeShort: 0, grainLocked: true },
      { id: "walnut-600", name: "板件", material: "晓风胡桃", length: 2440, width: 600, quantity: 46, edgeLong: 1, edgeShort: 0, grainLocked: true },
      { id: "walnut-500", name: "板件", material: "晓风胡桃", length: 2440, width: 500, quantity: 8, edgeLong: 1, edgeShort: 0, grainLocked: true },
      { id: "walnut-400", name: "板件", material: "晓风胡桃", length: 2440, width: 400, quantity: 28, edgeLong: 1, edgeShort: 0, grainLocked: true },
      { id: "walnut-60", name: "板件", material: "晓风胡桃", length: 2440, width: 60, quantity: 12, edgeLong: 1, edgeShort: 0, grainLocked: true },
    ],
    { boardWidth: 1220, boardHeight: 2440, kerf: 3, edgeLoss: 3 },
  );

  assert.equal(result.totals.partCount, 131);
  assert.equal(result.totals.placedPartCount, 131);
  assert.equal(result.totals.integrityOk, true);
  assert.equal(result.oversized.length, 0);
  assert.equal(result.totals.sheetCount, 51);
  assert.equal(result.totals.edgeBandOrderMeters, 330);
  assert.deepEqual(
    result.materialSummaries.map((item) => [item.material, item.sheetCount, item.partCount, item.edgeBandOrderMeters]),
    [
      ["皓月白", 14, 37, 93],
      ["晓风胡桃", 37, 94, 237],
    ],
  );
});

test("所有排版件都在板内且互不重叠", () => {
  const result = optimizeCutting(
    [
      { id: "a", name: "侧板", material: "卡其灰", length: 2440, width: 550, quantity: 2, edgeLong: 1, edgeShort: 0, grainLocked: true },
      { id: "b", name: "层板", material: "卡其灰", length: 760, width: 520, quantity: 4, edgeLong: 2, edgeShort: 2, grainLocked: false },
      { id: "c", name: "条子", material: "卡其灰", length: 2440, width: 110, quantity: 8, edgeLong: 2, edgeShort: 0, grainLocked: true },
    ],
    { boardWidth: 1220, boardHeight: 2440, kerf: 3, trim: 0 },
  );

  assert.equal(result.totals.integrityOk, true);

  for (const sheet of result.sheets) {
    for (const placement of sheet.placements) {
      assert.ok(placement.x >= 0);
      assert.ok(placement.y >= 0);
      assert.ok(placement.x + placement.placedWidth <= result.settings.boardWidth);
      assert.ok(placement.y + placement.placedHeight <= result.settings.boardHeight);
    }

    for (let firstIndex = 0; firstIndex < sheet.placements.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < sheet.placements.length; secondIndex += 1) {
        const first = sheet.placements[firstIndex];
        const second = sheet.placements[secondIndex];
        const separated =
          second.x >= first.x + first.placedWidth ||
          second.x + second.placedWidth <= first.x ||
          second.y >= first.y + first.placedHeight ||
          second.y + second.placedHeight <= first.y;
        assert.equal(separated, true, `${first.name} overlaps ${second.name}`);
      }
    }
  }
});

test("真实粘贴清单从解析到排版保持数量和颜色汇总一致", () => {
  const parsed = parsePartsText(`
皓月白
460X2440=14
400X2440=20
60X2440=3

晓风胡桃
600x2440=46
500X2440=8
400X2440=28
60X2440=12
`);
  const result = optimizeCutting(parsed.parts, {
    boardWidth: 1220,
    boardHeight: 2440,
    kerf: 3,
    edgeLoss: 3,
  });

  assert.equal(parsed.stats.pieceCount, 131);
  assert.equal(result.totals.partCount, parsed.stats.pieceCount);
  assert.equal(result.totals.placedPartCount, parsed.stats.pieceCount);
  assert.equal(result.totals.integrityOk, true);
  assert.deepEqual(
    result.materialSummaries.map((item) => [item.material, item.sheetCount, item.partCount, item.edgeBandOrderMeters]),
    [
      ["皓月白", 14, 37, 93],
      ["晓风胡桃", 37, 94, 237],
    ],
  );
});

test("多策略排版返回生产完整性审计结果", () => {
  const result = optimizeCutting([
    { id: "a", name: "A", material: "白色", length: 920, width: 510, quantity: 7 },
    { id: "b", name: "B", material: "白色", length: 760, width: 330, quantity: 9 },
    { id: "c", name: "C", material: "白色", length: 450, width: 210, quantity: 13 },
  ]);

  assert.equal(result.totals.strategyCount, 4);
  assert.equal(result.totals.integrityOk, true);
  assert.deepEqual(result.totals.auditIssues, []);
  assert.equal(result.totals.placedPartCount, 29);
});

test("随机规格回归：数量、边界和重叠保持一致", () => {
  let seed = 20260729;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let caseIndex = 0; caseIndex < 40; caseIndex += 1) {
    const parts = Array.from({ length: 4 + Math.floor(random() * 6) }, (_, index) => ({
      id: `${caseIndex}-${index}`,
      name: `板件${index + 1}`,
      material: index % 3 === 0 ? "暖白" : "胡桃",
      length: 180 + Math.floor(random() * 1900),
      width: 80 + Math.floor(random() * 900),
      quantity: 1 + Math.floor(random() * 5),
      grainLocked: random() > 0.55,
      edgeLong: Math.floor(random() * 3),
      edgeShort: Math.floor(random() * 3),
    }));
    const result = optimizeCutting(parts, { kerf: 3, trim: 5 });

    assert.equal(result.totals.integrityOk, true, `case ${caseIndex}`);
    assert.equal(
      result.totals.placedPartCount + result.oversized.length,
      result.totals.partCount,
      `case ${caseIndex}`,
    );
    assert.deepEqual(result.totals.auditIssues, [], `case ${caseIndex}`);
  }
});

test("千片级清单不会少算", () => {
  const result = optimizeCutting([
    {
      id: "bulk",
      name: "批量层板",
      material: "暖白",
      length: 600,
      width: 400,
      quantity: 1200,
      grainLocked: false,
      edgeLong: 1,
      edgeShort: 0,
    },
  ]);

  assert.equal(result.totals.partCount, 1200);
  assert.equal(result.totals.placedPartCount, 1200);
  assert.equal(result.totals.integrityOk, true);
});

test("余料按锯缝后的真实矩形计算并计入封边领料", () => {
  const result = optimizeCutting(
    [{
      id: "side",
      name: "侧板",
      material: "卡其灰",
      length: 2440,
      width: 550,
      quantity: 2,
      grainLocked: true,
      edgeLong: 0,
      edgeShort: 0,
    }],
    {
      boardWidth: 1220,
      boardHeight: 2440,
      kerf: 3,
      edgeLoss: 0,
      roundEdgeBand: false,
      materialRules: {
        卡其灰: { leftoverEdgeMode: "1/0", minLeftoverWidth: 50 },
      },
    },
  );

  assert.equal(result.sheets[0].leftovers.length, 1);
  assert.deepEqual(
    [result.sheets[0].leftovers[0].length, result.sheets[0].leftovers[0].width],
    [2440, 114],
  );
  assert.equal(result.totals.partEdgeBandRawMm, 0);
  assert.equal(result.totals.leftoverEdgeBandRawMm, 2440);
  assert.equal(result.totals.edgeBandOrderMeters, 2.44);
});

test("余料最小短边会过滤不可回收碎片", () => {
  const result = optimizeCutting(
    [{
      id: "side",
      name: "侧板",
      material: "卡其灰",
      length: 2440,
      width: 550,
      quantity: 2,
      grainLocked: true,
    }],
    {
      materialRules: {
        卡其灰: { leftoverEdgeMode: "2/0", minLeftoverWidth: 150 },
      },
    },
  );

  assert.equal(result.totals.leftoverCount, 0);
  assert.equal(result.totals.leftoverEdgeBandRawMm, 0);
});

test("不同颜色的余料封边规则分别汇总", () => {
  const result = optimizeCutting(
    [
      { id: "white", name: "侧板", material: "暖白", length: 2440, width: 550, quantity: 2, grainLocked: true },
      { id: "walnut", name: "侧板", material: "胡桃", length: 2440, width: 550, quantity: 2, grainLocked: true },
    ],
    {
      edgeLoss: 0,
      roundEdgeBand: false,
      materialRules: {
        暖白: { leftoverEdgeMode: "1/0", minLeftoverWidth: 50 },
        胡桃: { leftoverEdgeMode: "2/0", minLeftoverWidth: 50 },
      },
    },
  );

  assert.deepEqual(
    result.materialSummaries.map((item) => [
      item.material,
      item.leftoverCount,
      item.leftoverEdgeBandRawMm,
    ]),
    [
      ["暖白", 1, 2440],
      ["胡桃", 1, 4880],
    ],
  );
  assert.equal(result.totals.leftoverEdgeBandRawMm, 7320);
});
