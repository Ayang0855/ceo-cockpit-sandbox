import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后端 API 端口（可用环境变量覆盖）
const API_TARGET = process.env.CEO_API_TARGET || 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react()],
  // 相对基址：适配 GitHub Pages 子路径、任意静态托管与本地直开
  base: "./",
  server: {
    port: 5173,
    host: true,
    // 开发态把 /api 代理到本地后端，前端代码始终使用同源相对路径
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
  // 安全策略会拦截构建期的目录清空，故关闭自动清空；
  // 统一输出到 dist-site：Node 服务端同源托管、GitHub Pages 上传共用同一目录
  build: { outDir: "dist-site", emptyOutDir: false },
})
