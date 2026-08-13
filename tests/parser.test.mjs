import assert from "node:assert/strict";
import test from "node:test";

import {
  createParserExample,
  createParserExampleByType,
  parsePartsText,
} from "../public/app/parser.js";

test("解析混合自然语言清单为可确认板件", () => {
  const result = parsePartsText(createParserExample());

  assert.equal(result.stats.partTypeCount, 5);
  assert.equal(result.stats.pieceCount, 11);
  assert.deepEqual(
    result.parts.map((part) => [part.name, part.material, part.length, part.width, part.quantity]),
    [
      ["侧板", "卡其灰", 2440, 550, 2],
      ["收口条", "卡其灰", 2440, 110, 1],
      ["层板", "卡其灰", 760, 520, 4],
      ["背板", "暖白", 1180, 680, 2],
      ["门板", "暖白", 2100, 395, 2],
    ],
  );
  assert.equal(result.parts[0].grainLocked, true);
  assert.equal(result.parts[2].edgeLong, 2);
  assert.equal(result.parts[2].edgeShort, 2);
});

test("解析结果记录原文行号以及明确、继承、推断和待确认来源", () => {
  const result = parsePartsText(`
皓月白
以下都四边
门板 398x690=16 木纹
460x2440
`);
  const [door, unnamed] = result.parts;

  assert.equal(door.sourceLine, 4);
  assert.equal(door.provenance.sourceText, "门板 398x690=16 木纹");
  assert.equal(door.provenance.fields.material.kind, "inherited");
  assert.equal(door.provenance.fields.material.sourceLine, 2);
  assert.equal(door.provenance.fields.edges.kind, "inherited");
  assert.equal(door.provenance.fields.edges.sourceLine, 3);
  assert.equal(door.provenance.fields.quantity.kind, "explicit");
  assert.equal(unnamed.provenance.fields.name.kind, "inferred");
  assert.equal(unnamed.provenance.fields.quantity.kind, "default");
  assert.ok(result.stats.provenance.inherited >= 2);
  assert.ok(result.stats.provenance.default >= 1);
});

test("支持表格粘贴和单位换算", () => {
  const result = parsePartsText(`
名称 尺寸 数量 材质
活动层板 | 76cm x 52cm | 3片 | 材质:暖白 | 可旋转 | 封边1/1
抽屉面 长0.8米 宽180mm 数量2 颜色:橡木 木纹 双长边
`);

  assert.equal(result.parts.length, 2);
  assert.equal(result.parts[0].length, 760);
  assert.equal(result.parts[0].width, 520);
  assert.equal(result.parts[0].quantity, 3);
  assert.equal(result.parts[0].material, "暖白");
  assert.equal(result.parts[0].grainLocked, false);
  assert.equal(result.parts[0].edgeLong, 1);
  assert.equal(result.parts[0].edgeShort, 1);
  assert.equal(result.parts[1].length, 800);
  assert.equal(result.parts[1].width, 180);
  assert.equal(result.parts[1].material, "橡木");
});

test("无法识别的行返回提示但不中断解析", () => {
  const result = parsePartsText(`
客户说侧板照旧
层板 600x400 2片
`);

  assert.equal(result.parts.length, 1);
  assert.equal(result.warnings.length, 1);
});

test("支持柜体开料单常见厘米简写和后置全单边", () => {
  const result = parsePartsText(createParserExampleByType("cabinet"));

  assert.equal(result.parts.length, 4);
  assert.equal(result.stats.pieceCount, 48);
  assert.deepEqual(
    result.parts.map((part) => [part.material, part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      ["深秋胡桃", 2440, 550, 29, 1, 0],
      ["深秋胡桃", 2440, 200, 9, 1, 0],
      ["深秋胡桃", 2440, 110, 7, 1, 0],
      ["深秋胡桃", 2440, 350, 3, 1, 0],
    ],
  );
});

test("支持冒号条子料写法并默认长度 2440", () => {
  const result = parsePartsText(createParserExampleByType("strip"));

  assert.equal(result.parts.length, 4);
  assert.equal(result.parts[0].name, "条子 540");
  assert.equal(result.parts[0].material, "黑色免漆板");
  assert.equal(result.parts[0].length, 2440);
  assert.equal(result.parts[0].width, 540);
  assert.equal(result.parts[0].quantity, 6);
  assert.equal(result.parts[0].edgeLong, 1);
  assert.equal(result.parts[3].width, 110);
  assert.equal(result.parts[3].quantity, 24);
});

test("支持带序号的板材清单、裸数量和单面封边", () => {
  const result = parsePartsText(`
1 奶油白免漆板 2440*540 14 卧室衣柜板单面封边
2 奶油白免漆板 2440*100 2  不封边
3 奶油白免漆板 2440*390 9  卧室衣柜板单面封边
4 奶油白免漆板 2440*565 5  卧室衣柜板单面封边
5 奶油白免漆板 2440*620 4  卧室衣柜板单面封边
6 奶油白免漆板 2440*350 5  卧室衣柜板单面封边
7 奶油白免漆板 2440*150 5  卧室衣柜板单面封边
8 奶油白免漆板 2440*70 4   条子单面封边
`);

  assert.equal(result.parts.length, 8);
  assert.equal(result.stats.pieceCount, 48);
  assert.deepEqual(
    result.parts.map((part) => [part.material, part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      ["奶油白免漆板", 2440, 540, 14, 1, 0],
      ["奶油白免漆板", 2440, 100, 2, 0, 0],
      ["奶油白免漆板", 2440, 390, 9, 1, 0],
      ["奶油白免漆板", 2440, 565, 5, 1, 0],
      ["奶油白免漆板", 2440, 620, 4, 1, 0],
      ["奶油白免漆板", 2440, 350, 5, 1, 0],
      ["奶油白免漆板", 2440, 150, 5, 1, 0],
      ["奶油白免漆板", 2440, 70, 4, 1, 0],
    ],
  );
  assert.ok(result.parts.every((part) => !part.reviewFlags.includes("颜色待确认")));
  assert.ok(result.parts.every((part) => !part.reviewFlags.includes("数量按 1 片")));
});

test("支持材质在名称后或尺寸后的现场清单", () => {
  const result = parsePartsText(`
1 卧室侧板 奶油白免漆板 2440*540 14 单面封
2 2440*100 2 奶油白免漆板 不封
3 条子 2440*70 4P 奶油白免漆板 单边
`);

  assert.deepEqual(
    result.parts.map((part) => [part.name, part.material, part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      ["卧室侧板", "奶油白免漆板", 2440, 540, 14, 1, 0],
      ["板件 2", "奶油白免漆板", 2440, 100, 2, 0, 0],
      ["条子", "奶油白免漆板", 2440, 70, 4, 1, 0],
    ],
  );
});

test("支持 Excel 表格列、中文列名和同上继承", () => {
  const result = parsePartsText(`
序号\t名称\t材质\t长\t宽\t数量\t封边
1\t侧板\t奶油白免漆板\t2440\t540\t14\t单面
2\t收口条\t同上\t2440\t100\t2\t不封
3\t层板\t同上\t760\t520\t4\t四周封
`);

  assert.deepEqual(
    result.parts.map((part) => [part.name, part.material, part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      ["侧板", "奶油白免漆板", 2440, 540, 14, 1, 0],
      ["收口条", "奶油白免漆板", 2440, 100, 2, 0, 0],
      ["层板", "奶油白免漆板", 760, 520, 4, 2, 2],
    ],
  );
});

test("前置全局封边规则会套用到后续板件", () => {
  const result = parsePartsText(`
材质:卡其灰
全封边
门板 2100x395 2件 木纹
抽面 800x180 3片
`);

  assert.equal(result.parts.length, 2);
  assert.equal(result.parts[0].edgeLong, 2);
  assert.equal(result.parts[0].edgeShort, 2);
  assert.equal(result.parts[1].edgeLong, 2);
  assert.equal(result.parts[1].edgeShort, 2);
});

test("支持尺寸等号数量写法和行内封边词", () => {
  const result = parsePartsText(`
柜门纯色
门板 398x690=16 单边
侧封板 398x110=2 一长一短
`);

  assert.equal(result.parts.length, 2);
  assert.equal(result.parts[0].name, "门板");
  assert.equal(result.parts[0].length, 690);
  assert.equal(result.parts[0].width, 398);
  assert.equal(result.parts[0].quantity, 16);
  assert.equal(result.parts[0].edgeLong, 1);
  assert.equal(result.parts[0].edgeShort, 0);
  assert.equal(result.parts[1].quantity, 2);
  assert.equal(result.parts[1].name, "侧封板");
  assert.equal(result.parts[1].edgeLong, 1);
  assert.equal(result.parts[1].edgeShort, 1);
});

test("支持无空格尺寸和长条双边封语义", () => {
  const result = parsePartsText("地脚线2440*120=36块，（长条双边封）");

  assert.equal(result.parts.length, 1);
  assert.equal(result.parts[0].name, "地脚线");
  assert.equal(result.parts[0].length, 2440);
  assert.equal(result.parts[0].width, 120);
  assert.equal(result.parts[0].quantity, 36);
  assert.equal(result.parts[0].edgeLong, 2);
  assert.equal(result.parts[0].edgeShort, 0);
});

test("支持只写一个公分尺寸的条子料口语清单", () => {
  const result = parsePartsText(`
60公分单边40片
56公分单边100片
55公分单边60片
35公分单边30片
60公分双边20片
`);

  assert.equal(result.parts.length, 5);
  assert.deepEqual(
    result.parts.map((part) => [part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      [2440, 600, 40, 1, 0],
      [2440, 560, 100, 1, 0],
      [2440, 550, 60, 1, 0],
      [2440, 350, 30, 1, 0],
      [2440, 600, 20, 2, 0],
    ],
  );
  assert.equal(result.stats.pieceCount, 250);
});

test("支持公分条子料按条计数和夹材质写法", () => {
  const result = parsePartsText(`
55公分的免漆板22条封单边
40公分的免漆板6条封单边
15公分的免漆板5条封单边
7公分的免漆板10条封单边
4公分的免漆板10条封单边
`);

  assert.equal(result.parts.length, 5);
  assert.equal(result.stats.pieceCount, 53);
  assert.deepEqual(
    result.parts.map((part) => [part.material, part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      ["免漆板", 2440, 550, 22, 1, 0],
      ["免漆板", 2440, 400, 6, 1, 0],
      ["免漆板", 2440, 150, 5, 1, 0],
      ["免漆板", 2440, 70, 10, 1, 0],
      ["免漆板", 2440, 40, 10, 1, 0],
    ],
  );
  assert.ok(result.parts.every((part) => !part.reviewFlags.includes("数量按 1 片")));
  assert.deepEqual(result.parts.map((part) => part.name), ["条子 550", "条子 400", "条子 150", "条子 70", "条子 40"]);
});

test("只有数量没有尺寸时不误判为单尺寸条子料", () => {
  const result = parsePartsText("背板 19片");

  assert.equal(result.parts.length, 0);
  assert.equal(result.warnings.length, 1);
});

test("OCR 数量孤行不强行错配到下一条尺寸", () => {
  const result = parsePartsText(`
40片
单边 60公分
单边30公分 24片
`);

  assert.equal(result.parts.length, 2);
  assert.equal(result.parts[0].width, 600);
  assert.equal(result.parts[0].quantity, 1);
  assert.ok(result.parts[0].reviewFlags.includes("数量按 1 片"));
  assert.equal(result.parts[1].width, 300);
  assert.equal(result.parts[1].quantity, 24);
});

test("支持同一行连续写多个条子料规格", () => {
  const result = parsePartsText("60公分单边40片 56公分单边100片 55公分单边60片 35公分单边30片 60公分双边20片");

  assert.equal(result.parts.length, 5);
  assert.deepEqual(
    result.parts.map((part) => [part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      [2440, 600, 40, 1, 0],
      [2440, 560, 100, 1, 0],
      [2440, 550, 60, 1, 0],
      [2440, 350, 30, 1, 0],
      [2440, 600, 20, 2, 0],
    ],
  );
});

test("支持同一行多个等号条子料并继承颜色", () => {
  const result = parsePartsText("黑色免漆板 540=6片 670=11片 570=7片 110=24片 单边");

  assert.equal(result.parts.length, 4);
  assert.deepEqual(
    result.parts.map((part) => [part.material, part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      ["黑色免漆板", 2440, 540, 6, 1, 0],
      ["黑色免漆板", 2440, 670, 11, 1, 0],
      ["黑色免漆板", 2440, 570, 7, 1, 0],
      ["黑色免漆板", 2440, 110, 24, 1, 0],
    ],
  );
});

test("支持以下都封边和显式不封边", () => {
  const result = parsePartsText(`
颜色:暖白
以下都封4边
门板 700x400=2
抽面 690x180=3
背板 1180x680=1 封边0/0
`);

  assert.equal(result.parts.length, 3);
  assert.equal(result.parts[0].edgeLong, 2);
  assert.equal(result.parts[0].edgeShort, 2);
  assert.equal(result.parts[1].edgeLong, 2);
  assert.equal(result.parts[1].edgeShort, 2);
  assert.equal(result.parts[2].edgeLong, 0);
  assert.equal(result.parts[2].edgeShort, 0);
});

test("长宽顺序统一归一为长边在前，避免 2440 被当成宽边", () => {
  const result = parsePartsText(`
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

  assert.equal(result.parts.length, 7);
  assert.equal(result.stats.pieceCount, 131);
  assert.deepEqual(
    result.parts.map((part) => [part.material, part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      ["皓月白", 2440, 460, 14, 1, 0],
      ["皓月白", 2440, 400, 20, 1, 0],
      ["皓月白", 2440, 60, 3, 1, 0],
      ["晓风胡桃", 2440, 600, 46, 1, 0],
      ["晓风胡桃", 2440, 500, 8, 1, 0],
      ["晓风胡桃", 2440, 400, 28, 1, 0],
      ["晓风胡桃", 2440, 60, 12, 1, 0],
    ],
  );
});

test("支持同一行多个规格并继承同一颜色", () => {
  const result = parsePartsText("皓月白 460X2440=14，400X2440=20，60X2440=3");

  assert.equal(result.parts.length, 3);
  assert.deepEqual(
    result.parts.map((part) => [part.material, part.length, part.width, part.quantity]),
    [
      ["皓月白", 2440, 460, 14],
      ["皓月白", 2440, 400, 20],
      ["皓月白", 2440, 60, 3],
    ],
  );
});

test("支持表格三列写法、括号数量和更多封边同义词", () => {
  const result = parsePartsText(`
颜色 晓风胡桃
侧板 2440 550 2 双长边
层板 760 520 4 封边：四周
地脚线 2440*120（36块） 长条双边封
背板 长1180 宽680 共2 不封
`);

  assert.equal(result.parts.length, 4);
  assert.deepEqual(
    result.parts.map((part) => [part.name, part.material, part.length, part.width, part.quantity, part.edgeLong, part.edgeShort]),
    [
      ["侧板", "晓风胡桃", 2440, 550, 2, 2, 0],
      ["层板", "晓风胡桃", 760, 520, 4, 2, 2],
      ["地脚线", "晓风胡桃", 2440, 120, 36, 2, 0],
      ["背板", "晓风胡桃", 1180, 680, 2, 0, 0],
    ],
  );
});

test("以下都封只影响后续，普通全单边可回填当前颜色段", () => {
  const futureOnly = parsePartsText(`
颜色:暖白
侧板 2440x550=2
以下都封4边
门板 700x400=2
`);

  assert.equal(futureOnly.parts[0].edgeLong, 1);
  assert.equal(futureOnly.parts[0].edgeShort, 0);
  assert.equal(futureOnly.parts[1].edgeLong, 2);
  assert.equal(futureOnly.parts[1].edgeShort, 2);

  const backfill = parsePartsText(`
颜色:深秋胡桃
244x55x29
244x20x9
全单边
`);

  assert.equal(backfill.parts[0].edgeLong, 1);
  assert.equal(backfill.parts[0].edgeShort, 0);
  assert.equal(backfill.parts[1].edgeLong, 1);
  assert.equal(backfill.parts[1].edgeShort, 0);
});

test("支持括号、斜杠、@ 和英文 P 数量写法", () => {
  const result = parsePartsText(`
颜色：暖白
层板 600x400(16) 四边
侧板 800*500/8 双长
拉条 2440x80@12P 双边封
`);

  assert.deepEqual(
    result.parts.map((part) => [part.quantity, part.edgeLong, part.edgeShort]),
    [
      [16, 2, 2],
      [8, 2, 0],
      [12, 2, 0],
    ],
  );
});

test("支持生产现场方向封边说法", () => {
  const result = parsePartsText(`
门板 800x400=2 左右封
抽面 700x180=3 上下封
侧板 2200x550=2 封三边
层板 760x520=4 长短各一
`);

  assert.deepEqual(
    result.parts.map((part) => [part.edgeLong, part.edgeShort]),
    [
      [2, 0],
      [0, 2],
      [2, 1],
      [1, 1],
    ],
  );
});

test("解析结果标注系统推断项供二次确认", () => {
  const result = parsePartsText("活动板 600x400");

  assert.equal(result.parts.length, 1);
  assert.deepEqual(
    result.parts[0].reviewFlags,
    ["颜色待确认", "封边按默认单边", "数量按 1 片"],
  );
  assert.equal(result.stats.reviewCount, 1);
});

test("余料封边规则独立于板件封边并按颜色继承", () => {
  const result = parsePartsText(`
卡其灰
侧板 2440x550=2 单边
余料封双边，短边至少80mm

暖白
门板 700x400=2 四边
余料不封，最小短边50
`);

  assert.deepEqual(
    result.parts.map((part) => [part.material, part.edgeLong, part.edgeShort]),
    [
      ["卡其灰", 1, 0],
      ["暖白", 2, 2],
    ],
  );
  assert.deepEqual(result.materialRules, {
    卡其灰: { leftoverEdgeMode: "2/0", minLeftoverWidth: 80 },
    暖白: { leftoverEdgeMode: "0/0", minLeftoverWidth: 50 },
  });
  assert.equal(result.stats.materialRuleCount, 2);
});

test("支持指定颜色的余料多边封法", () => {
  const result = parsePartsText(`
皓月白
2440x460=2
晓风胡桃余料两长一短，保留100以上
皓月白余料一长一短
`);

  assert.deepEqual(result.materialRules, {
    晓风胡桃: { leftoverEdgeMode: "2/1", minLeftoverWidth: 100 },
    皓月白: { leftoverEdgeMode: "1/1", minLeftoverWidth: 50 },
  });
});
