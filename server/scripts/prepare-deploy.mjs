#!/usr/bin/env node
// ============================================================
// 生成「发布就绪」目录（用于单端口公网发布）
//
// 为什么要单独生成一份：
//   发布沙箱只上传源码、且会跳过看起来像构建产物的目录（dist-site/dist/build…）。
//   本脚本把前端产物复制成 public-site/，并让服务端优先从该目录托管，
//   这样发布后前端与后端在同源下一起可用，无需在沙箱里再跑一次前端构建。
//
// 用法：npm run prepare:deploy           → 输出到 ../ceo-cockpit-deploy
//      npm run prepare:deploy -- <目录>  → 自定义输出目录
// ============================================================
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, "../..")
const OUT = resolve(process.argv[2] || join(ROOT, "../ceo-cockpit-deploy"))

// ---------- 0. 确保前端产物是最新的 ----------
if (!existsSync(join(ROOT, "dist-site/index.html"))) {
  console.log("[prepare:deploy] 未发现 dist-site，先执行前端构建…")
  execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" })
}

// ---------- 1. 清理并建立骨架 ----------
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// ---------- 2. 复制前端产物为 public-site（避开「构建产物」目录名） ----------
cpSync(join(ROOT, "dist-site"), join(OUT, "public-site"), { recursive: true })
console.log(`[prepare:deploy] 前端产物 → ${join(OUT, "public-site")}`)

// ---------- 3. 复制后端源码（排除运行时数据/测试） ----------
const EXCLUDE = new Set(["data", "tests", "scripts"]);
["server", "docs"].forEach((d) => {
  cpSync(join(ROOT, d), join(OUT, d), {
    recursive: true,
    filter: (src) => !EXCLUDE.has(src.split("/").pop()),
  })
})
console.log(`[prepare:deploy] 后端源码 → ${join(OUT, "server")}`)

// ---------- 4. 让服务端优先托管 public-site ----------
const idxPath = join(OUT, "server/index.js")
let idx = readFileSync(idxPath, "utf8")
idx = idx.replace(
  'const candidates = [process.env.CEO_WEB_ROOT, join(__dir, "../dist-site"), join(__dir, "../dist")].filter(Boolean)',
  'const candidates = [process.env.CEO_WEB_ROOT, join(__dir, "../public-site"), join(__dir, "../dist-site"), join(__dir, "../dist")].filter(Boolean)'
)
writeFileSync(idxPath, idx)
const patched = idx.includes('join(__dir, "../public-site")')
console.log(`[prepare:deploy] 静态托管路径 ${patched ? "已" : "未"}指向 public-site`)

// ---------- 5. 固定 JWT 密钥（避免每次重新发布导致已登录令牌失效） ----------
const secret = `ceo-${randomBytes(24).toString("base64url")}`
const secPath = join(OUT, "server/lib/security.js")
let sec = readFileSync(secPath, "utf8")
sec = sec.replace('"ceo-cockpit-dev-secret-change-me"', JSON.stringify(secret))
writeFileSync(secPath, sec)
console.log(`[prepare:deploy] JWT 密钥已固定写入发布副本（仓库内默认值不受影响）`)

// ---------- 6. 生成发布用 package.json（仅运行时依赖） ----------
const src = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
const runtimeDeps = {}
for (const [k, v] of Object.entries(src.dependencies)) {
  if (["express", "cors"].includes(k)) runtimeDeps[k] = v
}
const pkg = {
  name: "ceo-cockpit-app",
  version: src.version,
  private: true,
  type: "module",
  description: "星澜智驭 · CEO 驾驶舱 + 公司沙盘 + 后端控制台（单端口同源部署）",
  engines: { node: ">=22.5.0" },
  scripts: {
    start: "node --no-warnings server/index.js",
  },
  dependencies: runtimeDeps,
}
writeFileSync(join(OUT, "package.json"), JSON.stringify(pkg, null, 2) + "\n")

// ---------- 7. 发布说明 ----------
writeFileSync(join(OUT, "README.md"), `# CEO 驾驶舱 · 发布副本

由 \`npm run prepare:deploy\` 自动生成，请勿手工修改；改代码请回到主工程后重新生成。

- 启动：\`npm start\`（读取 \`PORT\`，默认 3000，绑定 0.0.0.0）
- 前端：\`public-site/\`（同源托管，HashRouter + \`base: "./"\`，任意子路径可用）
- 后端：\`server/\`（Express 5 + 内置 node:sqlite，首次启动自动建库播种）
- 数据：\`server/data/cockpit.db\`（运行时生成，已在主工程 .gitignore）
- 默认管理员：\`admin / admin123456\`（首登提示改密）
`)

console.log(`\n[prepare:deploy] 完成 → ${OUT}`)
console.log("[prepare:deploy] 本地自测： cd " + OUT + " && npm install && PORT=8901 npm start")
