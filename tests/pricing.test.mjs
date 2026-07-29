import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateQuotation,
  createQuoteVersion,
  normalizePriceBook,
} from "../public/app/pricing.js";

const result = {
  materialSummaries: [
    { material: "皓月白", sheetCount: 5, partCount: 37 },
    { material: "晓风胡桃", sheetCount: 9, partCount: 94 },
  ],
  totals: {
    sheetCount: 14,
    edgeBandOrderMeters: 120,
    edgeBandRawMm: 116500,
  },
  parts: [{ id: "p1", material: "皓月白", quantity: 14 }],
  settings: { boardWidth: 2440, boardHeight: 1220 },
  sheets: [],
};

test("报价按颜色计板材并汇总材料、加工、税费和毛利", () => {
  const priceBook = normalizePriceBook({
    materialPrices: {
      皓月白: { cost: 100, sale: 150 },
      晓风胡桃: { cost: 120, sale: 180 },
    },
    edgeTapeCostPerMeter: 1,
    edgeTapeSalePerMeter: 2,
    cuttingCostPerSheet: 10,
    cuttingSalePerSheet: 20,
    edgeProcessCostPerMeter: 1.5,
    edgeProcessSalePerMeter: 3,
    deliveryCost: 50,
    deliverySale: 80,
    taxRate: 13,
  });
  const quote = calculateQuotation(result, priceBook, {
    discount: 100,
    leftoverOwnership: "factory",
  });

  assert.equal(quote.lines.filter((line) => line.category === "板材").length, 2);
  assert.equal(quote.lines.find((line) => line.name === "皓月白").quantity, 5);
  assert.equal(quote.lines.find((line) => line.name === "晓风胡桃").quantity, 9);
  assert.equal(quote.leftoverOwnership, "factory");
  assert.equal(quote.discount, 100);
  assert.ok(quote.totals.saleTotal > quote.totals.costTotal);
  assert.ok(quote.totals.grossMargin > 0);
});

test("正式报价版本锁定当时的项目、排版和金额快照", () => {
  const project = {
    projectName: "御景湾A户型",
    customer: { name: "王女士" },
    deliveryDate: "2026-08-10",
    quoteVersions: [],
  };
  const quote = calculateQuotation(result, {
    materialPrices: { 皓月白: { sale: 150 }, 晓风胡桃: { sale: 180 } },
  });
  const version = createQuoteVersion(project, result, quote);

  assert.match(version.number, /^Q\d{8}-001$/);
  assert.equal(version.projectSnapshot.projectName, "御景湾A户型");
  assert.equal(version.projectSnapshot.materialSummaries.length, 2);
  const lockedTotal = version.quotation.totals.saleTotal;
  quote.totals.saleTotal = 0;
  assert.equal(version.quotation.totals.saleTotal, lockedTotal);
});
