export const DEFAULT_SETTINGS = Object.freeze({
  boardWidth: 1220,
  boardHeight: 2440,
  kerf: 3,
  trim: 0,
  edgeLoss: 3,
  allowRotation: true,
  roundEdgeBand: true,
  optimizationMode: "balanced",
  materialRules: {},
});

const MIN_BOARD_SIZE = 100;
const MAX_BOARD_SIZE = 10000;

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const EDGE_MODE_PATTERN = /^(?:[012])\/(?:[012])$/;
const OPTIMIZATION_MODES = new Set(["balanced", "save"]);

export function normalizeMaterialRules(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  return Object.fromEntries(
    Object.entries(input).map(([material, rawRule]) => {
      const rule = rawRule && typeof rawRule === "object" ? rawRule : {};
      return [
        String(material),
        {
          leftoverEdgeMode: EDGE_MODE_PATTERN.test(String(rule.leftoverEdgeMode || ""))
            ? String(rule.leftoverEdgeMode)
            : "0/0",
          minLeftoverWidth: clamp(
            Math.round(toNumber(rule.minLeftoverWidth, 50)),
            0,
            1000,
          ),
        },
      ];
    }),
  );
}

export function normalizeSettings(input = {}) {
  const boardWidth = clamp(
    toNumber(input.boardWidth, DEFAULT_SETTINGS.boardWidth),
    MIN_BOARD_SIZE,
    MAX_BOARD_SIZE,
  );
  const boardHeight = clamp(
    toNumber(input.boardHeight, DEFAULT_SETTINGS.boardHeight),
    MIN_BOARD_SIZE,
    MAX_BOARD_SIZE,
  );

  return {
    boardWidth,
    boardHeight,
    kerf: clamp(toNumber(input.kerf, DEFAULT_SETTINGS.kerf), 0, 30),
    trim: clamp(
      toNumber(input.trim, DEFAULT_SETTINGS.trim),
      0,
      Math.max(0, Math.min(boardWidth, boardHeight) / 2 - 1),
    ),
    edgeLoss: clamp(
      toNumber(input.edgeLoss, DEFAULT_SETTINGS.edgeLoss),
      0,
      100,
    ),
    allowRotation:
      input.allowRotation === undefined
        ? DEFAULT_SETTINGS.allowRotation
        : Boolean(input.allowRotation),
    roundEdgeBand:
      input.roundEdgeBand === undefined
        ? DEFAULT_SETTINGS.roundEdgeBand
        : Boolean(input.roundEdgeBand),
    optimizationMode: OPTIMIZATION_MODES.has(String(input.optimizationMode || ""))
      ? String(input.optimizationMode)
      : DEFAULT_SETTINGS.optimizationMode,
    materialRules: normalizeMaterialRules(input.materialRules),
  };
}

export function normalizePart(input, index = 0) {
  const length = toNumber(input.length, 0);
  const width = toNumber(input.width, 0);
  const quantity = Math.floor(toNumber(input.quantity, 0));

  return {
    id: String(input.id || `part-${index + 1}`),
    name: String(input.name || `板件 ${index + 1}`).trim() || `板件 ${index + 1}`,
    material: String(input.material || "未分类").trim() || "未分类",
    length,
    width,
    quantity,
    grainLocked: Boolean(input.grainLocked),
    edgeLong: clamp(Math.floor(toNumber(input.edgeLong, 0)), 0, 2),
    edgeShort: clamp(Math.floor(toNumber(input.edgeShort, 0)), 0, 2),
  };
}

function rectangleContains(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function rectanglesIntersect(a, b) {
  return !(
    b.x >= a.x + a.width ||
    b.x + b.width <= a.x ||
    b.y >= a.y + a.height ||
    b.y + b.height <= a.y
  );
}

function pruneFreeRectangles(rectangles) {
  return rectangles.filter((rect, index) => {
    if (rect.width <= 0 || rect.height <= 0) return false;
    return !rectangles.some(
      (other, otherIndex) =>
        index !== otherIndex && rectangleContains(other, rect),
    );
  });
}

function splitFreeRectangles(freeRectangles, used) {
  const next = [];

  for (const free of freeRectangles) {
    if (!rectanglesIntersect(free, used)) {
      next.push(free);
      continue;
    }

    const freeRight = free.x + free.width;
    const freeBottom = free.y + free.height;
    const usedRight = used.x + used.width;
    const usedBottom = used.y + used.height;

    if (used.x > free.x) {
      next.push({
        x: free.x,
        y: free.y,
        width: used.x - free.x,
        height: free.height,
      });
    }
    if (usedRight < freeRight) {
      next.push({
        x: usedRight,
        y: free.y,
        width: freeRight - usedRight,
        height: free.height,
      });
    }
    if (used.y > free.y) {
      next.push({
        x: free.x,
        y: free.y,
        width: free.width,
        height: used.y - free.y,
      });
    }
    if (usedBottom < freeBottom) {
      next.push({
        x: free.x,
        y: usedBottom,
        width: free.width,
        height: freeBottom - usedBottom,
      });
    }
  }

  return pruneFreeRectangles(next);
}

function getOrientations(part, settings) {
  const orientations = [
    {
      actualWidth: part.width,
      actualHeight: part.length,
      rotated: false,
    },
  ];

  if (
    settings.allowRotation &&
    !part.grainLocked &&
    part.length !== part.width
  ) {
    orientations.push({
      actualWidth: part.length,
      actualHeight: part.width,
      rotated: true,
    });
  }

  return orientations.map((orientation) => ({
    ...orientation,
    width: orientation.actualWidth + settings.kerf,
    height: orientation.actualHeight + settings.kerf,
  }));
}

function findBestPlacement(sheet, part, settings) {
  let best = null;

  for (const free of sheet.freeRectangles) {
    for (const orientation of getOrientations(part, settings)) {
      if (orientation.width > free.width || orientation.height > free.height) {
        continue;
      }

      const leftoverHorizontal = free.width - orientation.width;
      const leftoverVertical = free.height - orientation.height;
      const candidate = {
        x: free.x,
        y: free.y,
        ...orientation,
        scoreShortSide: Math.min(leftoverHorizontal, leftoverVertical),
        scoreLongSide: Math.max(leftoverHorizontal, leftoverVertical),
        scoreArea: free.width * free.height - orientation.width * orientation.height,
      };

      if (
        !best ||
        candidate.scoreShortSide < best.scoreShortSide ||
        (candidate.scoreShortSide === best.scoreShortSide &&
          candidate.scoreLongSide < best.scoreLongSide) ||
        (candidate.scoreShortSide === best.scoreShortSide &&
          candidate.scoreLongSide === best.scoreLongSide &&
          candidate.scoreArea < best.scoreArea)
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

function createSheet(material, index, settings) {
  const usableWidth = settings.boardWidth - settings.trim * 2;
  const usableHeight = settings.boardHeight - settings.trim * 2;

  return {
    id: `${material}-${index + 1}`,
    material,
    number: index + 1,
    placements: [],
    freeRectangles: [
      {
        x: settings.trim,
        y: settings.trim,
        width: usableWidth + settings.kerf,
        height: usableHeight + settings.kerf,
      },
    ],
  };
}

function commitPlacement(sheet, part, position) {
  const used = {
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
  };

  sheet.placements.push({
    id: part.instanceId,
    sourceId: part.id,
    name: part.name,
    material: part.material,
    length: part.length,
    width: part.width,
    x: position.x,
    y: position.y,
    placedWidth: position.actualWidth,
    placedHeight: position.actualHeight,
    cutWidth: position.width,
    cutHeight: position.height,
    rotated: position.rotated,
    grainLocked: part.grainLocked,
    edgeLong: part.edgeLong,
    edgeShort: part.edgeShort,
  });
  sheet.freeRectangles = splitFreeRectangles(sheet.freeRectangles, used);
}

function subtractRectangle(rectangle, occupied) {
  if (!rectanglesIntersect(rectangle, occupied)) return [rectangle];

  const left = rectangle.x;
  const top = rectangle.y;
  const right = rectangle.x + rectangle.width;
  const bottom = rectangle.y + rectangle.height;
  const occupiedLeft = Math.max(left, occupied.x);
  const occupiedTop = Math.max(top, occupied.y);
  const occupiedRight = Math.min(right, occupied.x + occupied.width);
  const occupiedBottom = Math.min(bottom, occupied.y + occupied.height);
  const pieces = [];

  if (occupiedTop > top) {
    pieces.push({ x: left, y: top, width: rectangle.width, height: occupiedTop - top });
  }
  if (occupiedBottom < bottom) {
    pieces.push({
      x: left,
      y: occupiedBottom,
      width: rectangle.width,
      height: bottom - occupiedBottom,
    });
  }
  if (occupiedLeft > left && occupiedBottom > occupiedTop) {
    pieces.push({
      x: left,
      y: occupiedTop,
      width: occupiedLeft - left,
      height: occupiedBottom - occupiedTop,
    });
  }
  if (occupiedRight < right && occupiedBottom > occupiedTop) {
    pieces.push({
      x: occupiedRight,
      y: occupiedTop,
      width: right - occupiedRight,
      height: occupiedBottom - occupiedTop,
    });
  }

  return pieces.filter((piece) => piece.width > 0 && piece.height > 0);
}

function deriveLeftovers(sheet, settings, rule) {
  const usableRectangle = {
    x: settings.trim,
    y: settings.trim,
    width: settings.boardWidth - settings.trim * 2,
    height: settings.boardHeight - settings.trim * 2,
  };
  let emptyRectangles = [usableRectangle];

  for (const placement of sheet.placements) {
    const occupied = {
      x: placement.x,
      y: placement.y,
      width: Math.min(
        placement.cutWidth,
        usableRectangle.x + usableRectangle.width - placement.x,
      ),
      height: Math.min(
        placement.cutHeight,
        usableRectangle.y + usableRectangle.height - placement.y,
      ),
    };
    emptyRectangles = emptyRectangles.flatMap((rectangle) =>
      subtractRectangle(rectangle, occupied),
    );
  }

  const [edgeLong, edgeShort] = rule.leftoverEdgeMode.split("/").map(Number);
  return emptyRectangles
    .filter(
      (rectangle) =>
        Math.min(rectangle.width, rectangle.height) >= rule.minLeftoverWidth,
    )
    .map((rectangle, index) => {
      const length = Math.max(rectangle.width, rectangle.height);
      const width = Math.min(rectangle.width, rectangle.height);
      return {
        id: `${sheet.id}-leftover-${index + 1}`,
        x: rectangle.x,
        y: rectangle.y,
        placedWidth: rectangle.width,
        placedHeight: rectangle.height,
        length,
        width,
        edgeLong,
        edgeShort,
        edgeMode: rule.leftoverEdgeMode,
        area: rectangle.width * rectangle.height,
        edgeBandRawMm: length * edgeLong + width * edgeShort,
      };
    })
    .sort((a, b) => b.area - a.area);
}

function expandParts(parts) {
  return parts.flatMap((part) =>
    Array.from({ length: part.quantity }, (_, index) => ({
      ...part,
      instanceId: `${part.id}-${index + 1}`,
    })),
  );
}

function isValidPart(part) {
  return part.length > 0 && part.width > 0 && part.quantity > 0;
}

const SORT_STRATEGIES = [
  (a, b) =>
    Math.max(b.length, b.width) - Math.max(a.length, a.width) ||
    b.length * b.width - a.length * a.width,
  (a, b) =>
    b.length * b.width - a.length * a.width ||
    Math.max(b.length, b.width) - Math.max(a.length, a.width),
  (a, b) =>
    Math.min(b.length, b.width) - Math.min(a.length, a.width) ||
    b.length * b.width - a.length * a.width,
  (a, b) =>
    b.length + b.width - (a.length + a.width) ||
    b.length * b.width - a.length * a.width,
];

const SAVE_BOARD_SORT_STRATEGIES = [
  ...SORT_STRATEGIES,
  (a, b) =>
    b.width - a.width ||
    b.length * b.width - a.length * a.width,
  (a, b) =>
    b.length - a.length ||
    b.length * b.width - a.length * a.width,
  (a, b) =>
    Math.abs(b.length - b.width) - Math.abs(a.length - a.width) ||
    b.length * b.width - a.length * a.width,
  (a, b) =>
    a.width - b.width ||
    b.length * b.width - a.length * a.width,
  (a, b) =>
    a.length - b.length ||
    b.length * b.width - a.length * a.width,
  (a, b) =>
    a.length + a.width - (b.length + b.width) ||
    b.length * b.width - a.length * a.width,
];

function getSortStrategies(settings) {
  return settings.optimizationMode === "save"
    ? SAVE_BOARD_SORT_STRATEGIES
    : SORT_STRATEGIES;
}

function canFitEmptySheet(part, settings) {
  return Boolean(findBestPlacement(createSheet(part.material, 0, settings), part, settings));
}

function packMaterialInstances(instances, material, settings, comparator) {
  const sheets = [];
  const sorted = [...instances].sort(comparator);

  for (const part of sorted) {
    let bestSheet = null;
    let bestPosition = null;

    for (const sheet of sheets) {
      const position = findBestPlacement(sheet, part, settings);
      if (
        position &&
        (!bestPosition ||
          position.scoreShortSide < bestPosition.scoreShortSide ||
          (position.scoreShortSide === bestPosition.scoreShortSide &&
            position.scoreLongSide < bestPosition.scoreLongSide) ||
          (position.scoreShortSide === bestPosition.scoreShortSide &&
            position.scoreLongSide === bestPosition.scoreLongSide &&
            position.scoreArea < bestPosition.scoreArea))
      ) {
        bestSheet = sheet;
        bestPosition = position;
      }
    }

    if (!bestPosition) {
      bestSheet = createSheet(material, sheets.length, settings);
      bestPosition = findBestPlacement(bestSheet, part, settings);
      if (!bestPosition) continue;
      sheets.push(bestSheet);
    }

    commitPlacement(bestSheet, part, bestPosition);
  }

  return sheets;
}

function packingTieBreakScore(sheets) {
  if (!sheets.length) return 0;
  const lastSheet = sheets[sheets.length - 1];
  return lastSheet.placements.reduce(
    (sum, placement) => sum + placement.length * placement.width,
    0,
  );
}

function validatePackedSheets(sheets, settings) {
  const issues = [];
  const minX = settings.trim;
  const minY = settings.trim;
  const maxX = settings.boardWidth - settings.trim;
  const maxY = settings.boardHeight - settings.trim;

  for (const sheet of sheets) {
    for (let index = 0; index < sheet.placements.length; index += 1) {
      const placement = sheet.placements[index];
      if (
        placement.x < minX ||
        placement.y < minY ||
        placement.x + placement.placedWidth > maxX ||
        placement.y + placement.placedHeight > maxY
      ) {
        issues.push(`${sheet.material} 第 ${sheet.number} 张存在越界板件：${placement.name}`);
      }

      for (let otherIndex = index + 1; otherIndex < sheet.placements.length; otherIndex += 1) {
        const other = sheet.placements[otherIndex];
        if (
          rectanglesIntersect(
            {
              x: placement.x,
              y: placement.y,
              width: placement.placedWidth,
              height: placement.placedHeight,
            },
            {
              x: other.x,
              y: other.y,
              width: other.placedWidth,
              height: other.placedHeight,
            },
          )
        ) {
          issues.push(`${sheet.material} 第 ${sheet.number} 张存在板件重叠`);
        }
      }
    }

    for (let index = 0; index < (sheet.leftovers || []).length; index += 1) {
      const leftover = sheet.leftovers[index];
      const leftoverRectangle = {
        x: leftover.x,
        y: leftover.y,
        width: leftover.placedWidth,
        height: leftover.placedHeight,
      };
      if (
        leftover.x < minX ||
        leftover.y < minY ||
        leftover.x + leftover.placedWidth > maxX ||
        leftover.y + leftover.placedHeight > maxY
      ) {
        issues.push(`${sheet.material} 第 ${sheet.number} 张存在越界余料`);
      }
      if (
        sheet.placements.some((placement) =>
          rectanglesIntersect(leftoverRectangle, {
            x: placement.x,
            y: placement.y,
            width: placement.placedWidth,
            height: placement.placedHeight,
          }),
        )
      ) {
        issues.push(`${sheet.material} 第 ${sheet.number} 张余料与板件重叠`);
      }
      for (
        let otherIndex = index + 1;
        otherIndex < sheet.leftovers.length;
        otherIndex += 1
      ) {
        const other = sheet.leftovers[otherIndex];
        if (
          rectanglesIntersect(leftoverRectangle, {
            x: other.x,
            y: other.y,
            width: other.placedWidth,
            height: other.placedHeight,
          })
        ) {
          issues.push(`${sheet.material} 第 ${sheet.number} 张余料块重叠`);
        }
      }
    }
  }

  return issues;
}

export function optimizeCutting(rawParts, rawSettings = {}) {
  const settings = normalizeSettings(rawSettings);
  const strategies = getSortStrategies(settings);
  const normalizedParts = rawParts.map(normalizePart);
  const invalidParts = normalizedParts.filter((part) => !isValidPart(part));
  const validParts = normalizedParts.filter(isValidPart);
  const instances = expandParts(validParts);
  const sheetsByMaterial = new Map();
  const oversized = instances.filter((part) => !canFitEmptySheet(part, settings));
  const oversizedIds = new Set(oversized.map((part) => part.instanceId));
  const placeableInstances = instances.filter((part) => !oversizedIds.has(part.instanceId));
  const materialOrder = [...new Set(placeableInstances.map((part) => part.material))];

  for (const material of materialOrder) {
    const materialInstances = placeableInstances.filter((part) => part.material === material);
    let bestSheets = null;

    for (const comparator of strategies) {
      const candidate = packMaterialInstances(materialInstances, material, settings, comparator);
      if (
        !bestSheets ||
        candidate.length < bestSheets.length ||
        (candidate.length === bestSheets.length &&
          packingTieBreakScore(candidate) > packingTieBreakScore(bestSheets))
      ) {
        bestSheets = candidate;
      }
    }

    sheetsByMaterial.set(material, bestSheets || []);
  }

  const sheets = [...sheetsByMaterial.values()].flat();
  const boardArea = settings.boardWidth * settings.boardHeight;
  let usedArea = 0;

  for (const sheet of sheets) {
    sheet.usedArea = sheet.placements.reduce(
      (sum, placement) => sum + placement.length * placement.width,
      0,
    );
    usedArea += sheet.usedArea;
    sheet.utilization = boardArea ? (sheet.usedArea / boardArea) * 100 : 0;
    const leftoverRule = settings.materialRules[sheet.material] || {
      leftoverEdgeMode: "0/0",
      minLeftoverWidth: 50,
    };
    sheet.leftoverRule = leftoverRule;
    sheet.leftovers = deriveLeftovers(sheet, settings, leftoverRule);
    sheet.leftoverArea = sheet.leftovers.reduce((sum, item) => sum + item.area, 0);
    sheet.leftoverEdgeBandRawMm = sheet.leftovers.reduce(
      (sum, item) => sum + item.edgeBandRawMm,
      0,
    );
    delete sheet.freeRectangles;
  }

  const partEdgeBandRawMm = validParts.reduce(
    (sum, part) =>
      sum +
      part.quantity *
        (part.length * part.edgeLong + part.width * part.edgeShort),
    0,
  );
  const leftoverEdgeBandRawMm = sheets.reduce(
    (sum, sheet) => sum + sheet.leftoverEdgeBandRawMm,
    0,
  );
  const edgeBandRawMm = partEdgeBandRawMm + leftoverEdgeBandRawMm;
  const edgeBandWithLossMm = edgeBandRawMm * (1 + settings.edgeLoss / 100);
  const edgeBandMeters = edgeBandWithLossMm / 1000;
  const materialSummaries = [...new Set(validParts.map((part) => part.material))].map((material) => {
    const materialParts = validParts.filter((part) => part.material === material);
    const materialSheets = sheetsByMaterial.get(material) || [];
    const materialUsedArea = materialSheets.reduce((sum, sheet) => sum + sheet.usedArea, 0);
    const materialPartEdgeBandRawMm = materialParts.reduce(
      (sum, part) =>
        sum +
        part.quantity *
          (part.length * part.edgeLong + part.width * part.edgeShort),
      0,
    );
    const materialLeftoverEdgeBandRawMm = materialSheets.reduce(
      (sum, sheet) => sum + sheet.leftoverEdgeBandRawMm,
      0,
    );
    const materialEdgeBandRawMm =
      materialPartEdgeBandRawMm + materialLeftoverEdgeBandRawMm;
    const materialEdgeBandWithLossMm = materialEdgeBandRawMm * (1 + settings.edgeLoss / 100);
    const materialEdgeBandMeters = materialEdgeBandWithLossMm / 1000;
    const materialEdgeBandOrderMeters = settings.roundEdgeBand
      ? Math.ceil(materialEdgeBandMeters)
      : Math.round(materialEdgeBandMeters * 100) / 100;
    const materialTotalBoardArea = materialSheets.length * boardArea;

    return {
      material,
      partTypeCount: materialParts.length,
      partCount: materialParts.reduce((sum, part) => sum + part.quantity, 0),
      sheetCount: materialSheets.length,
      usedArea: materialUsedArea,
      totalBoardArea: materialTotalBoardArea,
      utilization: materialTotalBoardArea ? (materialUsedArea / materialTotalBoardArea) * 100 : 0,
      partEdgeBandRawMm: materialPartEdgeBandRawMm,
      leftoverEdgeBandRawMm: materialLeftoverEdgeBandRawMm,
      edgeBandRawMm: materialEdgeBandRawMm,
      edgeBandWithLossMm: materialEdgeBandWithLossMm,
      edgeBandOrderMeters: materialEdgeBandOrderMeters,
      leftoverCount: materialSheets.reduce(
        (sum, sheet) => sum + sheet.leftovers.length,
        0,
      ),
      leftoverArea: materialSheets.reduce(
        (sum, sheet) => sum + sheet.leftoverArea,
        0,
      ),
      leftoverRule: settings.materialRules[material] || {
        leftoverEdgeMode: "0/0",
        minLeftoverWidth: 50,
      },
    };
  });
  const edgeBandOrderMeters = materialSummaries.length
    ? materialSummaries.reduce((sum, item) => sum + item.edgeBandOrderMeters, 0)
    : settings.roundEdgeBand
      ? Math.ceil(edgeBandMeters)
      : Math.round(edgeBandMeters * 100) / 100;
  const totalBoardArea = sheets.length * boardArea;
  const placedPartCount = sheets.reduce((sum, sheet) => sum + sheet.placements.length, 0);
  const expectedPlacedPartCount = instances.length - oversized.length;
  const auditIssues = validatePackedSheets(sheets, settings);
  if (placedPartCount !== expectedPlacedPartCount) {
    auditIssues.push(`数量不一致：应排 ${expectedPlacedPartCount} 片，实际排入 ${placedPartCount} 片`);
  }

  return {
    settings,
    parts: validParts,
    invalidParts,
    oversized,
    sheets,
    materialSummaries,
    totals: {
      partCount: instances.length,
      placedPartCount,
      unplacedPartCount: Math.max(0, instances.length - placedPartCount - oversized.length),
      sheetCount: sheets.length,
      materialCount: sheetsByMaterial.size,
      usedArea,
      totalBoardArea,
      wasteArea: Math.max(0, totalBoardArea - usedArea),
      utilization: totalBoardArea ? (usedArea / totalBoardArea) * 100 : 0,
      partEdgeBandRawMm,
      leftoverEdgeBandRawMm,
      edgeBandRawMm,
      edgeBandWithLossMm,
      edgeBandOrderMeters,
      integrityOk: auditIssues.length === 0,
      auditIssues,
      strategyCount: strategies.length,
      leftoverCount: sheets.reduce((sum, sheet) => sum + sheet.leftovers.length, 0),
      leftoverArea: sheets.reduce((sum, sheet) => sum + sheet.leftoverArea, 0),
      discardArea: Math.max(
        0,
        totalBoardArea -
          usedArea -
          sheets.reduce((sum, sheet) => sum + sheet.leftoverArea, 0),
      ),
    },
  };
}

export function formatArea(squareMillimeters) {
  return `${(squareMillimeters / 1_000_000).toFixed(2)} m²`;
}

export function createSampleParts() {
  return [
    {
      id: "sample-a",
      name: "侧板",
      material: "卡其灰",
      length: 2440,
      width: 550,
      quantity: 2,
      grainLocked: true,
      edgeLong: 1,
      edgeShort: 0,
    },
    {
      id: "sample-b",
      name: "收口条",
      material: "卡其灰",
      length: 2440,
      width: 110,
      quantity: 1,
      grainLocked: true,
      edgeLong: 1,
      edgeShort: 0,
    },
  ];
}
