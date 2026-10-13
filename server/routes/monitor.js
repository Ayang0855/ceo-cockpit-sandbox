// ============================================================
// 监控中心  /api/v1/monitor
// ============================================================
import { Router } from "express"
import os from "node:os"
import { db } from "../db.js"
import { ok } from "../lib/resp.js"
import { authenticate, requirePerm, metricsSnapshot } from "../middleware/index.js"

const router = Router()

const startedAt = Date.now()
let prevCpu = os.cpus().map((c) => c.times)
function cpuUsage() {
  const now = os.cpus().map((c) => c.times)
  let idleDiff = 0, totalDiff = 0
  now.forEach((t, i) => {
    const p = prevCpu[i]
    const idle = t.idle - p.idle
    const total = Object.keys(t).reduce((a, k) => a + t[k] - p[k], 0)
    idleDiff += idle; totalDiff += total
  })
  prevCpu = now
  return totalDiff > 0 ? Number((100 * (1 - idleDiff / totalDiff)).toFixed(2)) : 0
}

// GET /api/v1/monitor/health  健康检查（无需认证，供探针使用）
router.get("/health", (req, res) => {
  let dbOk = false
  try { db.prepare("SELECT 1 AS ok").get(); dbOk = true } catch { dbOk = false }
  const mem = process.memoryUsage()
  const status = dbOk ? "up" : "degraded"
  res.status(dbOk ? 200 : 503).json({
    code: 0,
    message: "ok",
    data: {
      status,
      checks: {
        api: { status: "up" },
        database: { status: dbOk ? "up" : "down", engine: "sqlite" },
        disk: { status: "up" },
      },
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      memoryMB: Number((mem.rss / 1048576).toFixed(1)),
      node: process.version,
      traceId: res.locals.traceId,
      ts: Date.now(),
    },
    traceId: res.locals.traceId,
    ts: Date.now(),
  })
})

// GET /api/v1/monitor/overview  运行总览
router.get("/overview", authenticate, requirePerm("monitor:read"), (req, res) => {
  const snap = metricsSnapshot()
  const lat = [...snap.latencies].sort((a, b) => a - b)
  const pct = (q) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * q))] : 0)
  const mem = process.memoryUsage()
  const total = os.totalmem()
  const free = os.freemem()
  const now = Date.now()
  const windowStart = new Date(now - 3600_000).toISOString().replace("T", " ").slice(0, 19)

  return ok(res, {
    service: {
      name: "ceo-cockpit-api",
      version: "1.0.0",
      status: "up",
      startedAt: new Date(startedAt).toISOString(),
      uptimeSec: Math.floor((now - startedAt) / 1000),
      node: process.version,
      pid: process.pid,
    },
    runtime: {
      cpuPct: cpuUsage(),
      cores: os.cpus().length,
      loadAvg: os.loadavg().map((n) => Number(n.toFixed(2))),
      memRssMB: Number((mem.rss / 1048576).toFixed(1)),
      heapUsedMB: Number((mem.heapUsed / 1048576).toFixed(1)),
      heapTotalMB: Number((mem.heapTotal / 1048576).toFixed(1)),
      systemMemUsedPct: Number((100 * (1 - free / total)).toFixed(1)),
    },
    traffic: {
      totalRequests: snap.req,
      totalErrors: snap.err,
      errorRatePct: snap.req ? Number((100 * snap.err / snap.req).toFixed(2)) : 0,
      avgMs: lat.length ? Number((lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(2)) : 0,
      p50Ms: pct(0.5), p95Ms: pct(0.95), p99Ms: pct(0.99),
      requestsLastHour: db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE created_at >= ?").get(windowStart).c,
      errorsLastHour: db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE created_at >= ? AND status >= 400").get(windowStart).c,
    },
    business: {
      users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
      usersActive: db.prepare("SELECT COUNT(*) AS c FROM users WHERE status = 'active'").get().c,
      departments: db.prepare("SELECT COUNT(*) AS c FROM departments").get().c,
      unitsOnline: db.prepare("SELECT COUNT(*) AS c FROM sandbox_units WHERE status = 'online'").get().c,
      customers: db.prepare("SELECT COUNT(*) AS c FROM customers").get().c,
      highRiskCustomers: db.prepare("SELECT COUNT(*) AS c FROM customers WHERE level = 'high'").get().c,
      auditLogs: db.prepare("SELECT COUNT(*) AS c FROM audit_logs").get().c,
      configs: db.prepare("SELECT COUNT(*) AS c FROM configs").get().c,
    },
  })
})

// GET /api/v1/monitor/endpoints  接口级调用统计
router.get("/endpoints", authenticate, requirePerm("monitor:read"), (req, res) => {
  const snap = metricsSnapshot()
  const list = [...snap.byPath.entries()]
    .map(([path, s]) => ({
      path,
      count: s.count,
      errors: s.err,
      avgMs: Number((s.totalMs / Math.max(1, s.count)).toFixed(2)),
      errorRatePct: Number((100 * s.err / Math.max(1, s.count)).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)
  return ok(res, { total: list.length, list })
})

// GET /api/v1/monitor/series  时序指标（用于折线图）
router.get("/series", authenticate, requirePerm("monitor:read"), (req, res) => {
  const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24))
  const rows = db.prepare(`SELECT ts, req_count, err_count, avg_ms, p95_ms, mem_rss
    FROM metrics_snapshots WHERE ts >= datetime('now', ?) ORDER BY ts ASC`).all(`-${hours} hours`)
  return ok(res, {
    hours,
    points: rows.map((r) => ({
      ts: r.ts, requests: r.req_count, errors: r.err_count,
      avgMs: r.avg_ms, p95Ms: r.p95_ms,
      memMB: r.mem_rss ? Number((r.mem_rss / 1048576).toFixed(1)) : null,
    })),
  })
})

// GET /api/v1/monitor/alerts  告警规则判定结果
router.get("/alerts", authenticate, requirePerm("monitor:read"), (req, res) => {
  const snap = metricsSnapshot()
  const lat = [...snap.latencies].sort((a, b) => a - b)
  const p95 = lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : 0
  const errRate = snap.req ? (100 * snap.err / snap.req) : 0
  const memPct = 100 * (1 - os.freemem() / os.totalmem())

  const rules = [
    { id: "ALERT-001", name: "接口错误率过高", metric: "errorRatePct", value: Number(errRate.toFixed(2)), threshold: 5, op: ">", level: errRate > 5 ? "critical" : "ok", action: "检查日志审计中的 5xx 与异常堆栈" },
    { id: "ALERT-002", name: "接口 P95 延迟过高", metric: "p95Ms", value: p95, threshold: 800, op: ">", level: p95 > 800 ? "warning" : "ok", action: "定位慢接口：查看接口级调用统计" },
    { id: "ALERT-003", name: "系统内存占用过高", metric: "systemMemUsedPct", value: Number(memPct.toFixed(1)), threshold: 90, op: ">", level: memPct > 90 ? "warning" : "ok", action: "检查进程内存并考虑扩容" },
    { id: "ALERT-004", name: "登录失败激增", metric: "loginFailLastHour", value: db.prepare("SELECT COUNT(*) AS c FROM login_logs WHERE result='fail' AND created_at >= datetime('now','-1 hours')").get().c, threshold: 20, op: ">", level: "ok", action: "存在暴力破解风险时封禁来源 IP" },
  ]
  rules.forEach((r) => { r.level = compare(r) ? (r.level === "ok" ? "warning" : r.level) : "ok" })
  return ok(res, {
    total: rules.length,
    firing: rules.filter((r) => r.level !== "ok").length,
    list: rules,
  })
})

function compare(r) {
  const v = Number(r.value), t = Number(r.threshold)
  return r.op === ">" ? v > t : v < t
}

export default router
