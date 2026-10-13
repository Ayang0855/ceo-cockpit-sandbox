#!/usr/bin/env node
// ============================================================
// 数据重置：先备份当前库，再按当前代码种子重建
//   用法：npm run db:reset
//   备份：server/data/backup-<时间戳>.db（含 WAL 已 checkpoint，可直接拷走）
// ============================================================
import { DatabaseSync } from "node:sqlite"
import { existsSync, copyFileSync, rmSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dir = dirname(fileURLToPath(import.meta.url))
const DB_FILE = process.env.CEO_DB_FILE || join(__dir, "../data/cockpit.db")
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const BACKUP = join(dirname(DB_FILE), `backup-${ts}.db`)

if (existsSync(DB_FILE)) {
  // 先把 WAL 落盘，保证备份文件自洽
  try {
    const db = new DatabaseSync(DB_FILE)
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);")
    db.close()
  } catch { /* 库损坏时忽略，仍继续备份 */ }

  copyFileSync(DB_FILE, BACKUP)
  for (const suffix of ["-wal", "-shm"]) {
    if (existsSync(DB_FILE + suffix)) rmSync(DB_FILE + suffix, { force: true })
  }
  rmSync(DB_FILE, { force: true })
  console.log(`[db:reset] 已备份原库 → ${BACKUP}`)
} else {
  console.log(`[db:reset] 未发现已有库（${DB_FILE}），直接新建。`)
}

process.env.CEO_DB_FILE = DB_FILE
const { syncConfigDefinitions } = await import("../db.js")
const r = syncConfigDefinitions()
console.log(`[db:reset] 已按当前代码种子重建：${DB_FILE}`)
console.log(`[db:reset] 配置定义同步：新增 ${r.inserted} 项，更新 ${r.updated} 项`)

const keep = 5
const backups = readdirSync(dirname(DB_FILE)).filter((f) => f.startsWith("backup-") && f.endsWith(".db")).sort().reverse()
backups.slice(keep).forEach((f) => { rmSync(join(dirname(DB_FILE), f), { force: true }) })
if (backups.length > keep) console.log(`[db:reset] 已清理较早备份，保留最近 ${keep} 份`)
console.log(`[db:reset] 默认管理员：admin / admin123456（首次登录需改密）`)
