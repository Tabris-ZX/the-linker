import vue from "@vitejs/plugin-vue";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { defineConfig } from "vite";
import { createLevelHash } from "./src/utils/levelHash.js";

const projectRoot = process.cwd();
const appConfig = await readAppConfig();
const levelsDir = path.resolve(projectRoot, appConfig.level?.path ?? "data/levels");
const officialLevelsDir = path.join(levelsDir, "official");
const testsLevelsDir = path.join(levelsDir, "tests");
const deleteLevelsDir = path.join(levelsDir, "delete");
const levelsHashFile = path.resolve(projectRoot, "data/levels-hash.json");
const visitorsDir = path.resolve(projectRoot, "data/visitors");
const visitorRecordFile = path.join(visitorsDir, "record.json");
const backgroundDir = path.resolve(projectRoot, appConfig.background?.path ?? "background");
const LEVEL_SAVE_INTERVAL_MS = 30_000;
let lastLevelSavedAt = 0;

export default defineConfig({
  server: {
    port: normalizePort(appConfig.server?.port, 5173),
    strictPort: false
  },
  plugins: [
    vue(),
    backgroundAssetsPlugin(),
    {
      name: "the-linker-levels-api",
      configureServer(server) {
        registerMiddleware(server, "/api/levels/review", async (request, response) => {
          try {
            if (request.method !== "POST") {
              sendJson(response, 405, { error: "Method not allowed" });
              return;
            }

            const payload = await readRequestBody(request);
            const review = JSON.parse(payload || "{}");
            const level = await reviewTestLevel(review);
            sendJson(response, 200, level);
          } catch (error) {
            sendJson(response, 500, { error: error.message, message: error.message });
          }
        });

        registerMiddleware(server, "/api/levels", async (request, response) => {
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
    },
    {
      name: "the-linker-visitors-api",
      configureServer(server) {
        registerMiddleware(server, "/api/visitors", async (request, response) => {
          try {
            if (request.method !== "POST") {
              sendJson(response, 405, { error: "Method not allowed" });
              return;
            }

            const record = await recordVisitor(getRequestIp(request));
            sendJson(response, 200, record);
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
      registerMiddleware(server, "/background", async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "", "http://localhost");
        const requestedPath = path.normalize(decodeURIComponent(requestUrl.pathname.slice("/background".length))).replace(/^[/\\]+/, "");
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
  const files = (await listFiles(levelsDir))
    .filter(isLevelJsonFile)
    .sort(compareLevelFilePaths);

  const levels = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const level = JSON.parse(content);
    levels.push({
      ...level,
      id: path.basename(filePath, ".json"),
      sourcePath: normalizePath(path.relative(levelsDir, filePath)),
      sourceCategory: getLevelSourceCategory(filePath)
    });
  }
  return levels;
}

async function saveLevel(level) {
  await fs.mkdir(testsLevelsDir, { recursive: true });
  if (level.saveMode === "update") {
    return updateExistingLevel(level);
  }

  const id = await getNextLevelId();
  const levelHash = await createNodeLevelHash(level);
  const hashIndex = await refreshLevelsHashIndex();
  const duplicateLevelIds = hashIndex.hashes[levelHash.hash] ?? [];
  if (duplicateLevelIds.length > 0) {
    throw new Error(`关卡重复：与 ${duplicateLevelIds.join(", ")} 的地图结构和点对位置一致`);
  }

  const savedLevel = {
    ...level,
    saveMode: undefined,
    id,
    name: level.name && level.name !== "Custom Level" ? level.name : `Level ${id.slice(6)}`
  };
  delete savedLevel.sourcePath;
  delete savedLevel.sourceCategory;

  await fs.writeFile(path.join(testsLevelsDir, `${id}.json`), `${JSON.stringify(savedLevel, null, 2)}\n`, "utf8");
  await writeLevelsHashIndex(addLevelHashToIndex(hashIndex, savedLevel.id, levelHash));
  return {
    ...savedLevel,
    sourcePath: normalizePath(path.relative(levelsDir, path.join(testsLevelsDir, `${id}.json`))),
    sourceCategory: "tests"
  };
}

async function updateExistingLevel(level) {
  if (!/^level-\d+$/.test(level.id ?? "")) {
    throw new Error("只能修改已有的 level-xxx 关卡");
  }

  const filePath = await findLevelFilePath(level.id);
  if (!filePath) {
    throw new Error(`找不到要修改的关卡 ${level.id}`);
  }
  const currentLevel = JSON.parse(await fs.readFile(filePath, "utf8"));
  const savedLevel = {
    ...level,
    saveMode: undefined,
    id: currentLevel.id ?? level.id,
    name: currentLevel.name ?? `Level ${level.id.slice(6)}`
  };
  delete savedLevel.sourcePath;
  delete savedLevel.sourceCategory;

  const levelHash = await createNodeLevelHash(savedLevel);
  const hashIndex = await refreshLevelsHashIndex();
  const duplicateLevelIds = (hashIndex.hashes[levelHash.hash] ?? []).filter((id) => id !== savedLevel.id);
  if (duplicateLevelIds.length > 0) {
    throw new Error(`关卡重复：与 ${duplicateLevelIds.join(", ")} 的地图结构和点对位置一致`);
  }

  await fs.writeFile(filePath, `${JSON.stringify(savedLevel, null, 2)}\n`, "utf8");
  await writeLevelsHashIndex(addLevelHashToIndex(removeLevelHashFromIndex(hashIndex, savedLevel.id), savedLevel.id, levelHash));
  return {
    ...savedLevel,
    sourcePath: normalizePath(path.relative(levelsDir, filePath)),
    sourceCategory: getLevelSourceCategory(filePath)
  };
}

async function reviewTestLevel(review) {
  const levelId = String(review.levelId ?? "");
  const action = String(review.action ?? "");
  if (!/^level-\d+$/.test(levelId)) {
    throw new Error("只能处理 level-xxx 测试关卡");
  }
  if (!["include", "reject"].includes(action)) {
    throw new Error("未知的测试关卡处理动作");
  }

  await fs.mkdir(officialLevelsDir, { recursive: true });
  await fs.mkdir(testsLevelsDir, { recursive: true });
  await fs.mkdir(deleteLevelsDir, { recursive: true });

  const sourcePath = path.join(testsLevelsDir, `${levelId}.json`);
  const targetDir = action === "include" ? officialLevelsDir : deleteLevelsDir;
  const targetPath = path.join(targetDir, `${levelId}.json`);
  const sourceStat = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStat?.isFile()) {
    throw new Error(`找不到测试关卡 ${levelId}`);
  }

  await fs.rm(targetPath, { force: true });
  await fs.rename(sourcePath, targetPath);
  await refreshLevelsHashIndex();
  const movedLevel = JSON.parse(await fs.readFile(targetPath, "utf8"));
  return {
    ...movedLevel,
    id: levelId,
    sourcePath: normalizePath(path.relative(levelsDir, targetPath)),
    sourceCategory: getLevelSourceCategory(targetPath)
  };
}

async function refreshLevelsHashIndex() {
  const levels = await readLevels();
  const index = createEmptyLevelsHashIndex();
  for (const level of levels) {
    addLevelHashToIndex(index, level.id, await createNodeLevelHash(level));
  }
  await writeLevelsHashIndex(index);
  return index;
}

async function createNodeLevelHash(level) {
  return createLevelHash(level, (text) => crypto.createHash("sha256").update(text).digest("hex"));
}

function createEmptyLevelsHashIndex() {
  return {
    version: 1,
    algorithm: "sha256:canonical-level-v1",
    updatedAt: new Date().toISOString(),
    levels: {},
    hashes: {}
  };
}

function addLevelHashToIndex(index, levelId, levelHash) {
  const nextIndex = removeLevelHashFromIndex(index, levelId);
  nextIndex.levels[levelId] = {
    hash: levelHash.hash,
    canonical: levelHash.canonical
  };
  nextIndex.hashes[levelHash.hash] = uniqueValues([...(nextIndex.hashes[levelHash.hash] ?? []), levelId]).sort();
  nextIndex.updatedAt = new Date().toISOString();
  return nextIndex;
}

function removeLevelHashFromIndex(index, levelId) {
  const currentHash = index.levels[levelId]?.hash;
  if (!currentHash) return index;

  delete index.levels[levelId];
  index.hashes[currentHash] = (index.hashes[currentHash] ?? []).filter((id) => id !== levelId);
  if (index.hashes[currentHash].length === 0) delete index.hashes[currentHash];
  return index;
}

async function writeLevelsHashIndex(index) {
  await fs.mkdir(path.dirname(levelsHashFile), { recursive: true });
  await fs.writeFile(levelsHashFile, `${JSON.stringify(index, null, 2)}\n`, "utf8");
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
  const files = await listFiles(levelsDir).catch(() => []);
  const maxNumber = files.reduce((max, file) => {
    const matched = /^level-(\d+)\.json$/.exec(path.basename(file));
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  return `level-${String(maxNumber + 1).padStart(3, "0")}`;
}

async function findLevelFilePath(levelId) {
  const files = await listFiles(levelsDir).catch(() => []);
  return files.find((filePath) => path.basename(filePath) === `${levelId}.json`) ?? "";
}

async function recordVisitor(ip) {
  await fs.mkdir(visitorsDir, { recursive: true });
  const record = await readVisitorRecord();
  const normalizedIp = normalizeVisitorIp(ip);
  const currentIpCount = Number(record.IPs?.[normalizedIp] ?? 0);
  const nextRecord = {
    count: Number(record.count ?? 0) + 1,
    IPs: {
      ...(record.IPs ?? {}),
      [normalizedIp]: currentIpCount + 1
    }
  };

  await fs.writeFile(visitorRecordFile, `${JSON.stringify(nextRecord, null, 2)}\n`, "utf8");
  return nextRecord;
}

async function readVisitorRecord() {
  const source = await fs.readFile(visitorRecordFile, "utf8").catch(async () => {
    const legacySource = await fs.readFile(path.join(visitorsDir, "record.json"), "utf8").catch(() => "");
    return legacySource;
  });

  if (!source) return { count: 0, IPs: {} };

  try {
    const record = JSON.parse(source);
    return {
      count: Number(record.count ?? 0),
      IPs: normalizeVisitorIps(record.IPs)
    };
  } catch {
    return { count: 0, IPs: {} };
  }
}

function normalizeVisitorIps(ips) {
  if (!ips || typeof ips !== "object") return {};
  return Object.fromEntries(Object.entries(ips).map(([ip, count]) => [ip, Number(count ?? 0)]));
}

function getRequestIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return forwardedIp?.split(",")[0]?.trim()
    ?? request.socket?.remoteAddress
    ?? "unknown";
}

function normalizeVisitorIp(ip) {
  return String(ip || "unknown").replace(/^::ffff:/, "");
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

function registerMiddleware(server, routePath, handler) {
  server.middlewares.use((request, response, next) => {
    if (!isMountedPathMatch(request.url ?? "", routePath)) {
      next();
      return;
    }
    handler(request, response, next);
  });
}

function isMountedPathMatch(requestUrl, mountedPath) {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  if (mountedPath === "/background" || mountedPath.endsWith("/background")) {
    return pathname === mountedPath || pathname.startsWith(`${mountedPath}/`);
  }
  return pathname === mountedPath;
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

function uniqueValues(values) {
  return [...new Set(values)];
}

function isLevelJsonFile(filePath) {
  return path.extname(filePath).toLowerCase() === ".json"
    && /^level-\d+\.json$/.test(path.basename(filePath));
}

function getLevelSourceCategory(filePath) {
  const relativePath = normalizePath(path.relative(levelsDir, filePath));
  const [directory] = relativePath.split("/");
  if (directory === "tests" || directory === "delete" || directory === "official") return directory;
  return "official";
}

function compareLevelFilePaths(left, right) {
  const leftCategory = getLevelSourceCategory(left);
  const rightCategory = getLevelSourceCategory(right);
  const categoryOrder = { official: 0, tests: 1, delete: 2 };
  return (categoryOrder[leftCategory] ?? 9) - (categoryOrder[rightCategory] ?? 9)
    || path.basename(left).localeCompare(path.basename(right));
}
