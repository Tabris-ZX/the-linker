import { appConfig } from "../config/index.js";

/**
 * 获取完整关卡列表。
 *
 * 开发环境优先请求 Vite 本地接口，这样能直接读取配置里的关卡目录。
 * 静态构建环境则回退到构建产物里的 index.json 和单个关卡 JSON 文件。
 *
 * @returns {Promise<Array<object>>} 关卡原始数据列表。
 */
export async function fetchLevelFiles() {
  if (import.meta.env.DEV) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/levels`, { cache: "no-cache" });
      if (response.ok) {
        return response.json();
      }
    } catch {
      // 静态回退保证页面不通过 Vite dev server 启动时也能正常加载。
    }
  }

  const loadedLevels = [];
  const levelFiles = await fetchStaticLevelIndex();
  for (const file of levelFiles) {
    const level = await fetchStaticLevelFile(file);
    if (level) loadedLevels.push(level);
  }

  return loadedLevels;
}

/**
 * 读取静态构建时生成的关卡索引文件。
 *
 * @returns {Promise<string[]>} 关卡 JSON 文件名列表。
 */
export async function fetchStaticLevelIndex() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${appConfig.level.path}/index.json`, { cache: "no-cache" });
    if (!response.ok) return [];
    const files = await response.json();
    return Array.isArray(files) ? files : [];
  } catch {
    return [];
  }
}

/**
 * 从配置的关卡目录读取一个静态关卡文件。
 *
 * @param {string} file 关卡 JSON 文件名。
 * @returns {Promise<object|null>} 关卡原始数据；读取失败时返回 null。
 */
export async function fetchStaticLevelFile(file) {
  const response = await fetch(`${import.meta.env.BASE_URL}${appConfig.level.path}/${file}`, { cache: "no-cache" });
  if (!response.ok) return null;
  return response.json();
}

/**
 * 通过 Vite 开发服务器接口保存关卡。
 *
 * 浏览器代码不能直接写本地文件，所以保存只能走开发环境里的 /api/levels。
 *
 * @param {object} level 要保存的关卡数据。
 * @param {{ mode?: "create" | "update" }} [options] 保存模式，默认新建。
 * @returns {Promise<object>} 服务端写入后的关卡数据。
 */
export async function saveLevelRequest(level, options = {}) {
  const response = await fetch("/api/levels", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...level,
      saveMode: options.mode ?? "create"
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? "保存失败，请确认正在通过 npm run dev 启动项目");
  }

  return response.json();
}
