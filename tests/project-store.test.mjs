import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PROJECT_SNAPSHOTS,
  createProjectRecord,
  createSnapshot,
  createWorkspace,
  duplicateProject,
  exportWorkspace,
  importWorkspace,
  restoreSnapshot,
} from "../public/app/project-store.js";

function fixture(name = "项目A") {
  return {
    projectName: name,
    customer: { name: "张先生", phone: "13800000000" },
    settings: { boardWidth: 2440, boardHeight: 1220 },
    materialRules: {},
    parts: [{ id: "p1", material: "皓月白", length: 2440, width: 460, quantity: 14 }],
    pricing: { discount: 20, leftoverOwnership: "customer" },
  };
}

test("项目工作区支持复制并保持原项目数据隔离", () => {
  const workspace = createWorkspace(fixture());
  const source = workspace.projects[0];
  const copy = duplicateProject(workspace, source.id);

  assert.ok(copy);
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.projectName, "项目A - 副本");
  assert.equal(copy.status, "draft");
  assert.equal(workspace.openProjectIds[0], copy.id);
  copy.parts[0].quantity = 99;
  assert.equal(source.parts[0].quantity, 14);
});

test("历史版本最多保留20个并可恢复板件和报价设置", () => {
  const project = createProjectRecord(fixture());
  for (let index = 0; index < MAX_PROJECT_SNAPSHOTS + 5; index += 1) {
    project.parts[0].quantity = index + 1;
    createSnapshot(project, `版本${index + 1}`);
  }

  assert.equal(project.snapshots.length, MAX_PROJECT_SNAPSHOTS);
  const target = project.snapshots.at(-1);
  project.parts[0].quantity = 999;
  const restored = restoreSnapshot(project, target.id);
  assert.equal(restored.parts[0].quantity, target.data.parts[0].quantity);
  assert.equal(restored.snapshots.length, MAX_PROJECT_SNAPSHOTS);
});

test("整库备份恢复项目、价格档案和当前项目", () => {
  const workspace = createWorkspace(fixture());
  workspace.priceBook.materialPrices["皓月白"] = { cost: 120, sale: 160 };
  const restored = importWorkspace(exportWorkspace(workspace));

  assert.equal(restored.version, 3);
  assert.equal(restored.activeProjectId, workspace.activeProjectId);
  assert.deepEqual(restored.openProjectIds, workspace.openProjectIds);
  assert.equal(restored.projects[0].customer.name, "张先生");
  assert.deepEqual(restored.priceBook.materialPrices["皓月白"], { cost: 120, sale: 160 });
});

test("工作区记录已打开项目标签并从旧数据自动补齐", () => {
  const workspace = createWorkspace(fixture());
  assert.deepEqual(workspace.openProjectIds, [workspace.activeProjectId]);

  const restored = importWorkspace({
    version: 3,
    activeProjectId: workspace.activeProjectId,
    projects: workspace.projects,
  });

  assert.deepEqual(restored.openProjectIds, [workspace.activeProjectId]);
});
