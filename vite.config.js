import vue from "@vitejs/plugin-vue";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const projectRoot = process.cwd();
const appConfig = await readAppConfig();
const levelsDir = path.resolve(projectRoot, appConfig.level?.path ?? "data/levels");
const backgroundDir = path.resolve(projectRoot, appConfig.background?.path ?? "background");

export default defineConfig({
  base: "./",
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
              const payload = await readRequestBody(request);
              const level = JSON.parse(payload || "{}");
              const savedLevel = await saveLevel(level);
              sendJson(response, 200, savedLevel);
              return;
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
      await Promise.all(files.map(async (filePath) => {
        if (path.extname(filePath).toLowerCase() !== ".json") return;
        const source = await fs.readFile(filePath);
        const relativePath = normalizePath(path.relative(levelsDir, filePath));
        this.emitFile({
          type: "asset",
          fileName: `${normalizePath(appConfig.level?.path ?? "data/levels")}/${relativePath}`,
          source
        });
      }));
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
  const id = await getNextLevelId();
  const savedLevel = {
    ...level,
    id,
    name: level.name && level.name !== "Custom Level" ? level.name : `Level ${id.slice(6)}`
  };

  await fs.writeFile(path.join(levelsDir, `${id}.json`), `${JSON.stringify(savedLevel, null, 2)}\n`, "utf8");
  return savedLevel;
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

    parent[key] = rawValue.replace(/^["']|["']$/g, "");
  });

  return root;
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}
