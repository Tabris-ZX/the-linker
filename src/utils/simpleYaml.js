/**
 * 解析项目配置使用的简化 YAML 文本。
 *
 * 仅支持缩进对象、基础标量和注释，满足 config.yaml 的轻量读取需求。
 *
 * @param {string} source YAML 源文本。
 * @returns {object} 解析后的对象。
 */
export function parseSimpleYaml(source) {
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

/**
 * 解析简化 YAML 标量值。
 *
 * @param {string} value 标量文本。
 * @returns {string|number|boolean} 转换后的值。
 */
function parseYamlScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value.replace(/^["']|["']$/g, "");
}
