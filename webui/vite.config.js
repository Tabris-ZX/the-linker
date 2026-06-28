import vue from "@vitejs/plugin-vue";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(currentDir, "../config/config.yaml");
const projectPath = resolve(currentDir, "../pyproject.toml");
const backgroundsPath = resolve(currentDir, "public/backgrounds");
const devFrontendPort = normalizePort(process.env.VITE_FRONTEND_PORT || readConfiguredFrontendDebugPort(), 5173);
const devBackendPort = normalizePort(process.env.VITE_BACKEND_PORT || readConfiguredBackendPort(), 5174);
const devBackendTarget = process.env.VITE_BACKEND_TARGET || `http://127.0.0.1:${devBackendPort}`;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(readProjectVersion()),
    __BACKGROUND_IMAGES__: JSON.stringify(readBackgroundImages())
  },
  server: {
    host: "0.0.0.0",
    port: devFrontendPort,
    strictPort: false,
    proxy: {
      "/api": {
        target: devBackendTarget,
        changeOrigin: true
      }
    }
  },
  plugins: [
    vue()
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});

function readProjectVersion() {
  if (!existsSync(projectPath)) return "0.0.0";
  const source = readFileSync(projectPath, "utf-8");
  return source.match(/^version\s*=\s*["']([^"']+)["']\s*$/m)?.[1] ?? "0.0.0";
}

function readBackgroundImages() {
  if (!existsSync(backgroundsPath)) return [];
  return readdirSync(backgroundsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => /\.(avif|webp|png|jpe?g)$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((fileName) => `/backgrounds/${fileName}`);
}

function readConfiguredBackendPort() {
  return readConfiguredServerPort("backendPort");
}

function readConfiguredFrontendDebugPort() {
  return readConfiguredServerPort("frontendDebugPort");
}

function readConfiguredServerPort(key) {
  if (!existsSync(configPath)) return "";
  const source = readFileSync(configPath, "utf-8");
  const serverBlock = source.match(/^server:\s*$/m)
    ? source.match(/^server:\s*$([\s\S]*?)(?=^[^\s#][^:\n]*:\s*$|\Z)/m)?.[1] ?? ""
    : "";
  return serverBlock.match(new RegExp(`^\\s*${key}:\\s*["']?(\\d+)["']?\\s*$`, "m"))?.[1] ?? "";
}

function normalizePort(value, fallback) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}
