import configYaml from "../config/config.yaml?raw";
import { parseSimpleYaml } from "./utils/simpleYaml.js";

const rawConfig = parseSimpleYaml(configYaml);
const themeModules = import.meta.glob("../config/themes/*.json", { eager: true, import: "default" });
const colorModules = import.meta.glob("../config/colors/*.json", { eager: true, import: "default" });
const BACKGROUND_IMAGE_EXTENSIONS = [".webp", ".png"];
const backgroundImages = normalizeBackgroundImages(rawConfig.background?.image ?? "");

export const appConfig = {
  level: {
    path: normalizePath(rawConfig.level?.path ?? "data/levels")
  },
  theme: {
    default: rawConfig.theme?.default ?? "default",
    path: normalizePath(rawConfig.theme?.path ?? "config/themes"),
    styles: rawConfig.theme?.styles ?? {}
  },
  colors: {
    directory: normalizePath(rawConfig.colors?.directory ?? rawConfig.colors?.path ?? "config/colors")
  },
  background: {
    path: normalizePath(rawConfig.background?.path ?? "background"),
    image: backgroundImages[0] ?? "",
    images: backgroundImages,
    opacity: clampNumber(Number(rawConfig.background?.opacity ?? 0), 0, 1),
    blur: normalizeBlur(rawConfig.background?.blur ?? 0)
  }
};

export const themes = loadThemes();
export const colorConfigs = loadColorConfigs();
export const pointDefinitions = colorConfigs.points?.points ?? {};

function loadThemes() {
  return Object.values(filterModulesByDirectory(themeModules, appConfig.theme.path))
    .filter((theme) => theme?.id)
    .reduce((loadedThemes, theme) => {
      loadedThemes[theme.id] = theme;
      return loadedThemes;
    }, {});
}

function loadColorConfigs() {
  return Object.entries(filterModulesByDirectory(colorModules, appConfig.colors.directory))
    .reduce((configs, [modulePath, config]) => {
      configs[getFileStem(modulePath)] = config;
      return configs;
    }, {});
}

function filterModulesByDirectory(modules, directory) {
  const normalizedDirectory = normalizePath(directory);
  return Object.fromEntries(
    Object.entries(modules).filter(([modulePath]) => normalizePath(modulePath).includes(`/${normalizedDirectory}/`))
  );
}

function getFileStem(modulePath) {
  const fileName = normalizePath(modulePath).split("/").pop() ?? "";
  return fileName.replace(/\.json$/, "");
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
