import { edgeKey, normalizeGridType, pointsFromEdgeKey } from "./geometry.js";

const SQUARE_TRANSFORMS = [
  ([x, y], width, height) => [x, y, width, height],
  ([x, y], width, height) => [width - x, height - y, width, height],
  ([x, y], width, height) => [height - y, width - x, height, width],
  ([x, y], width, height) => [y, width - x, height, width]
];

const TRIANGLE_TRANSFORMS = [
  ([q, r]) => [q, r],
  ([q, r]) => [-r, q + r],
  ([q, r]) => [-q - r, q],
  ([q, r]) => [-q, -r],
  ([q, r]) => [r, -q - r],
  ([q, r]) => [q + r, -q]
];

/**
 * 计算关卡在旋转等价下的稳定哈希。
 *
 * @param {object} level 关卡数据。
 * @param {(text: string) => string|Promise<string>} [hashText] 文本哈希函数。
 * @returns {Promise<{ hash: string, canonical: string }>} 哈希和规范化文本。
 */
export async function createLevelHash(level, hashText = defaultHashText) {
  const canonical = canonicalizeLevel(level);
  return {
    hash: await hashText(canonical),
    canonical
  };
}

/**
 * 生成关卡的规范化文本，等价地图会得到同一个文本。
 *
 * @param {object} level 关卡数据。
 * @returns {string} 规范化文本。
 */
export function canonicalizeLevel(level) {
  const gridType = normalizeGridType(level.gridType ?? "square");
  const variants = getLevelTransforms(level, gridType).map((transform) => canonicalizeVariant(level, gridType, transform));
  return variants.sort()[0] ?? "";
}

function canonicalizeVariant(level, gridType, transform) {
  const size = getTransformedSize(level, gridType, transform);
  const removedEdges = (level.removedEdges ?? [])
    .map((edge) => transformEdge(edge, transform))
    .filter(Boolean)
    .sort();
  const pairPoints = (level.pairs ?? [])
    .map((pair) => (pair.points ?? [])
      .slice(0, 2)
      .map(transformPointOnly(transform))
      .map(pointKey)
      .sort()
      .join("~"))
    .filter(Boolean)
    .sort();

  return JSON.stringify({
    gridType,
    size,
    removedEdges,
    pairs: pairPoints
  });
}

function getLevelTransforms(level, gridType) {
  if (gridType === "equilateral-triangle") return TRIANGLE_TRANSFORMS.map((transform) => (point) => transform(point));
  const width = Number(level.width ?? 0);
  const height = Number(level.height ?? 0);
  return SQUARE_TRANSFORMS
    .filter((transform) => {
      const [, , nextWidth, nextHeight] = transform([0, 0], width, height);
      return nextWidth === width && nextHeight === height;
    })
    .map((transform) => {
      const mappedTransform = (point) => transform(point, width, height).slice(0, 2);
      mappedTransform.size = transform([0, 0], width, height).slice(2, 4);
      return mappedTransform;
    });
}

function getTransformedSize(level, gridType, transform) {
  if (gridType === "equilateral-triangle") return { radius: Number(level.radius ?? level.width ?? 0) };
  const width = Number(level.width ?? 0);
  const height = Number(level.height ?? 0);
  const [nextWidth, nextHeight] = transform.size ?? [width, height];
  return { width: nextWidth ?? width, height: nextHeight ?? height };
}

function transformEdge(edge, transform) {
  const points = pointsFromEdgeKey(edge);
  if (!points) return "";
  return edgeKey(transform(points[0]), transform(points[1]));
}

function transformPointOnly(transform) {
  return (point) => transform(point);
}

function pointKey(point) {
  return `${point[0]},${point[1]}`;
}

async function defaultHashText(text) {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return fnv1a(text);
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
