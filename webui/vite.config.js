import vue from "@vitejs/plugin-vue";
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));
const backgroundSourceDir = resolve(currentDir, "../config/background");
const backgroundOutputDir = resolve(currentDir, "dist/assets/background");

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    hmr: false
  },
  plugins: [
    stripViteClientPlugin(),
    copyBackgroundAssetsPlugin(),
    vue()
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});

function copyBackgroundAssetsPlugin() {
  return {
    name: "the-linker-copy-background-assets",
    closeBundle() {
      if (!existsSync(backgroundSourceDir)) return;
      cpSync(backgroundSourceDir, backgroundOutputDir, { recursive: true });
    }
  };
}

function stripViteClientPlugin() {
  return {
    name: "the-linker-strip-vite-client",
    transformIndexHtml(html, context) {
      if (context?.server?.config?.server?.hmr !== false) return html;
      return html.replace(
        /\s*<script\b[^>]*\bsrc=["']\/@vite\/client["'][^>]*>\s*<\/script>\s*/g,
        "\n"
      );
    }
  };
}
