import configYaml from "../../config/config.yaml?raw";
import stylesMapRaw from "../../config/styles/map.json?raw";
import stylesPoints from "../../config/styles/points.json";
import stylesThemes from "../../config/styles/themes.json";
import { parseSimpleYaml } from "../utils/simpleYaml.js";

const rawConfig = parseSimpleYaml(configYaml);
const BACKGROUND_IMAGE_EXTENSIONS = [".webp", ".png"];
const backgroundImages = normalizeBackgroundImages(rawConfig.background?.image ?? "");

export const appConfig = {
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

function loadThemes() {
  return (Array.isArray(stylesThemes) ? stylesThemes : [])
    .filter((theme) => theme?.id)
    .reduce((loadedThemes, theme) => {
      loadedThemes[theme.id] = theme;
      return loadedThemes;
    }, {});
}

function loadPointPalettes() {
  return Object.entries(stylesPoints ?? {})
    .filter(([, palette]) => palette && typeof palette === "object")
    .reduce((palettes, [id, palette]) => {
      palettes[id] = palette;
      return palettes;
    }, {});
}

function getDefaultPointPaletteId(palettes) {
  const paletteIds = Object.keys(palettes);
  return paletteIds.includes("default") ? "default" : paletteIds[0] ?? "";
}

function parseJsonConfig(rawValue) {
  const normalizedValue = String(rawValue ?? "").trim();
  if (!normalizedValue) return {};
  try {
    return JSON.parse(normalizedValue);
  } catch {
    return {};
  }
}

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

function normalizePath(value) {
  return String(value).replace(/^\.?\//, "").replace(/\\/g, "/");
}

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

function getPathExtension(value) {
  const fileName = value.split("/").pop() ?? "";
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : "";
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeBlur(value) {
  const rawValue = String(value).trim();
  if (!rawValue) return "0px";
  return /^\d+(\.\d+)?$/.test(rawValue) ? `${rawValue}px` : rawValue;
}
