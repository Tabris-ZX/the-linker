<template>
  <section class="rule-panel app-card" aria-labelledby="rule-title">
    <div class="rule-header">
      <h2 id="rule-title">玩法</h2>
      <button type="button" class="close-button" aria-label="关闭玩法" @click="app.closeRulePanel">
        关闭
      </button>
    </div>
    <div class="rule-content" v-html="renderedRuleHtml"></div>
  </section>
</template>

<script>
import ruleText from "../../docs/rule.md?raw";

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function renderMarkdown(markdown) {
  const lines = (markdown || "玩法内容待补充。").split(/\r?\n/);
  const html = [];
  let isListOpen = false;

  const closeList = () => {
    if (!isListOpen) return;
    html.push("</ul>");
    isListOpen = false;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      if (!isListOpen) {
        html.push("<ul>");
        isListOpen = true;
      }
      html.push(`<li>${renderInlineMarkdown(listItem[1])}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  });

  closeList();
  return html.join("");
}

export default {
  name: "RuleView",
  inject: ["app"],
  computed: {
    renderedRuleHtml() {
      return renderMarkdown(ruleText);
    }
  }
};
</script>
