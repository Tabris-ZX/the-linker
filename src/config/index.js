import clientConfig from "virtual:the-linker-client-config";
import stylesMapRaw from "../../config/styles/map.json?raw";
import stylesPoints from "../../config/styles/points.json";
import stylesThemes from "../../config/styles/themes.json";

const rawConfig = clientConfig;
const BACKGROUND_IMAGE_EXTENSIONS = [".webp", ".png"];
const backgroundImages = normalizeBackgroundImages(rawConfig.background?.image ?? "");

export const appConfig = {
  server: {
    port: normalizePort(rawConfig.server?.port, 5173)
  },
  level: {
    path: normalizePath(rawConfig.level?.path ?? "data/levels")
  },
  theme: {
    default: rawConfig.theme?.default ?? "default",
    styles: rawConfig.theme?.styles ?? {}
  },
  colors: {
    palette: rawConfig.colors?.palette ?? rawConfig.colors?.default ?? "default"
  },
  mapStyle: normalizeMapStyle(parseJsonConfig(stylesMapRaw)),
  background: {
    path: normalizePath(rawConfig.background?.path ?? "background"),
    image: backgroundImages[0] ?? "",
    images: backgroundImages,
    opacity: clampNumber(Number(rawConfig.background?.opacity ?? 0), 0, 1),
    blur: normalizeBlur(rawConfig.background?.blur ?? 0)
  }
};

export const themes = loadThemes();
export const pointPalettes = loadPointPalettes();
export const defaultPointPaletteId = getDefaultPointPaletteId(pointPalettes);
export const pointDefinitions = pointPalettes[appConfig.colors.palette] ?? pointPalettes[defaultPointPaletteId] ?? {};

/**
 * 从主题样式配置中构建按 id 索引的主题表。
 *
 * @returns {Record<string, object>} 主题映射。
 */
function loadThemes() {
  return (Array.isArray(stylesThemes) ? stylesThemes : [])
    .filter((theme) => theme?.id)
    .reduce((loadedThemes, theme) => {
      loadedThemes[theme.id] = theme;
      return loadedThemes;
    }, {});
}

/**
 * 从点位样式配置中构建按调色板 id 索引的点位表。
 *
 * @returns {Record<string, object>} 点位调色板映射。
 */
function loadPointPalettes() {
  return Object.entries(stylesPoints ?? {})
    .filter(([, palette]) => palette && typeof palette === "object")
    .reduce((palettes, [id, palette]) => {
      palettes[id] = palette;
      return palettes;
    }, {});
}

/**
 * 获取默认点位调色板 id。
 *
 * @param {Record<string, object>} palettes 点位调色板映射。
 * @returns {string} 默认调色板 id。
 */
function getDefaultPointPaletteId(palettes) {
  const paletteIds = Object.keys(palettes);
  return paletteIds.includes("default") ? "default" : paletteIds[0] ?? "";
}

/**
 * 安全解析 JSON 配置文本。
 *
 * @param {string} rawValue JSON 原始文本。
 * @returns {object} 解析结果；失败时返回空对象。
 */
function parseJsonConfig(rawValue) {
  const normalizedValue = String(rawValue ?? "").trim();
  if (!normalizedValue) return {};
  try {
    return JSON.parse(normalizedValue);
  } catch {
    return {};
  }
}

/**
 * 归一化地图样式数值，限制到可用范围。
 *
 * @param {object} config 地图样式配置。
 * @returns {{ dotScale: number, nodeScale: number, lineScale: number, gridLineScale: number, snapPointRadius: number }} 地图样式。
 */
function normalizeMapStyle(config) {
  const rawStyle = config?.mapStyle ?? config ?? {};
  return {
    dotScale: clampNumber(Number(rawStyle.dotScale), 0.2, 0.5),
    nodeScale: clampNumber(Number(rawStyle.nodeScale), 0.04, 0.5),
    lineScale: clampNumber(Number(rawStyle.lineScale), 0.1, 0.5),
    gridLineScale: clampNumber(Number(rawStyle.gridLineScale), 0.02, 0.2),
    snapPointRadius: clampNumber(Number(rawStyle.snapPointRadius), 0.1, 0.5)
  };
}

/**
 * 归一化资源路径，去掉起始 ./ 并统一斜杠。
 *
 * @param {unknown} value 原始路径。
 * @returns {string} 标准路径。
 */
function normalizePath(value) {
  return String(value).replace(/^\.?\//, "").replace(/\\/g, "/");
}

/**
 * 归一化服务端口。
 *
 * @param {unknown} value 原始端口值。
 * @param {number} fallback 端口无效时的回退值。
 * @returns {number} 有效端口。
 */
function normalizePort(value, fallback) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return fallback;
  return port;
}

/**
 * 根据配置生成背景图片候选路径。
 *
 * @param {unknown} value 背景图片配置值。
 * @returns {string[]} 候选背景图片路径。
 */
function normalizeBackgroundImages(value) {
  const normalizedValue = String(value).trim();
  if (!normalizedValue || normalizedValue.toLowerCase() === "no") return [];

  const image = normalizePath(normalizedValue)
    .replace(/^background\//, "")
    .replace(/^config\/background\//, "");
  if (!image) return [];

  const extension = getPathExtension(image);
  if (!extension) {
    return BACKGROUND_IMAGE_EXTENSIONS.map((candidateExtension) => `background/${image}${candidateExtension}`);
  }

  if (!BACKGROUND_IMAGE_EXTENSIONS.includes(extension)) {
    return [`background/${image}`];
  }

  const baseName = image.slice(0, -extension.length);
  return uniqueValues([
    `background/${image}`,
    ...BACKGROUND_IMAGE_EXTENSIONS
      .filter((candidateExtension) => candidateExtension !== extension)
      .map((candidateExtension) => `background/${baseName}${candidateExtension}`)
  ]);
}

/**
 * 获取路径中的小写扩展名。
 *
 * @param {string} value 文件路径。
 * @returns {string} 扩展名；没有扩展名时为空字符串。
 */
function getPathExtension(value) {
  const fileName = value.split("/").pop() ?? "";
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : "";
}

/**
 * 去除数组中的重复值。
 *
 * @param {Array<unknown>} values 原始数组。
 * @returns {Array<unknown>} 去重后的数组。
 */
function uniqueValues(values) {
  return [...new Set(values)];
}

/**
 * 将数值限制在指定范围内。
 *
 * @param {number} value 原始数值。
 * @param {number} min 最小值。
 * @param {number} max 最大值。
 * @returns {number} 限制后的数值。
 */
function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 归一化背景模糊值，纯数字自动补 px。
 *
 * @param {unknown} value 原始模糊值。
 * @returns {string} CSS blur 长度值。
 */
function normalizeBlur(value) {
  const rawValue = String(value).trim();
  if (!rawValue) return "0px";
  return /^\d+(\.\d+)?$/.test(rawValue) ? `${rawValue}px` : rawValue;
}
