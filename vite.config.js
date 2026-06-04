import vue from "@vitejs/plugin-vue";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const projectRoot = process.cwd();
const appConfig = await readAppConfig();
const levelsDir = path.resolve(projectRoot, appConfig.level?.path ?? "data/levels");
const backgroundDir = path.resolve(projectRoot, appConfig.background?.path ?? "background");
const LEVEL_SAVE_INTERVAL_MS = 30_000;
let lastLevelSavedAt = 0;

export default defineConfig({
  base: "./",
  server: {
    port: normalizePort(appConfig.server?.port, 5173),
    strictPort: false
  },
  build: {
    outDir: "docs",
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  plugins: [
    vue(),
    backgroundAssetsPlugin(),
    levelAssetsPlugin(),
    {
      name: "the-linker-levels-api",
      configureServer(server) {
        server.middlewares.use("/api/levels", async (request, response) => {
          try {
            if (request.method === "GET") {
              const levels = await readLevels();
              sendJson(response, 200, levels);
              return;
            }

            if (request.method === "POST") {
              const rateLimit = getLevelSaveRateLimit();
              if (rateLimit.isLimited) {
                sendJson(response, 429, {
                  error: "Too many requests",
                  message: `保存太频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试`,
                  retryAfterSeconds: rateLimit.retryAfterSeconds
                });
                return;
              }

              const saveStartedAt = Date.now();
              lastLevelSavedAt = saveStartedAt;
              try {
                const payload = await readRequestBody(request);
                const level = JSON.parse(payload || "{}");
                const savedLevel = await saveLevel(level);
                sendJson(response, 200, savedLevel);
                return;
              } catch (error) {
                if (lastLevelSavedAt === saveStartedAt) {
                  lastLevelSavedAt = 0;
                }
                throw error;
              }
            }

            sendJson(response, 405, { error: "Method not allowed" });
          } catch (error) {
            sendJson(response, 500, { error: error.message });
          }
        });
      }
    }
  ]
});

function backgroundAssetsPlugin() {
  return {
    name: "the-linker-background-assets",
    configureServer(server) {
      server.middlewares.use("/background", async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "", "http://localhost");
        const requestedPath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^[/\\]+/, "");
        const filePath = path.resolve(backgroundDir, requestedPath);

        if (!filePath.startsWith(`${backgroundDir}${path.sep}`)) {
          sendJson(response, 403, { error: "Forbidden" });
          return;
        }

        const stats = await fs.stat(filePath).catch(() => null);
        if (!stats?.isFile()) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Type", getMimeType(filePath));
        createReadStream(filePath).pipe(response);
      });
    },
    async generateBundle() {
      const files = await listFiles(backgroundDir).catch(() => []);
      await Promise.all(files.map(async (filePath) => {
        const source = await fs.readFile(filePath);
        const relativePath = normalizePath(path.relative(backgroundDir, filePath));
        this.emitFile({
          type: "asset",
          fileName: `background/${relativePath}`,
          source
        });
      }));
    }
  };
}

function levelAssetsPlugin() {
  return {
    name: "the-linker-level-assets",
    async generateBundle() {
      const files = await listFiles(levelsDir).catch(() => []);
      const emittedLevelFiles = [];
      await Promise.all(files.map(async (filePath) => {
        if (path.extname(filePath).toLowerCase() !== ".json") return;
        const source = await fs.readFile(filePath);
        const relativePath = normalizePath(path.relative(levelsDir, filePath));
        emittedLevelFiles.push(relativePath);
        this.emitFile({
          type: "asset",
          fileName: `${normalizePath(appConfig.level?.path ?? "data/levels")}/${relativePath}`,
          source
        });
      }));
      this.emitFile({
        type: "asset",
        fileName: `${normalizePath(appConfig.level?.path ?? "data/levels")}/index.json`,
        source: `${JSON.stringify(emittedLevelFiles.sort(), null, 2)}\n`
      });
    }
  };
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    if (entry.isFile() && entry.name !== ".gitkeep") return [entryPath];
    return [];
  }));
  return files.flat();
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  };
  return mimeTypes[extension] ?? "application/octet-stream";
}

async function readLevels() {
  await fs.mkdir(levelsDir, { recursive: true });
  const files = (await fs.readdir(levelsDir))
    .filter((file) => /^level-\d+\.json$/.test(file))
    .sort();

  const levels = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(levelsDir, file), "utf8");
    const level = JSON.parse(content);
    levels.push({
      ...level,
      id: path.basename(file, ".json")
    });
  }
  return levels;
}

async function saveLevel(level) {
  await fs.mkdir(levelsDir, { recursive: true });
  if (level.saveMode === "update") {
    return updateExistingLevel(level);
  }

  const id = await getNextLevelId();
  const savedLevel = {
    ...level,
    saveMode: undefined,
    id,
    name: level.name && level.name !== "Custom Level" ? level.name : `Level ${id.slice(6)}`
  };

  await fs.writeFile(path.join(levelsDir, `${id}.json`), `${JSON.stringify(savedLevel, null, 2)}\n`, "utf8");
  return savedLevel;
}

async function updateExistingLevel(level) {
  if (!/^level-\d+$/.test(level.id ?? "")) {
    throw new Error("只能修改已有的 level-xxx 关卡");
  }

  const filePath = path.join(levelsDir, `${level.id}.json`);
  const currentLevel = JSON.parse(await fs.readFile(filePath, "utf8"));
  const savedLevel = {
    ...level,
    saveMode: undefined,
    id: currentLevel.id ?? level.id,
    name: currentLevel.name ?? `Level ${level.id.slice(6)}`
  };

  await fs.writeFile(filePath, `${JSON.stringify(savedLevel, null, 2)}\n`, "utf8");
  return savedLevel;
}

function getLevelSaveRateLimit() {
  const elapsedMs = Date.now() - lastLevelSavedAt;
  if (elapsedMs >= LEVEL_SAVE_INTERVAL_MS) {
    return { isLimited: false, retryAfterSeconds: 0 };
  }

  return {
    isLimited: true,
    retryAfterSeconds: Math.ceil((LEVEL_SAVE_INTERVAL_MS - elapsedMs) / 1000)
  };
}

async function getNextLevelId() {
  const files = await fs.readdir(levelsDir).catch(() => []);
  const maxNumber = files.reduce((max, file) => {
    const matched = /^level-(\d+)\.json$/.exec(file);
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  return `level-${String(maxNumber + 1).padStart(3, "0")}`;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readAppConfig() {
  const configPath = path.resolve(projectRoot, "config/config.yaml");
  const configSource = await fs.readFile(configPath, "utf8").catch(() => "");
  return parseSimpleYaml(configSource);
}

function parseSimpleYaml(source) {
  const root = {};
  const stack = [{ indent: -1, value: root }];

  source.split(/\r?\n/).forEach((rawLine) => {
    const lineWithoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!lineWithoutComment.trim() || lineWithoutComment.trimStart().startsWith("#")) return;

    const indent = lineWithoutComment.match(/^\s*/)[0].length;
    const trimmed = lineWithoutComment.trim();
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    while (stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;
    if (!rawValue) {
      parent[key] = {};
      stack.push({ indent, value: parent[key] });
      return;
    }

    parent[key] = parseYamlScalar(rawValue);
  });

  return root;
}

function parseYamlScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value.replace(/^["']|["']$/g, "");
}

function normalizePort(value, fallback) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return fallback;
  return port;
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}
