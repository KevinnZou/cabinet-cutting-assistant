const MATERIAL_KEYS = ["颜色", "色号", "材质", "板材", "饰面", "花色"];
const NAME_STOP_WORDS = new Set([
  "长",
  "宽",
  "高",
  "深",
  "数量",
  "个",
  "件",
  "片",
  "块",
  "张",
  "封边",
  "木纹",
  "顺纹",
  "横纹",
  "竖纹",
  "备注",
]);

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[：]/g, ":")
    .replace(/[，；、]/g, " ")
    .replace(/[×Ｘｘ]/g, "x")
    .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"))
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDimensionUnit(value, unit) {
  const number = toNumber(value);
  if (!number) return 0;
  if (/cm|厘米/i.test(unit || "")) return Math.round(number * 10);
  if (/m|米/i.test(unit || "") && !/mm/i.test(unit || "")) return Math.round(number * 1000);
  return Math.round(number);
}

function parseCount(line) {
  const afterSize = line.match(/\b\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s*x\s*\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s*(?:x|×|\*)\s*(\d+)\s*(?:片|块|件|个|pcs?|张)?/i);
  if (afterSize) return Math.max(1, Math.floor(toNumber(afterSize[1], 1)));

  const explicit = line.match(/(?:数量|数|qty|q|共)\s*[:=]?\s*(\d+)\s*(?:片|块|件|个|pcs?|张)?/i);
  if (explicit) return Math.max(1, Math.floor(toNumber(explicit[1], 1)));

  const unitCount = line.match(/(?:^|[^\d.])(\d+)\s*(?:片|块|件|个|pcs|pc|张)/i);
  return unitCount ? Math.max(1, Math.floor(toNumber(unitCount[1], 1))) : 1;
}

function parseSize(line) {
  const labelled = [
    /(?:长|长度|l)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?\D{0,8}(?:宽|宽度|w|深|深度|d)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?/i,
    /(?:宽|宽度|w|深|深度|d)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?\D{0,8}(?:长|长度|l)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?/i,
  ];

  for (const pattern of labelled) {
    const match = line.match(pattern);
    if (!match) continue;
    const first = normalizeDimensionUnit(match[1], match[2]);
    const second = normalizeDimensionUnit(match[3], match[4]);
    if (/^(宽|宽度|w|深|深度|d)/i.test(match[0])) {
      return { length: second, width: first, raw: match[0] };
    }
    return { length: first, width: second, raw: match[0] };
  }

  const compact = line.match(/\b(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?\s*[x*]\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?\b/i);
  if (compact) {
    return {
      length: normalizeDimensionUnit(compact[1], compact[2]),
      width: normalizeDimensionUnit(compact[3], compact[4]),
      raw: compact[0],
    };
  }

  return null;
}

function parseMaterial(line, currentMaterial = "") {
  for (const key of MATERIAL_KEYS) {
    const match = line.match(new RegExp(`${key}\\s*[:=]?\\s*([^\\s,，;；|/]+)`, "i"));
    if (match) return match[1].replace(/[。.]$/, "");
  }

  const heading = line.match(/^(?:#\s*)?(?:颜色|色号|材质|板材|饰面|花色)\s*[:=]\s*(.+)$/i);
  if (heading) return heading[1].trim();

  return currentMaterial || "未分类";
}

function isMaterialHeading(line) {
  return /^(?:#\s*)?(?:颜色|色号|材质|板材|饰面|花色)\s*[:=]\s*\S+$/i.test(line);
}

function parseEdges(line) {
  let edgeLong = 0;
  let edgeShort = 0;

  if (/(?:四边|全封|全封边|封四边|四周封)/.test(line)) {
    edgeLong = 2;
    edgeShort = 2;
  } else if (/(?:双长边|长边\s*2|长\s*2|两条长边)/.test(line)) {
    edgeLong = 2;
  } else if (/(?:单长边|长边\s*1|长\s*1|一条长边|前封|后封)/.test(line)) {
    edgeLong = 1;
  }

  if (/(?:双短边|短边\s*2|短\s*2|两条短边)/.test(line)) {
    edgeShort = 2;
  } else if (/(?:单短边|短边\s*1|短\s*1|一条短边|左封|右封)/.test(line)) {
    edgeShort = 1;
  }

  const longMatch = line.match(/(?:封长边|长边封|edgeLong|长边)\s*[:=]?\s*([012])/i);
  const shortMatch = line.match(/(?:封短边|短边封|edgeShort|短边)\s*[:=]?\s*([012])/i);
  if (longMatch) edgeLong = Number(longMatch[1]);
  if (shortMatch) edgeShort = Number(shortMatch[1]);

  const shorthand = line.match(/封边\s*[:=]?\s*([012])\s*[/,， ]\s*([012])/i);
  if (shorthand) {
    edgeLong = Number(shorthand[1]);
    edgeShort = Number(shorthand[2]);
  }

  return { edgeLong, edgeShort };
}

function parseGrain(line) {
  if (/(?:无纹|不锁|可旋转|自由旋转|横竖可调)/.test(line)) return false;
  return /(?:木纹|纹理|顺纹|竖纹|锁纹|方向固定|不可旋转)/.test(line);
}

function parseName(line, sizeRaw) {
  let nameSource = cleanText(line)
    .replace(sizeRaw || "", " ")
    .replace(/(?:数量|数|qty|q|共)\s*[:=]?\s*\d+\s*(?:片|块|件|个|pcs?|张)?/gi, " ")
    .replace(/(?:^|[^\d.])\d+\s*(?:片|块|件|个|pcs?|张)/gi, " ")
    .replace(/(?:x|\*)\s*\d+\s*(?:片|块|件|个|pcs?|张)?/gi, " ")
    .replace(/(?:颜色|色号|材质|板材|饰面|花色)\s*[:=]?\s*\S+/gi, " ")
    .replace(/(?:封边|封长边|长边封|封短边|短边封)\s*[:=]?\s*[012](?:\s*[/,， ]\s*[012])?/gi, " ")
    .replace(/(?:长边|短边)\s*[:=]?\s*[012]/gi, " ")
    .replace(/(?:四边封|四周封|全封边|封四边|四边|全封|双长边|单长边|双短边|单短边|木纹|纹理|顺纹|竖纹|锁纹|方向固定|不可旋转|无纹|不锁|可旋转|自由旋转|横竖可调)/g, " ")
    .replace(/[|,，;；]/g, " ");

  const tokens = nameSource
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !NAME_STOP_WORDS.has(token) && !/^\d+$/.test(token));

  return tokens.slice(0, 4).join(" ") || "未命名板件";
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => !/^(?:项目|工程|客户|地址|电话|备注|说明)\s*:/i.test(line))
    .filter((line) => !/^(?:序号|编号|名称|板件|尺寸|长\s*宽|length|name)\b/i.test(line));
}

export function parsePartsText(text, options = {}) {
  const warnings = [];
  const parts = [];
  let currentMaterial = options.defaultMaterial || "未分类";

  splitLines(text).forEach((line, index) => {
    const nextMaterial = parseMaterial(line, currentMaterial);
    if (isMaterialHeading(line)) {
      currentMaterial = nextMaterial;
      return;
    }

    const size = parseSize(line);
    if (!size) {
      warnings.push(`第 ${index + 1} 行未识别到尺寸：${line}`);
      return;
    }

    const material = nextMaterial;
    currentMaterial = material || currentMaterial;
    const edges = parseEdges(line);
    const part = {
      name: parseName(line, size.raw),
      material,
      length: size.length,
      width: size.width,
      quantity: parseCount(line),
      grainLocked: parseGrain(line),
      edgeLong: edges.edgeLong,
      edgeShort: edges.edgeShort,
      sourceText: line,
    };

    if (part.length <= 0 || part.width <= 0) {
      warnings.push(`第 ${index + 1} 行尺寸无效：${line}`);
      return;
    }
    parts.push(part);
  });

  return {
    parts,
    warnings,
    stats: {
      lineCount: splitLines(text).length,
      partTypeCount: parts.length,
      pieceCount: parts.reduce((sum, part) => sum + part.quantity, 0),
    },
  };
}

export function createParserExample() {
  return [
    "项目：玄关柜",
    "颜色：卡其灰",
    "侧板 2440x550 2片 木纹 单长边",
    "收口条 2440*110*1 顺纹 长边1",
    "层板 长760 宽520 数量4 四边封",
    "",
    "材质: 暖白",
    "背板 1180×680 数2 无纹 封边0/0",
    "门板 2100  x  395mm  2件 木纹 双长边 双短边",
  ].join("\n");
}
