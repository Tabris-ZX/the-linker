import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLevelHash } from "../src/utils/levelHash.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const levelsDir = path.join(projectRoot, "data/levels");
const hashFile = path.join(projectRoot, "data/levels-hash.json");

const index = {
  version: 1,
  algorithm: "sha256:canonical-level-v1",
  updatedAt: new Date().toISOString(),
  levels: {},
  hashes: {}
};

const files = (await listFiles(levelsDir))
  .filter((filePath) => /^level-\d+\.json$/.test(path.basename(filePath)))
  .sort((a, b) => path.relative(levelsDir, a).localeCompare(path.relative(levelsDir, b)));

for (const filePath of files) {
  const level = JSON.parse(await fs.readFile(filePath, "utf8"));
  const levelId = level.id ?? path.basename(filePath, ".json");
  const levelHash = await createLevelHash(level, hashText);
  index.levels[levelId] = {
    hash: levelHash.hash,
    canonical: levelHash.canonical
  };
  index.hashes[levelHash.hash] = [...(index.hashes[levelHash.hash] ?? []), levelId].sort();
}

await fs.writeFile(hashFile, `${JSON.stringify(index, null, 2)}\n`, "utf8");

const duplicates = Object.values(index.hashes).filter((levelIds) => levelIds.length > 1);
console.log(`Wrote ${path.relative(projectRoot, hashFile)} for ${files.length} levels.`);
if (duplicates.length > 0) {
  console.log("Duplicate groups:");
  duplicates.forEach((levelIds) => console.log(`- ${levelIds.join(", ")}`));
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    if (entry.isFile()) return [entryPath];
    return [];
  }));
  return files.flat();
}
