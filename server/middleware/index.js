// ============================================================
// 中间件：链路追踪 / 限流 / 认证 / 鉴权 / 审计 / 异常兜底
// ============================================================
import { newTraceId } from "../lib/resp.js"
import { ApiError, ERR } from "../lib/errors.js"
import { verifyToken } from "../lib/security.js"
import { db, audit } from "../db.js"

// ---------- 1. 链路 ID ----------
export function traceId(req, res, next) {
  res.locals.traceId = req.get("X-Trace-Id") || newTraceId()
  res.setHeader("X-Trace-Id", res.locals.traceId)
  next()
}

// ---------- 2. 基础安全响应头 ----------
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "SAMEORIGIN")
  res.setHeader("Referrer-Policy", "no-referrer")
  next()
}

// ---------- 3. 限流（滑动窗口，内存实现） ----------
// max 支持函数：可从 configs 表动态读取阈值（如 security.rateLimitPerMin），
// 使「配置维护」中的限流参数真正生效，无需重启服务。
const buckets = new Map()
export function rateLimit({ windowMs = 60_000, max = 240, key = (req) => req.ip, scope = "global" } = {}) {
  return (req, res, next) => {
    const limit = typeof max === "function" ? max() : max
    const k = `${scope}:${key(req)}`
    const nowMs = Date.now()
    const arr = (buckets.get(k) || []).filter((t) => nowMs - t < windowMs)
    if (arr.length >= limit) {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000))
      res.setHeader("X-RateLimit-Limit", limit)
      res.setHeader("X-RateLimit-Remaining", 0)
      buckets.set(k, arr)
      return next(new ApiError(ERR.RATE_LIMITED, undefined, { retryAfterSec: Math.ceil(windowMs / 1000), limit }))
    }
    arr.push(nowMs)
    buckets.set(k, arr)
    res.setHeader("X-RateLimit-Limit", limit)
    res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - arr.length))
    next()
  }
}

// 从配置表读取数值型配置（带内存缓存，配置更新后 5 秒内生效）
const cfgCache = new Map()
export function configNumber(key, fallback) {
  const hit = cfgCache.get(key)
  if (hit && Date.now() - hit.at < 5000) return hit.value
  let value = fallback
  try {
    const row = db.prepare("SELECT value FROM configs WHERE key = ?").get(key)
    const n = Number(row?.value)
    if (Number.isFinite(n) && n > 0) value = n
  } catch { /* 数据库未就绪时使用默认值 */ }
  cfgCache.set(key, { at: Date.now(), value })
  return value
}

// ---------- 4. 认证 ----------
export function authenticate(req, res, next) {
  const raw = req.get("Authorization") || ""
  const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : ""
  if (!token) return next(new ApiError(ERR.UNAUTHENTICATED))
  const r = verifyToken(token)
  if (!r.ok) {
    return next(new ApiError(r.reason === "TOKEN_EXPIRED" ? ERR.TOKEN_EXPIRED : ERR.TOKEN_INVALID))
  }
  const row = db.prepare(`SELECT u.*, r.code AS role_code, r.name AS role_name
    FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`).get(r.payload.sub)
  if (!row) return next(new ApiError(ERR.TOKEN_INVALID, "令牌对应的账号不存在"))
  if (row.status !== "active") return next(new ApiError(ERR.ACCOUNT_DISABLED))
  if (row.locked_until && row.locked_until > Date.now()) return next(new ApiError(ERR.ACCOUNT_LOCKED))

  const perms = db.prepare("SELECT permission_code FROM role_permissions WHERE role_id = ?").all(row.role_id).map((x) => x.permission_code)
  req.actor = {
    id: row.id, username: row.username, name: row.display_name,
    roleId: row.role_id, roleCode: row.role_code, roleName: row.role_name,
    deptId: row.dept_id, permissions: new Set(perms), mustChange: !!row.must_change,
  }
  res.locals.actor = req.actor
  next()
}

// ---------- 5. 鉴权（权限点） ----------
export const requirePerm = (...codes) => (req, res, next) => {
  const actor = req.actor
  if (!actor) return next(new ApiError(ERR.UNAUTHENTICATED))
  const hit = codes.some((c) => actor.permissions.has(c))
  if (!hit) return next(new ApiError(ERR.FORBIDDEN, `缺少权限：${codes.join(" 或 ")}`))
  next()
}

// ---------- 6. 请求日志 + 指标采样 + 写操作审计 ----------
const metrics = { req: 0, err: 0, latencies: [], startedAt: Date.now(), byPath: new Map() }

export function requestLog(req, res, next) {
  const t0 = Date.now()
  metrics.req += 1
  const pathKey = `${req.method} ${req.route?.path || req.path}`
  const stat = metrics.byPath.get(pathKey) || { count: 0, err: 0, totalMs: 0 }
  stat.count += 1

  res.on("finish", () => {
    const ms = Date.now() - t0
    metrics.latencies.push(ms)
    if (metrics.latencies.length > 500) metrics.latencies.shift()
    stat.totalMs += ms
    const isErr = res.statusCode >= 400
    if (isErr) { metrics.err += 1; stat.err += 1 }
    metrics.byPath.set(pathKey, stat)

    // 仅对已认证的写操作与敏感读操作留痕，避免日志爆炸
    const writeMethods = ["POST", "PUT", "PATCH", "DELETE"]
    const sensitiveRead = req.method === "GET" && /\/api\/v1\/(users|roles|logs|configs)/.test(req.path)
    if ((writeMethods.includes(req.method) || sensitiveRead) && req.actor) {
      const body = { ...req.body }
      delete body.password
      delete body.newPassword
      audit({
        traceId: res.locals.traceId,
        actor: req.actor,
        module: moduleOf(req.path),
        action: actionOf(req.method),
        method: req.method,
        path: req.originalUrl,
        targetType: req.params?.id ? "resource" : null,
        targetId: req.params?.id ?? null,
        ip: clientIp(req),
        ua: req.get("User-Agent"),
        status: res.statusCode,
        errorCode: res.locals.errorCode ?? null,
        durationMs: ms,
        detail: body,
      })
    }
  })
  next()
}

export function moduleOf(p) {
  const m = /\/api\/v1\/([a-z-]+)/.exec(p)
  return m ? m[1] : "system"
}
function actionOf(method) {
  return { GET: "read", POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" }[method] || "unknown"
}
export function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown"
}
export function metricsSnapshot() {
  return metrics
}

// ---------- 7. 异常兜底 ----------
export function notFound(req, res, next) {
  next(new ApiError(ERR.NOT_FOUND, `接口不存在：${req.method} ${req.path}`))
}

export function errorHandler(err, req, res, next) {
  const isApi = new ApiError(err)
  const code = err instanceof ApiError ? err.code : ERR.INTERNAL
  const httpStatus = err instanceof ApiError ? err.httpStatus : 500
  const expose = err.expose !== false
  res.locals.errorCode = code
  res.locals.httpStatus = httpStatus
  if (httpStatus >= 500) {
    console.error(`[${res.locals.traceId}] ${req.method} ${req.originalUrl} ->`, err)
  }
  res.status(httpStatus).json({
    code,
    message: expose && err.message ? err.message : "服务器内部错误",
    data: null,
    details: err.details ?? null,
    traceId: res.locals.traceId,
    ts: Date.now(),
  })
}

// ---------- 8. 参数校验 ----------
export function validate(schema) {
  return (req, res, next) => {
    const errors = []
    const out = {}
    for (const [field, rule] of Object.entries(schema)) {
      let v = req.body?.[field]
      const missing = v === undefined || v === null || v === ""
      if (missing) {
        if (rule.required) { errors.push({ field, message: `${field} 为必填项` }); continue }
        if (rule.default !== undefined) out[field] = rule.default
        continue
      }
      const t = rule.type || "string"
      if (t === "number") {
        const n = Number(v)
        if (Number.isNaN(n)) { errors.push({ field, message: `${field} 必须为数字` }); continue }
        if (rule.min !== undefined && n < rule.min) { errors.push({ field, message: `${field} 不能小于 ${rule.min}` }); continue }
        if (rule.max !== undefined && n > rule.max) { errors.push({ field, message: `${field} 不能大于 ${rule.max}` }); continue }
        v = n
      } else if (t === "boolean") {
        v = v === true || v === "true" || v === 1 || v === "1"
      } else {
        v = String(v)
        if (rule.minLen && v.length < rule.minLen) { errors.push({ field, message: `${field} 长度不能少于 ${rule.minLen}` }); continue }
        if (rule.maxLen && v.length > rule.maxLen) { errors.push({ field, message: `${field} 长度不能超过 ${rule.maxLen}` }); continue }
        if (rule.pattern && !rule.pattern.test(v)) { errors.push({ field, message: rule.message || `${field} 格式不合法` }); continue }
        if (rule.enum && !rule.enum.includes(v)) { errors.push({ field, message: `${field} 只能是 ${rule.enum.join(" / ")}` }); continue }
      }
      out[field] = v
    }
    if (errors.length) return next(new ApiError(ERR.VALIDATION_FAILED, errors[0].message, errors))
    req.validated = out
    next()
  }
}

// ---------- 9. 内存指标定时落盘 ----------
export function startMetricsSampler(intervalMs = 30_000) {
  const timer = setInterval(() => {
    const snap = metricsSnapshot()
    const lat = [...snap.latencies].sort((a, b) => a - b)
    const p95 = lat.length ? lat[Math.floor(lat.length * 0.95) - 1] ?? lat.at(-1) : 0
    const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0
    db.prepare("INSERT INTO metrics_snapshots(ts,cpu_pct,mem_rss,heap_used,req_count,err_count,avg_ms,p95_ms) VALUES(?,?,?,?,?,?,?,?)")
      .run(new Date().toISOString().replace("T", " ").slice(0, 19),
        null, process.memoryUsage().rss, process.memoryUsage().heapUsed,
        snap.req, snap.err, Number(avg.toFixed(2)), Number(p95.toFixed(2)))
    // 保留最近 7 天
    db.prepare("DELETE FROM metrics_snapshots WHERE ts < datetime('now', '-7 days')").run()
  }, intervalMs)
  timer.unref?.()
  return timer
}
