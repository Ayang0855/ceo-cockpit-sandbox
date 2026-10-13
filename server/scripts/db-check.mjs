#!/usr/bin/env node
// ============================================================
// 数据体检：对比「当前库」与「按代码种子重建的干净库」，列出业务字段漂移
//   用途：定位「后端代码改了 / 库还是老数据」导致的前后端口径不一致
//   用法：npm run db:check
//   退出码：0 = 无漂移；1 = 存在漂移（控制台会打印具体字段）
// ============================================================
import { DatabaseSync } from "node:sqlite"
import { existsSync, rmSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, "../..")
const CUR_DB = process.env.CEO_DB_FILE || join(__dir, "../data/cockpit.db")

const TABLES = ["departments", "sandbox_units", "customers", "reports", "configs", "permissions", "roles"]
const RUNTIME_COLS = new Set(["created_at", "updated_at", "updated_by", "password_hash", "salt", "last_login_at", "locked_until", "fail_count"])
const keyOf = (r) => String(r.id ?? r.key ?? r.code)

const clean = (row) => {
  const o = {}
  for (const [k, v] of Object.entries(row)) if (!RUNTIME_COLS.has(k)) o[k] = v
  return o
}

const dump = (file) => {
  const db = new DatabaseSync(file)
  const out = {}
  for (const t of TABLES) {
    try { out[t] = db.prepare(`SELECT * FROM ${t}`).all() } catch { out[t] = [] }
  }
  db.close()
  return out
}

if (!existsSync(CUR_DB)) {
  console.log(`[db:check] 当前库不存在：${CUR_DB}`)
  console.log("[db:check] 首次启动后端时会自动建库并写入种子数据，无需处理。")
  process.exit(0)
}

// 1) 用同一份代码种子，在临时目录建一个干净库
const tmpDir = mkdtempSync(join(tmpdir(), "cockpit-check-"))
const freshFile = join(tmpDir, "fresh.db")
process.env.CEO_DB_FILE = freshFile
process.env.CEO_DATA_DIR = tmpDir
await import("../db.js")

const cur = dump(CUR_DB)
const fresh = dump(freshFile)

let drift = 0
console.log(`[db:check] 当前库：${CUR_DB}`)
console.log(`[db:check] 对照库：按 server/db.js 种子新建\n`)

for (const t of TABLES) {
  const a = new Map(cur[t].map((r) => [keyOf(r), clean(r)]))
  const b = new Map(fresh[t].map((r) => [keyOf(r), clean(r)]))
  const missing = [...b.keys()].filter((k) => !a.has(k))
  const changed = [...b.keys()].filter((k) => a.has(k) && JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k)))
  const extra = [...a.keys()].filter((k) => !b.has(k))

  if (!missing.length && !changed.length && !extra.length) {
    console.log(`  ✓ ${t.padEnd(14)} ${b.size} 行，与种子一致`)
    continue
  }
  drift++
  console.log(`  ✗ ${t.padEnd(14)} 种子 ${b.size} 行 / 当前 ${a.size} 行`)
  if (missing.length) console.log(`      缺少：${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ` …(+${missing.length - 10})` : ""}`)
  if (extra.length) console.log(`      多余：${extra.slice(0, 10).join(", ")}${extra.length > 10 ? ` …(+${extra.length - 10})` : ""}`)
  changed.slice(0, 8).forEach((k) => {
    const x = a.get(k), y = b.get(k)
    const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((f) => JSON.stringify(x?.[f]) !== JSON.stringify(y?.[f]))
    fields.forEach((f) => console.log(`      ${k}.${f}: 当前=${JSON.stringify(x?.[f])}  种子=${JSON.stringify(y?.[f])}`))
  })
  if (changed.length > 8) console.log(`      …另有 ${changed.length - 8} 行存在差异`)
}

rmSync(tmpDir, { recursive: true, force: true })

console.log("")
if (drift) {
  console.log(`[db:check] 检出 ${drift} 张表存在漂移。`)
  console.log("[db:check] 说明：业务数据的运行期修改（示例数据演练、控制台改数）属正常漂移；")
  console.log("[db:check]      但若字段定义/枚举/默认值与代码不一致，说明种子已更新而库未跟进，可执行 npm run db:reset 重建。")
  process.exit(1)
}
console.log("[db:check] 全部表与代码种子一致，无漂移。")
