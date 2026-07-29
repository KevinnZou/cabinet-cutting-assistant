function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.round((number(value) + Number.EPSILON) * 100) / 100;
}

export function normalizePriceBook(input = {}) {
  return {
    version: 1,
    materialPrices:
      input.materialPrices && typeof input.materialPrices === "object"
        ? input.materialPrices
        : {},
    edgeTapeCostPerMeter: Math.max(0, number(input.edgeTapeCostPerMeter, 0.8)),
    edgeTapeSalePerMeter: Math.max(0, number(input.edgeTapeSalePerMeter, 1.2)),
    cuttingCostPerSheet: Math.max(0, number(input.cuttingCostPerSheet, 10)),
    cuttingSalePerSheet: Math.max(0, number(input.cuttingSalePerSheet, 15)),
    edgeProcessCostPerMeter: Math.max(0, number(input.edgeProcessCostPerMeter, 1.5)),
    edgeProcessSalePerMeter: Math.max(0, number(input.edgeProcessSalePerMeter, 2.5)),
    deliveryCost: Math.max(0, number(input.deliveryCost, 0)),
    deliverySale: Math.max(0, number(input.deliverySale, 0)),
    otherCost: Math.max(0, number(input.otherCost, 0)),
    otherSale: Math.max(0, number(input.otherSale, 0)),
    taxRate: Math.max(0, Math.min(100, number(input.taxRate, 0))),
  };
}

export function calculateQuotation(result, priceBookInput, options = {}) {
  const priceBook = normalizePriceBook(priceBookInput);
  const lines = [];

  for (const material of result.materialSummaries || []) {
    const price = priceBook.materialPrices[material.material] || {};
    const costPrice = Math.max(0, number(price.cost, 0));
    const salePrice = Math.max(0, number(price.sale, costPrice));
    lines.push({
      id: `board-${material.material}`,
      category: "板材",
      name: material.material,
      unit: "张",
      quantity: material.sheetCount,
      costUnitPrice: costPrice,
      saleUnitPrice: salePrice,
      costAmount: money(material.sheetCount * costPrice),
      saleAmount: money(material.sheetCount * salePrice),
    });
  }

  const edgeMeters = number(result.totals?.edgeBandOrderMeters);
  lines.push(
    {
      id: "edge-tape",
      category: "材料",
      name: "封边条",
      unit: "米",
      quantity: edgeMeters,
      costUnitPrice: priceBook.edgeTapeCostPerMeter,
      saleUnitPrice: priceBook.edgeTapeSalePerMeter,
      costAmount: money(edgeMeters * priceBook.edgeTapeCostPerMeter),
      saleAmount: money(edgeMeters * priceBook.edgeTapeSalePerMeter),
    },
    {
      id: "cutting",
      category: "加工",
      name: "开料加工",
      unit: "张",
      quantity: number(result.totals?.sheetCount),
      costUnitPrice: priceBook.cuttingCostPerSheet,
      saleUnitPrice: priceBook.cuttingSalePerSheet,
      costAmount: money(number(result.totals?.sheetCount) * priceBook.cuttingCostPerSheet),
      saleAmount: money(number(result.totals?.sheetCount) * priceBook.cuttingSalePerSheet),
    },
    {
      id: "edge-processing",
      category: "加工",
      name: "封边加工",
      unit: "米",
      quantity: money(number(result.totals?.edgeBandRawMm) / 1000),
      costUnitPrice: priceBook.edgeProcessCostPerMeter,
      saleUnitPrice: priceBook.edgeProcessSalePerMeter,
      costAmount: money(number(result.totals?.edgeBandRawMm) / 1000 * priceBook.edgeProcessCostPerMeter),
      saleAmount: money(number(result.totals?.edgeBandRawMm) / 1000 * priceBook.edgeProcessSalePerMeter),
    },
  );

  if (priceBook.deliveryCost || priceBook.deliverySale) {
    lines.push({
      id: "delivery",
      category: "其他",
      name: "配送费",
      unit: "次",
      quantity: 1,
      costUnitPrice: priceBook.deliveryCost,
      saleUnitPrice: priceBook.deliverySale,
      costAmount: money(priceBook.deliveryCost),
      saleAmount: money(priceBook.deliverySale),
    });
  }
  if (priceBook.otherCost || priceBook.otherSale) {
    lines.push({
      id: "other",
      category: "其他",
      name: "其他费用",
      unit: "项",
      quantity: 1,
      costUnitPrice: priceBook.otherCost,
      saleUnitPrice: priceBook.otherSale,
      costAmount: money(priceBook.otherCost),
      saleAmount: money(priceBook.otherSale),
    });
  }

  const costTotal = money(lines.reduce((sum, line) => sum + line.costAmount, 0));
  const saleSubtotal = money(lines.reduce((sum, line) => sum + line.saleAmount, 0));
  const discount = Math.max(0, number(options.discount, 0));
  const discountedSubtotal = Math.max(0, money(saleSubtotal - discount));
  const tax = money(discountedSubtotal * priceBook.taxRate / 100);
  const saleTotal = money(discountedSubtotal + tax);
  const grossProfit = money(saleTotal - costTotal - tax);
  const grossMargin = saleTotal > 0 ? money((grossProfit / saleTotal) * 100) : 0;

  return {
    createdAt: new Date().toISOString(),
    leftoverOwnership: options.leftoverOwnership || "customer",
    discount: money(discount),
    taxRate: priceBook.taxRate,
    lines,
    totals: {
      costTotal,
      saleSubtotal,
      discountedSubtotal,
      tax,
      saleTotal,
      grossProfit,
      grossMargin,
    },
  };
}

export function createQuoteVersion(project, result, quotation) {
  const existing = project.quoteVersions || [];
  return JSON.parse(JSON.stringify({
    id: globalThis.crypto?.randomUUID?.() || `quote-${Date.now()}`,
    number: `Q${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(existing.length + 1).padStart(3, "0")}`,
    version: existing.length + 1,
    createdAt: new Date().toISOString(),
    projectSnapshot: {
      projectName: project.projectName,
      customer: project.customer,
      deliveryDate: project.deliveryDate,
      parts: result.parts,
      settings: result.settings,
      materialSummaries: result.materialSummaries,
      totals: result.totals,
      sheets: result.sheets,
    },
    quotation,
  }));
}
