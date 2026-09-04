import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig } from "vite";

// 唯一版本源：仓库根 VERSION 文件（三端同源，见 /CHANGELOG.md）
const APP_VERSION = fs.readFileSync(path.resolve(__dirname, "../VERSION"), "utf-8").trim();

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发环境代理，避免 CORS
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
