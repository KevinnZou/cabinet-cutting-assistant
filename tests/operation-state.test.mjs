import assert from "node:assert/strict";
import test from "node:test";

import { createOperationManager } from "../public/app/operation-state.js";

test("切换项目会取消旧任务，迟到的 OCR 和计算结果不能再写入当前项目", () => {
  const operations = createOperationManager();
  const ocr = operations.start("ocr", "project-a");
  const calculation = operations.start("calculation", "project-a");

  operations.cancelAll();
  const nextOcr = operations.start("ocr", "project-b");

  assert.equal(ocr.controller.signal.aborted, true);
  assert.equal(calculation.controller.signal.aborted, true);
  assert.equal(operations.isCurrent("ocr", ocr, "project-b"), false);
  assert.equal(operations.isCurrent("ocr", nextOcr, "project-b"), true);
  assert.equal(operations.finish("ocr", ocr), false);
  assert.equal(operations.finish("ocr", nextOcr), true);
});

test("同一项目重新发起任务也会废弃上一次结果", () => {
  const operations = createOperationManager();
  const first = operations.start("calculation", "project-a");
  const second = operations.start("calculation", "project-a");

  assert.equal(first.controller.signal.aborted, true);
  assert.equal(operations.isCurrent("calculation", first, "project-a"), false);
  assert.equal(operations.isCurrent("calculation", second, "project-a"), true);
});
