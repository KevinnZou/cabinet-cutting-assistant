export const WORKSPACE_STORAGE_KEY = "cabinet-cutting-assistant:workspace:v3";
export const LEGACY_STORAGE_KEY = "cabinet-cutting-assistant:project:v1";
export const MAX_PROJECT_SNAPSHOTS = 20;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = "item") {
  return globalThis.crypto?.randomUUID?.() ||
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function normalizeOpenProjectIds(workspace) {
  const availableIds = new Set(
    (workspace.projects || [])
      .filter((project) => !project.deletedAt)
      .map((project) => project.id),
  );
  const activeId = availableIds.has(workspace.activeProjectId)
    ? workspace.activeProjectId
    : [...availableIds][0] || "";
  const openIds = [
    activeId,
    ...(Array.isArray(workspace.openProjectIds) ? workspace.openProjectIds : []),
  ].filter((id, index, ids) => id && availableIds.has(id) && ids.indexOf(id) === index);
  return openIds.length ? openIds : activeId ? [activeId] : [];
}

export function createProjectRecord(project, overrides = {}) {
  const timestamp = now();
  return {
    ...clone(project),
    id: overrides.id || project.id || makeId("project"),
    version: 3,
    projectName: String(overrides.projectName || project.projectName || "新建柜体项目"),
    customer: {
      name: "",
      phone: "",
      address: "",
      ...clone(project.customer || {}),
      ...clone(overrides.customer || {}),
    },
    status: overrides.status || project.status || "draft",
    deliveryDate: overrides.deliveryDate ?? project.deliveryDate ?? "",
    projectNotes: overrides.projectNotes ?? project.projectNotes ?? "",
    createdAt: overrides.createdAt || project.createdAt || timestamp,
    updatedAt: overrides.updatedAt || project.updatedAt || timestamp,
    deletedAt: overrides.deletedAt ?? project.deletedAt ?? null,
    snapshots: clone(overrides.snapshots || project.snapshots || []),
    quoteVersions: clone(overrides.quoteVersions || project.quoteVersions || []),
    productionVersions: clone(
      overrides.productionVersions || project.productionVersions || [],
    ),
    currentProductionLockId:
      overrides.currentProductionLockId ?? project.currentProductionLockId ?? null,
    calculationBaseline: clone(
      overrides.calculationBaseline ?? project.calculationBaseline ?? null,
    ),
    calculationState: clone(
      overrides.calculationState || project.calculationState || {
        status: "not-calculated",
      },
    ),
    pricing: clone(overrides.pricing || project.pricing || {}),
  };
}

export function createWorkspace(initialProject) {
  const project = createProjectRecord(initialProject);
  return {
    version: 3,
    activeProjectId: project.id,
    openProjectIds: [project.id],
    projects: [project],
    priceBook: {
      version: 1,
      materialPrices: {},
      edgeTapeCostPerMeter: 0.8,
      edgeTapeSalePerMeter: 1.2,
      cuttingCostPerSheet: 10,
      cuttingSalePerSheet: 15,
      edgeProcessCostPerMeter: 1.5,
      edgeProcessSalePerMeter: 2.5,
      deliveryCost: 0,
      deliverySale: 0,
      otherCost: 0,
      otherSale: 0,
      taxRate: 0,
    },
    updatedAt: now(),
  };
}

export function loadWorkspace(initialProject) {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 3 && Array.isArray(parsed.projects)) {
        parsed.projects = parsed.projects.map((project) =>
          createProjectRecord(project),
        );
        if (!parsed.projects.some((project) => project.id === parsed.activeProjectId)) {
          parsed.activeProjectId = parsed.projects.find((project) => !project.deletedAt)?.id || "";
        }
        parsed.openProjectIds = normalizeOpenProjectIds(parsed);
        return parsed;
      }
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy && Array.isArray(legacy.parts)) {
        const workspace = createWorkspace({ ...initialProject, ...legacy });
        persistWorkspace(workspace);
        return workspace;
      }
    }
  } catch {
    // Fall through to a clean workspace.
  }
  return createWorkspace(initialProject);
}

export function persistWorkspace(workspace) {
  workspace.updatedAt = now();
  workspace.openProjectIds = normalizeOpenProjectIds(workspace);
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

export function getActiveProject(workspace) {
  return workspace.projects.find((project) => project.id === workspace.activeProjectId) || null;
}

export function upsertProject(workspace, project) {
  const next = createProjectRecord({ ...project, updatedAt: now() });
  const index = workspace.projects.findIndex((item) => item.id === next.id);
  if (index >= 0) workspace.projects[index] = next;
  else workspace.projects.unshift(next);
  workspace.activeProjectId = next.id;
  return next;
}

export function createSnapshot(project, reason, snapshotState = project) {
  const snapshot = {
    id: makeId("snapshot"),
    reason: String(reason || "手动保存"),
    createdAt: now(),
    data: clone({
      projectName: snapshotState.projectName,
      customer: snapshotState.customer,
      status: snapshotState.status,
      deliveryDate: snapshotState.deliveryDate,
      projectNotes: snapshotState.projectNotes,
      settings: snapshotState.settings,
      materialRules: snapshotState.materialRules,
      parts: snapshotState.parts,
      pricing: snapshotState.pricing,
      calculationBaseline: snapshotState.calculationBaseline,
      calculationState: snapshotState.calculationState,
      productionVersions: snapshotState.productionVersions,
      currentProductionLockId: snapshotState.currentProductionLockId,
    }),
  };
  project.snapshots = [snapshot, ...(project.snapshots || [])].slice(
    0,
    MAX_PROJECT_SNAPSHOTS,
  );
  return snapshot;
}

export function restoreSnapshot(project, snapshotId) {
  const snapshot = (project.snapshots || []).find((item) => item.id === snapshotId);
  if (!snapshot) return project;
  return createProjectRecord({
    ...project,
    ...clone(snapshot.data),
    snapshots: project.snapshots,
    quoteVersions: project.quoteVersions,
    updatedAt: now(),
  });
}

export function duplicateProject(workspace, projectId) {
  const source = workspace.projects.find((project) => project.id === projectId);
  if (!source) return null;
  const copy = createProjectRecord(source, {
    id: makeId("project"),
    projectName: `${source.projectName} - 副本`,
    status: "draft",
    createdAt: now(),
    updatedAt: now(),
    deletedAt: null,
    snapshots: [],
    quoteVersions: [],
  });
  workspace.projects.unshift(copy);
  workspace.activeProjectId = copy.id;
  workspace.openProjectIds = [copy.id, ...normalizeOpenProjectIds(workspace)];
  return copy;
}

export function exportWorkspace(workspace) {
  return JSON.stringify(
    {
      format: "cabinet-cutting-assistant-workspace",
      exportedAt: now(),
      workspace,
    },
    null,
    2,
  );
}

export function importWorkspace(content) {
  const parsed = typeof content === "string" ? JSON.parse(content) : content;
  const workspace = parsed?.workspace || parsed;
  if (!workspace || !Array.isArray(workspace.projects)) {
    throw new Error("invalid workspace");
  }
  return {
    ...workspace,
    version: 3,
    projects: workspace.projects.map((project) => createProjectRecord(project)),
    openProjectIds: normalizeOpenProjectIds(workspace),
  };
}

export function formatProjectStatus(status) {
  return {
    draft: "草稿",
    review: "待复核",
    calculated: "已排版",
    quoted: "已报价",
    production: "待生产",
    completed: "已完成",
    archived: "已归档",
  }[status] || "草稿";
}
