export function normalizeOcrText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[|｜]/g, " ")
    .replace(/[×Ｘｘ＊]/g, "x")
    .replace(/单四/g, "单边")
    .replace(/(\d+)\s*分/g, "$1公分")
    .replace(/[，,;；、]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function itemBounds(item) {
  const points = Array.isArray(item?.poly) ? item.poly : [];
  const xs = points.map((point) => Number(point?.[0])).filter(Number.isFinite);
  const ys = points.map((point) => Number(point?.[1])).filter(Number.isFinite);
  if (!xs.length || !ys.length) return { x: 0, y: 0, width: 0, height: 24 };
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: (minY + maxY) / 2,
    top: minY,
    bottom: maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(12, maxY - minY),
  };
}

function itemText(item) {
  return String(item?.text || item?.rec_text || "").trim();
}

function rowDistance(row, bounds) {
  const top = bounds.y - bounds.height / 2;
  const bottom = bounds.y + bounds.height / 2;
  const overlap = Math.max(0, Math.min(row.bottom, bottom) - Math.max(row.top, top));
  const minHeight = Math.max(1, Math.min(row.height, bounds.height));
  const centerDistance = Math.abs(row.y - bounds.y);
  return { centerDistance, overlapRatio: overlap / minHeight };
}

function shouldJoinRow(row, bounds) {
  const distance = rowDistance(row, bounds);
  const threshold = Math.max(18, Math.min(row.height, bounds.height) * 0.28);
  return distance.centerDistance <= threshold || distance.overlapRatio >= 0.62;
}

function isQuantityOnly(value) {
  return /^\d+\s*(?:片|块|件|个|pcs?|p|张)$/i.test(String(value || "").trim());
}

function hasSizeLikeText(value) {
  return /(?:\d+\s*(?:mm|毫米|cm|厘米|公分|m|米)|\d+\s*[x*=]\s*\d+)/i.test(String(value || ""));
}

function shouldKeepQuantitySeparate(row, entry) {
  const rowText = row.items.map(({ item }) => itemText(item)).join(" ");
  const entryText = itemText(entry.item);
  const rowIsRightQuantity = row.items.length === 1 && isQuantityOnly(rowText) && row.items[0].bounds.x > entry.bounds.x;
  const entryIsRightQuantity = isQuantityOnly(entryText) && entry.bounds.x > Math.min(...row.items.map(({ bounds }) => bounds.x));
  const rowHasSize = hasSizeLikeText(rowText);
  const entryHasSize = hasSizeLikeText(entryText);

  if (rowIsRightQuantity && entryHasSize && row.items[0].bounds.top < entry.bounds.top - 8) return true;
  if (entryIsRightQuantity && rowHasSize && entry.bounds.top < row.top - 8) return true;
  return false;
}

function makeRow(item, bounds) {
  return {
    y: bounds.y,
    top: bounds.y - bounds.height / 2,
    bottom: bounds.y + bounds.height / 2,
    height: bounds.height,
    items: [{ item, bounds }],
  };
}

function addItemToRow(row, item, bounds) {
  row.items.push({ item, bounds });
  const count = row.items.length;
  row.y = (row.y * (count - 1) + bounds.y) / count;
  row.top = Math.min(row.top, bounds.y - bounds.height / 2);
  row.bottom = Math.max(row.bottom, bounds.y + bounds.height / 2);
  row.height = Math.max(row.height, bounds.height);
}

export function paddleItemsToText(items = []) {
  const normalized = items
    .filter((entry) => itemText(entry))
    .map((item) => ({ item, bounds: itemBounds(item), text: itemText(item) }))
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  const rows = [];

  for (const entry of normalized) {
    const candidates = rows
      .map((row) => ({ row, distance: rowDistance(row, entry.bounds) }))
      .filter(({ row }) => shouldJoinRow(row, entry.bounds) && !shouldKeepQuantitySeparate(row, entry))
      .sort((a, b) => a.distance.centerDistance - b.distance.centerDistance);
    if (candidates.length) {
      addItemToRow(candidates[0].row, entry.item, entry.bounds);
    } else {
      rows.push(makeRow(entry.item, entry.bounds));
    }
  }

  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) =>
      row.items
        .sort((a, b) => a.bounds.x - b.bounds.x)
        .map(({ item }) => itemText(item))
        .join(" "),
    )
    .join("\n");
}

export function extractPaddleText(result) {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    return result
      .map((item) =>
        item?.text ||
        item?.rec_text ||
        (Array.isArray(item?.items) ? paddleItemsToText(item.items) : "") ||
        item?.[1]?.[0] ||
        item?.[0] ||
        "",
      )
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(result?.items)) return paddleItemsToText(result.items);
  if (Array.isArray(result?.textBlocks)) return result.textBlocks.map((item) => item.text || "").join("\n");
  if (Array.isArray(result?.data)) return extractPaddleText(result.data);
  if (Array.isArray(result?.result)) return extractPaddleText(result.result);
  return "";
}
