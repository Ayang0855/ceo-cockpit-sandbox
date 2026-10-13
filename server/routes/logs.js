// ============================================================
// 日志审计  /api/v1/logs
// ============================================================
import { Router } from "express"
import { db } from "../db.js"
import { ok, page } from "../lib/resp.js"
import { authenticate, requirePerm } from "../middleware/index.js"

const router = Router()
router.use(authenticate)

// GET /api/v1/logs/audit  操作审计日志
router.get("/audit", requirePerm("log:read"), (req, res) => {
  const p = Math.max(1, Number(req.query.page) || 1)
  const size = Math.min(200, Math.max(1, Number(req.query.pageSize) || 20))
  const where = []; const args = []
  if (req.query.module) { where.push("module = ?"); args.push(req.query.module) }
  if (req.query.action) { where.push("action = ?"); args.push(req.query.action) }
  if (req.query.actorId) { where.push("actor_id = ?"); args.push(req.query.actorId) }
  if (req.query.traceId) { where.push("trace_id = ?"); args.push(req.query.traceId) }
  if (req.query.method) { where.push("method = ?"); args.push(req.query.method) }
  if (req.query.onlyError === "true") where.push("status >= 400")
  if (req.query.keyword) {
    where.push("(path LIKE ? OR actor_name LIKE ? OR target_id LIKE ?)")
    const k = `%${req.query.keyword}%`; args.push(k, k, k)
  }
  if (req.query.from) { where.push("created_at >= ?"); args.push(req.query.from) }
  if (req.query.to) { where.push("created_at <= ?"); args.push(req.query.to) }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : ""
  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs${sql}`).get(...args).c
  const rows = db.prepare(`SELECT * FROM audit_logs${sql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, size, (p - 1) * size)
    .map(shapeAudit)
  return ok(res, page(rows, total, p, size))
})

const shapeAudit = (r) => ({
  id: r.id,
  traceId: r.trace_id,
  actorId: r.actor_id,
  actorName: r.actor_name,
  module: r.module,
  action: r.action,
  method: r.method,
  path: r.path,
  targetType: r.target_type,
  targetId: r.target_id,
  ip: r.ip,
  ua: r.ua,
  status: r.status,
  statusText: statusText(r.status),
  errorCode: r.error_code,
  durationMs: r.duration_ms,
  detail: r.detail ? safeParse(r.detail) : null,
  createdAt: r.created_at,
})

// GET /api/v1/logs/login  登录日志
router.get("/login", requirePerm("log:read"), (req, res) => {
  const p = Math.max(1, Number(req.query.page) || 1)
  const size = Math.min(200, Math.max(1, Number(req.query.pageSize) || 20))
  const where = []; const args = []
  if (req.query.result) { where.push("result = ?"); args.push(req.query.result) }
  if (req.query.username) { where.push("username LIKE ?"); args.push(`%${req.query.username}%`) }
  if (req.query.from) { where.push("created_at >= ?"); args.push(req.query.from) }
  if (req.query.to) { where.push("created_at <= ?"); args.push(req.query.to) }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : ""
  const total = db.prepare(`SELECT COUNT(*) AS c FROM login_logs${sql}`).get(...args).c
  const rows = db.prepare(`SELECT * FROM login_logs${sql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, size, (p - 1) * size)
    .map((r) => ({
      id: r.id, username: r.username, userId: r.user_id, ip: r.ip, ua: r.ua,
      result: r.result, resultText: r.result === "success" ? "成功" : "失败",
      reason: r.reason, createdAt: r.created_at,
    }))
  return ok(res, page(rows, total, p, size))
})

// GET /api/v1/logs/summary  日志概览
router.get("/summary", requirePerm("log:read"), (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a).c
  return ok(res, {
    auditTotal: one("SELECT COUNT(*) AS c FROM audit_logs"),
    auditToday: one("SELECT COUNT(*) AS c FROM audit_logs WHERE created_at >= date('now')"),
    auditErrors: one("SELECT COUNT(*) AS c FROM audit_logs WHERE status >= 400"),
    loginTotal: one("SELECT COUNT(*) AS c FROM login_logs"),
    loginFailToday: one("SELECT COUNT(*) AS c FROM login_logs WHERE result = 'fail' AND created_at >= date('now')"),
    topModules: db.prepare(`SELECT module, COUNT(*) AS count FROM audit_logs GROUP BY module ORDER BY count DESC LIMIT 8`).all(),
    topErrors: db.prepare(`SELECT error_code, COUNT(*) AS count FROM audit_logs WHERE error_code IS NOT NULL GROUP BY error_code ORDER BY count DESC LIMIT 8`).all(),
    recentFails: db.prepare(`SELECT username, ip, reason, created_at FROM login_logs WHERE result = 'fail' ORDER BY id DESC LIMIT 8`).all(),
  })
})

// DELETE /api/v1/logs/retention  按保留天数清理（默认取配置项）
router.delete("/retention", requirePerm("log:read"), (req, res) => {
  const cfg = db.prepare("SELECT value FROM configs WHERE key = 'observability.logRetentionDays'").get()
  const days = Math.max(1, Number(req.query.days) || Number(cfg?.value) || 30)
  const a = db.prepare(`DELETE FROM audit_logs WHERE created_at < datetime('now', ?)`).run(`-${days} days`)
  const b = db.prepare(`DELETE FROM login_logs WHERE created_at < datetime('now', ?)`).run(`-${days} days`)
  return ok(res, { retentionDays: days, auditDeleted: Number(a.changes), loginDeleted: Number(b.changes) })
})

export default router

function safeParse(s) { try { return JSON.parse(s) } catch { return s } }
function statusText(s) {
  if (s < 300) return "成功"
  if (s < 400) return "重定向"
  if (s < 500) return "客户端错误"
  return "服务端错误"
}
