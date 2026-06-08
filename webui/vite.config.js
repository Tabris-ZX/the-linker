import vue from "@vitejs/plugin-vue";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(currentDir, "../config/config.yaml");
const backgroundSourceDir = resolve(currentDir, "../config/background");
const backgroundOutputDir = resolve(currentDir, "dist/assets/background");
const devBackendPort = process.env.VITE_BACKEND_PORT || readConfiguredBackendPort() || "5174";
const devBackendTarget = process.env.VITE_BACKEND_TARGET || `http://127.0.0.1:${devBackendPort}`;

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    hmr: false,
    proxy: {
      "/api": {
        target: devBackendTarget,
        changeOrigin: true
      }
    }
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

function readConfiguredBackendPort() {
  if (!existsSync(configPath)) return "";
  const source = readFileSync(configPath, "utf-8");
  const serverBlock = source.match(/^server:\s*$/m)
    ? source.match(/^server:\s*$([\s\S]*?)(?=^[^\s#][^:\n]*:\s*$|\Z)/m)?.[1] ?? ""
    : "";
  return serverBlock.match(/^\s*backendPort:\s*["']?(\d+)["']?\s*$/m)?.[1] ?? "";
}
