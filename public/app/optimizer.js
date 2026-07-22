export const DEFAULT_SETTINGS = Object.freeze({
  boardWidth: 1220,
  boardHeight: 2440,
  kerf: 3,
  trim: 0,
  edgeLoss: 3,
  allowRotation: true,
  roundEdgeBand: true,
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
    rotated: position.rotated,
    grainLocked: part.grainLocked,
    edgeLong: part.edgeLong,
    edgeShort: part.edgeShort,
  });
  sheet.freeRectangles = splitFreeRectangles(sheet.freeRectangles, used);
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

export function optimizeCutting(rawParts, rawSettings = {}) {
  const settings = normalizeSettings(rawSettings);
  const normalizedParts = rawParts.map(normalizePart);
  const invalidParts = normalizedParts.filter((part) => !isValidPart(part));
  const validParts = normalizedParts.filter(isValidPart);
  const instances = expandParts(validParts).sort((a, b) => {
    const largestSideDifference =
      Math.max(b.length, b.width) - Math.max(a.length, a.width);
    return largestSideDifference || b.length * b.width - a.length * a.width;
  });

  const sheetsByMaterial = new Map();
  const oversized = [];

  for (const part of instances) {
    const materialSheets = sheetsByMaterial.get(part.material) || [];
    let bestSheet = null;
    let bestPosition = null;

    for (const sheet of materialSheets) {
      const position = findBestPlacement(sheet, part, settings);
      if (
        position &&
        (!bestPosition ||
          position.scoreShortSide < bestPosition.scoreShortSide ||
          (position.scoreShortSide === bestPosition.scoreShortSide &&
            position.scoreLongSide < bestPosition.scoreLongSide))
      ) {
        bestSheet = sheet;
        bestPosition = position;
      }
    }

    if (!bestPosition) {
      const newSheet = createSheet(part.material, materialSheets.length, settings);
      const position = findBestPlacement(newSheet, part, settings);
      if (!position) {
        oversized.push(part);
        continue;
      }
      materialSheets.push(newSheet);
      sheetsByMaterial.set(part.material, materialSheets);
      bestSheet = newSheet;
      bestPosition = position;
    }

    commitPlacement(bestSheet, part, bestPosition);
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
    delete sheet.freeRectangles;
  }

  const edgeBandRawMm = validParts.reduce(
    (sum, part) =>
      sum +
      part.quantity *
        (part.length * part.edgeLong + part.width * part.edgeShort),
    0,
  );
  const edgeBandWithLossMm = edgeBandRawMm * (1 + settings.edgeLoss / 100);
  const edgeBandMeters = edgeBandWithLossMm / 1000;
  const edgeBandOrderMeters = settings.roundEdgeBand
    ? Math.ceil(edgeBandMeters)
    : Math.round(edgeBandMeters * 100) / 100;
  const totalBoardArea = sheets.length * boardArea;

  return {
    settings,
    parts: validParts,
    invalidParts,
    oversized,
    sheets,
    totals: {
      partCount: instances.length,
      placedPartCount: instances.length - oversized.length,
      sheetCount: sheets.length,
      materialCount: sheetsByMaterial.size,
      usedArea,
      totalBoardArea,
      wasteArea: Math.max(0, totalBoardArea - usedArea),
      utilization: totalBoardArea ? (usedArea / totalBoardArea) * 100 : 0,
      edgeBandRawMm,
      edgeBandWithLossMm,
      edgeBandOrderMeters,
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
