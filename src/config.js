import configYaml from "../config/config.yaml?raw";
import { parseSimpleYaml } from "./utils/simpleYaml.js";

const rawConfig = parseSimpleYaml(configYaml);
const themeModules = import.meta.glob("../config/themes/*.json", { eager: true, import: "default" });
const colorModules = import.meta.glob("../config/colors/*.json", { eager: true, import: "default" });

export const appConfig = {
  level: {
    path: normalizePath(rawConfig.level?.path ?? "data/levels")
  },
  theme: {
    default: rawConfig.theme?.default ?? "paper",
    path: normalizePath(rawConfig.theme?.path ?? "config/themes"),
    styles: rawConfig.theme?.styles ?? {}
  },
  colors: {
    directory: normalizePath(rawConfig.colors?.directory ?? rawConfig.colors?.path ?? "config/colors")
  },
  background: {
    path: normalizePath(rawConfig.background?.path ?? "background"),
    image: normalizeBackgroundImage(rawConfig.background?.image ?? ""),
    opacity: clampNumber(Number(rawConfig.background?.opacity ?? 0), 0, 1),
    blur: normalizeBlur(rawConfig.background?.blur ?? 0)
  }
};

export const themes = loadThemes();
export const colorConfigs = loadColorConfigs();
export const pointDefinitions = colorConfigs.points?.points ?? {};

export const fallbackLevel = {
  id: "level-001",
  name: "First Link",
  gridType: "square",
  width: 5,
  height: 5,
  pairs: [
    { id: "red", points: [[0, 0], [2, 0]] },
    { id: "blue", points: [[3, 0], [1, 1]] },
    { id: "green", points: [[0, 1], [3, 2]] },
    { id: "amber", points: [[4, 2], [1, 3]] },
    { id: "pink", points: [[0, 3], [4, 4]] }
  ]
};

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

function normalizeBackgroundImage(value) {
  const normalizedValue = String(value).trim();
  if (!normalizedValue || normalizedValue.toLowerCase() === "no") return "";

  const image = normalizePath(normalizedValue)
    .replace(/^background\//, "")
    .replace(/^config\/background\//, "");
  return image ? `background/${image}` : "";
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
