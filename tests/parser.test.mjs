import assert from "node:assert/strict";
import test from "node:test";

import { createParserExample, parsePartsText } from "../public/app/parser.js";

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
