import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 相对基址：适配 GitHub Pages 子路径、任意静态托管与本地直开
  base: "./",
  server: { port: 5173, host: true },
  // 安全策略会拦截构建期的目录清空，故关闭自动清空
  build: { emptyOutDir: false },
})
