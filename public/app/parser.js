const MATERIAL_KEYS = ["颜色", "色号", "材质", "板材", "饰面", "花色"];
const DEFAULT_PARSE_OPTIONS = Object.freeze({
  defaultMaterial: "未分类",
  defaultStripLength: 2440,
  defaultEdges: { edgeLong: 1, edgeShort: 0 },
});
const DIMENSION_UNIT_PATTERN = "(?:mm|毫米|cm|厘米|m|米)?";
const NUMBER_PATTERN = "\\d+(?:\\.\\d+)?";
const SIZE_TOKEN_PATTERN = new RegExp(
  `${NUMBER_PATTERN}\\s*${DIMENSION_UNIT_PATTERN}\\s*[x*]\\s*${NUMBER_PATTERN}\\s*${DIMENSION_UNIT_PATTERN}(?:\\s*(?:=|[x*])\\s*\\d+\\s*(?:片|块|件|个|pcs?|张)?)?`,
  "i",
);
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

function normalizeCompactDimensions(lengthValue, lengthUnit, widthValue, widthUnit) {
  const rawLength = toNumber(lengthValue);
  const rawWidth = toNumber(widthValue);
  let length;
  let width;

  if (!lengthUnit && !widthUnit && rawLength > 0 && rawLength <= 300 && rawWidth > 0 && rawWidth <= 130) {
    length = Math.round(rawLength * 10);
    width = Math.round(rawWidth * 10);
  } else {
    length = normalizeDimensionUnit(lengthValue, lengthUnit);
    width = normalizeDimensionUnit(widthValue, widthUnit);
  }

  if (width > length) {
    return {
      length: width,
      width: length,
      normalizedDirection: true,
    };
  }

  return {
    length,
    width,
    normalizedDirection: false,
  };
}

function parseCount(line) {
  const sizeEqualsCount = line.match(/\b\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s*[x*]\s*\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s*(?:=|@|\/)\s*(\d+)\s*(?:片|块|件|个|pcs?|p|张)?/i);
  if (sizeEqualsCount) return Math.max(1, Math.floor(toNumber(sizeEqualsCount[1], 1)));

  const sizeParenCount = line.match(/\b\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s*[x*]\s*\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s*(?:\(\s*(\d+)\s*(?:片|块|件|个|pcs?|p|张)?\s*\)|(\d+)\s*(?:片|块|件|个|pcs?|p|张))/i);
  if (sizeParenCount) return Math.max(1, Math.floor(toNumber(sizeParenCount[1] || sizeParenCount[2], 1)));

  const equalCount = line.match(/(?:^|[:=\s])\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米)?\s*=\s*(\d+)\s*(?:片|块|件|个|pcs?|张)?/i);
  if (equalCount) return Math.max(1, Math.floor(toNumber(equalCount[1], 1)));

  const afterSize = line.match(/\b\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s*x\s*\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s*(?:x|×|\*)\s*(\d+)\s*(?:片|块|件|个|pcs?|张)?/i);
  if (afterSize) return Math.max(1, Math.floor(toNumber(afterSize[1], 1)));

  const tableTriplet = line.match(/(?:^|[^\d.])\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s+\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|m|米)?\s+(\d+)\s*(?:片|块|件|个|pcs?|张)?(?:$|[^\d.])/i);
  if (tableTriplet) return Math.max(1, Math.floor(toNumber(tableTriplet[1], 1)));

  const explicit = line.match(/(?:数量|数|qty|q|共)\s*[:=]?\s*(\d+)\s*(?:片|块|件|个|pcs?|张)?/i);
  if (explicit) return Math.max(1, Math.floor(toNumber(explicit[1], 1)));

  const unitCount = line.match(/(?:^|[^\d.])(\d+)\s*(?:片|块|件|个|pcs|pc|张)/i);
  return unitCount ? Math.max(1, Math.floor(toNumber(unitCount[1], 1))) : 1;
}

function hasCountInstruction(line) {
  return /(?:(?:=|@|\/)\s*\d+\s*(?:片|块|件|个|pcs?|p|张)?|\b(?:数量|数|qty|q|共)\s*[:=]?\s*\d+|\d+\s*(?:片|块|件|个|pcs?|p|张)|\d+\s*[x*]\s*\d+\s*[x*]\s*\d+|\(\s*\d+\s*\))/i.test(line);
}

function parseSize(line) {
  const labelled = [
    {
      pattern: /(?:长|长度|l)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?\D{0,12}(?:宽|宽度|w|深|深度|d)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?/i,
      order: "length-width",
    },
    {
      pattern: /(?:宽|宽度|w|深|深度|d)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?\D{0,12}(?:长|长度|l)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?/i,
      order: "width-length",
    },
  ];

  for (const { pattern, order } of labelled) {
    const match = line.match(pattern);
    if (!match) continue;
    const first = normalizeDimensionUnit(match[1], match[2]);
    const second = normalizeDimensionUnit(match[3], match[4]);
    const length = order === "width-length" ? second : first;
    const width = order === "width-length" ? first : second;
    return width > length
      ? { length: width, width: length, raw: match[0], normalizedDirection: true }
      : { length, width, raw: match[0], normalizedDirection: false };
  }

  const compact = line.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?\s*[x*]\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?(?=$|[^\d.]|[x*]\d)/i);
  if (compact) {
    const size = normalizeCompactDimensions(compact[1], compact[2], compact[3], compact[4]);
    return {
      ...size,
      raw: compact[0].replace(/^[^\d.]/, ""),
      kind: "rectangle",
    };
  }

  const tableTriplet = line.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?\s+(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)?\s+\d+\s*(?:片|块|件|个|pcs?|张)?(?:$|[^\d.])/i);
  if (tableTriplet) {
    const size = normalizeCompactDimensions(tableTriplet[1], tableTriplet[2], tableTriplet[3], tableTriplet[4]);
    return {
      ...size,
      raw: tableTriplet[0].replace(/^[^\d.]/, ""),
      kind: "rectangle",
    };
  }

  const strip = line.match(/(?:^|[:=\s])(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米)?\s*=\s*\d+\s*(?:片|块|件|个|pcs?|张)?/i);
  if (strip) {
    return {
      length: DEFAULT_PARSE_OPTIONS.defaultStripLength,
      width: normalizeDimensionUnit(strip[1], strip[2]),
      raw: strip[0],
      kind: "strip",
    };
  }

  return null;
}

function parseMaterial(line, currentMaterial = "") {
  const prefixedSize = line.match(/^([^:=]{2,30})\s*:\s*\d/);
  if (prefixedSize) return prefixedSize[1].trim();

  const leadingMaterial = line.match(/^([^\d:=]{2,20})\s+(?=\d)/);
  if (
    leadingMaterial &&
    /(?:白|灰|黑|胡桃|橡木|科技木|柚木|榆|杉|木纹|纯色|免漆|饰面|花色|板材)$/i.test(leadingMaterial[1].trim())
  ) {
    return leadingMaterial[1].trim();
  }

  for (const key of MATERIAL_KEYS) {
    const match = line.match(new RegExp(`${key}\\s*[:=]?\\s*([^\\s,，;；|/]+)`, "i"));
    if (match) return match[1].replace(/[。.]$/, "");
  }

  const heading = line.match(/^(?:#\s*)?(?:颜色|色号|材质|板材|饰面|花色)\s*[:=\s]\s*(.+)$/i);
  if (heading) return heading[1].trim();

  return currentMaterial || "未分类";
}

function isMaterialHeading(line) {
  return /^(?:#\s*)?(?:颜色|色号|材质|板材|饰面|花色)\s*[:=\s]\s*\D+$/i.test(line);
}

function parseEdges(line) {
  const explicit = hasEdgeInstruction(line);
  let edgeLong = 0;
  let edgeShort = 0;

  if (/(?:4边|四边|四周|全封|全封边|封4边|封四边|四周封|周边封|门板封边|门.*四周封|都封4边|都封四边|封边\s*[:=]?\s*(?:4|四|四周|四边))/.test(line)) {
    edgeLong = 2;
    edgeShort = 2;
  } else if (/(?:3边|三边|封3边|封三边)/.test(line)) {
    edgeLong = 2;
    edgeShort = 1;
  } else if (/(?:长条\s*(?:双边封|封双边|双边)|条子\s*(?:双边封|封双边|双边)|线条\s*(?:双边封|封双边|双边)|地脚线.*双边|全双边|双边封|封双边|两边封|封边\s*[:=]?\s*双边)/.test(line)) {
    edgeLong = 2;
  } else if (/(?:不封边|不用封边|无需封边|免封边|不封|封边\s*[:=]?\s*(?:无|没有|0\s*[/,， ]\s*0))/.test(line)) {
    edgeLong = 0;
    edgeShort = 0;
  } else if (/(?:双长边?|两长边?|左右(?:都)?封|左边右边封|前后(?:都)?封|长边\s*2|长\s*2|两条长边)/.test(line)) {
    edgeLong = 2;
  } else if (/(?:单长边|长边\s*1|长\s*1|一条长边|左封|右封|前封|后封)/.test(line)) {
    edgeLong = 1;
  } else if (/(?:全单边|单边封|封单边|封一边|一边封|余料.*单边|(?:^|\s|\(|（)单边(?:$|\s|\)|）)|都单边|封边\s*[:=]?\s*单边)/.test(line)) {
    edgeLong = 1;
  }

  if (/(?:双短边?|两短边?|上下(?:都)?封|上边下边封|短边\s*2|短\s*2|两条短边)/.test(line)) {
    edgeShort = 2;
  } else if (/(?:单短边|短边\s*1|短\s*1|一条短边|上封|下封)/.test(line)) {
    edgeShort = 1;
  }

  if (/(?:一长一短|一短一长|单长单短|长短各一)/.test(line)) {
    edgeLong = 1;
    edgeShort = 1;
  } else if (/(?:两长一短|双长一短)/.test(line)) {
    edgeLong = 2;
    edgeShort = 1;
  } else if (/(?:两短一长|双短一长)/.test(line)) {
    edgeLong = 1;
    edgeShort = 2;
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

  return { edgeLong, edgeShort, explicit };
}

function hasEdgeInstruction(line) {
  return /(?:封边|封单边|单边封|全单边|单边|双边封|封双边|全双边|两边封|长条\s*双边|条子\s*双边|线条\s*双边|地脚线.*双边|3边|三边|4边|四边|四周|周边|全封|长边|短边|双长|两长|双短|两短|左右封|上下封|左封|右封|上封|下封|一长一短|长短各一|两长一短|两短一长|余料.*单边|门.*四周|不封边|不用封边|无需封边|免封边|不封)/.test(line);
}

function parseGrain(line) {
  if (/(?:无纹|不锁|可旋转|自由旋转|横竖可调)/.test(line)) return false;
  return /(?:木纹|纹理|顺纹|竖纹|锁纹|方向固定|不可旋转)/.test(line);
}

function parseName(line, sizeRaw) {
  let nameSource = cleanText(line)
    .replace(/^[^:=]{2,30}\s*:\s*(?=\d)/, " ")
    .replace(sizeRaw || "", " ")
    .replace(/(?:数量|数|qty|q|共)\s*[:=]?\s*\d+\s*(?:片|块|件|个|pcs?|张)?/gi, " ")
    .replace(/(?:^|[^\d.])\d+\s*(?:片|块|件|个|pcs?|张)/gi, " ")
    .replace(/(?:x|\*)\s*\d+\s*(?:片|块|件|个|pcs?|张)?/gi, " ")
    .replace(/(?:颜色|色号|材质|板材|饰面|花色)\s*[:=]?\s*\S+/gi, " ")
    .replace(/(?:封边|封长边|长边封|封短边|短边封)\s*[:=]?\s*[012](?:\s*[/,， ]\s*[012])?/gi, " ")
    .replace(/封边\s*[:=]?\s*(?:四周|四边|4边|四|4|单边|双边|无|没有|不封|0\s*[/,， ]\s*0)/gi, " ")
    .replace(/(?:=|@|\/)\s*\d+\s*(?:片|块|件|个|pcs?|p|张)?/gi, " ")
    .replace(/(?:长边|短边)\s*[:=]?\s*[012]/gi, " ")
    .replace(/(?:长条\s*双边封|长条\s*封双边|长条\s*双边|条子\s*双边封|条子\s*封双边|条子\s*双边|线条\s*双边封|线条\s*封双边|线条\s*双边|全双边|双边封|封双边|两边封|全单边|单边封|封单边|封一边|一边封|单边|三边封|封三边|3边|三边|四边封|四周封|全封边|封4边|封四边|4边|四边|四周|周边封|全封|双长边?|两长边?|单长边|双短边?|两短边?|单短边|左右封|上下封|左封|右封|上封|下封|一条长边|两条长边|一条短边|两条短边|一长一短|长短各一|两长一短|两短一长|不封边|不用封边|无需封边|免封边|不封|木纹|纹理|顺纹|竖纹|锁纹|方向固定|不可旋转|无纹|不锁|可旋转|自由旋转|横竖可调)/g, " ")
    .replace(/(?:封边\s*:?|边\s*:)/g, " ")
    .replace(/(?:^|\s)(?:双|单|两条|一条)?(?:长边|短边)(?:$|\s)/g, " ")
    .replace(/[()（）]/g, " ")
    .replace(/[|,，;；]/g, " ");

  const tokens = nameSource
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !NAME_STOP_WORDS.has(token) && !/^\d+$/.test(token) && !/^[:：]+$/.test(token));

  return tokens.slice(0, 4).join(" ") || "未命名板件";
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const segmentPattern = SIZE_TOKEN_PATTERN;
      if (!segmentPattern.test(line)) return [line];
      const segments = line
        .split(/\s*[;,，；、]\s*/)
        .map((segment) => cleanText(segment))
        .filter(Boolean);
      return segments.length > 1 && segments.every((segment) => segmentPattern.test(segment) || hasEdgeInstruction(segment))
        ? segments
        : splitCompactMultiSpecLine(line);
    })
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => !/^(?:项目|工程|客户|地址|电话|备注|说明)\s*:/i.test(line))
    .filter((line) => !/^(?:序号|编号|名称|板件|尺寸|长\s*宽|length|name)\b/i.test(line));
}

function splitCompactMultiSpecLine(line) {
  const cleaned = cleanText(line);
  const matches = [...cleaned.matchAll(new RegExp(SIZE_TOKEN_PATTERN.source, "gi"))];
  if (matches.length <= 1) return [line];

  const firstStart = matches[0].index || 0;
  const prefix = cleaned.slice(0, firstStart).trim();
  const prefixLooksLikeMaterial =
    prefix &&
    /^[^\d:=]{2,30}$/.test(prefix) &&
    /(?:白|灰|黑|胡桃|橡木|科技木|柚木|榆|杉|木纹|纯色|免漆|饰面|花色|板材)$/.test(prefix);

  return matches.map((match, index) => {
    const start = index === 0 ? 0 : match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || cleaned.length : cleaned.length;
    const segment = cleaned.slice(start, end).trim();
    return index === 0 || !prefixLooksLikeMaterial ? segment : `${prefix} ${segment}`;
  });
}

export function parsePartsText(text, options = {}) {
  const parseOptions = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const warnings = [];
  const parts = [];
  let currentMaterial = parseOptions.defaultMaterial;
  let currentEdges = parseOptions.defaultEdges;
  let currentEdgesExplicit = false;
  let segmentStart = 0;
  const lines = splitLines(text);

  lines.forEach((line, index) => {
    const nextMaterial = parseMaterial(line, currentMaterial);
    if (isMaterialHeading(line)) {
      currentMaterial = nextMaterial;
      currentEdges = parseOptions.defaultEdges;
      currentEdgesExplicit = false;
      segmentStart = parts.length;
      return;
    }

    const size = parseSize(line);
    if (!size) {
      if (hasEdgeInstruction(line)) {
        currentEdges = parseEdges(line);
        currentEdgesExplicit = true;
        const futureOnly = /(?:以下|下面|后面|后续|往下|之后)/.test(line) && !/(?:以上|上面|前面|前述|之前)/.test(line);
        if (!futureOnly) {
          for (let partIndex = segmentStart; partIndex < parts.length; partIndex += 1) {
            if (!parts[partIndex].edgeExplicit) {
              parts[partIndex].edgeLong = currentEdges.edgeLong;
              parts[partIndex].edgeShort = currentEdges.edgeShort;
            }
          }
        }
      } else if (
        index + 1 < lines.length &&
        parseSize(lines[index + 1]) &&
        /^[\u4e00-\u9fa5A-Za-z0-9·\-\s]{2,20}$/.test(line) &&
        !/(?:客户|项目|说明|备注|请|需要|按照|照旧|同上|做|要|说|尺寸|数量|封边)/.test(line)
      ) {
        currentMaterial = line;
        currentEdges = parseOptions.defaultEdges;
        currentEdgesExplicit = false;
        segmentStart = parts.length;
      } else {
        warnings.push(`第 ${index + 1} 行未识别到尺寸：${line}`);
      }
      return;
    }

    const material = nextMaterial;
    if (material && material !== currentMaterial) {
      currentEdges = parseOptions.defaultEdges;
      currentEdgesExplicit = false;
      segmentStart = parts.length;
    }
    currentMaterial = material || currentMaterial;
    const parsedEdges = parseEdges(line);
    const edges = parsedEdges.explicit ? parsedEdges : currentEdges || parsedEdges;
    const parsedName = parseName(line, size.raw);
    const fallbackName = `板件 ${parts.length - segmentStart + 1}`;
    const usedFallbackName =
      parsedName === "未命名板件" ||
      parsedName === material ||
      !/[\u4e00-\u9fa5A-Za-z]/.test(parsedName);
    const reviewFlags = [];
    if (!material || material === "未分类") reviewFlags.push("颜色待确认");
    if (!parsedEdges.explicit && !currentEdgesExplicit) reviewFlags.push("封边按默认单边");
    if (!hasCountInstruction(line)) reviewFlags.push("数量按 1 片");
    if (usedFallbackName) reviewFlags.push("板件名待确认");
    if (size.normalizedDirection) reviewFlags.push("尺寸已按长边在前");
    const part = {
      name:
        size.kind === "strip" && usedFallbackName
          ? `条子 ${size.width}`
          : parsedName === "未命名板件"
            ? fallbackName
            : parsedName === material
            ? fallbackName
            : parsedName,
      material,
      length: size.length,
      width: size.width,
      quantity: parseCount(line),
      grainLocked: parseGrain(line),
      edgeLong: edges.edgeLong,
      edgeShort: edges.edgeShort,
      edgeExplicit: parsedEdges.explicit,
      sourceText: line,
      reviewFlags,
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
      lineCount: lines.length,
      partTypeCount: parts.length,
      pieceCount: parts.reduce((sum, part) => sum + part.quantity, 0),
      reviewCount: parts.filter((part) => part.reviewFlags.length > 0).length,
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

export function createParserExampleByType(type = "mixed") {
  if (type === "strip") {
    return [
      "黑色免漆板:540=6片（封单边）",
      "黑色免漆板:670=11片（封单边）",
      "黑色免漆板:570=7片（封单边）",
      "黑色免漆板:110=24片（封单边）",
    ].join("\n");
  }

  if (type === "cabinet") {
    return [
      "深秋胡桃",
      "244x55x29",
      "244x20x9",
      "244x11x7",
      "244x35x3",
      "全单边",
    ].join("\n");
  }

  return createParserExample();
}
