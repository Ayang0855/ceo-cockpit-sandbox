// ============================================================
// 配置项维护  /api/v1/configs
// ============================================================
import { Router } from "express"
import { db, now } from "../db.js"
import { ApiError, ERR } from "../lib/errors.js"
import { ok } from "../lib/resp.js"
import { authenticate, requirePerm, validate } from "../middleware/index.js"

const router = Router()
router.use(authenticate)

const MASK = "••••••••"
const TYPES = ["string", "number", "boolean", "enum", "json"]

const shape = (r, reveal) => ({
  key: r.key,
  value: r.is_secret && !reveal ? MASK : coerce(r.value, r.type),
  raw: undefined,
  type: r.type,
  group: r.group_name,
  label: r.label,
  description: r.description,
  isSecret: !!r.is_secret,
  editable: !!r.editable,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
})

function coerce(v, type) {
  if (v === null || v === undefined) return null
  if (type === "number") return Number(v)
  if (type === "boolean") return v === "true" || v === "1" || v === true
  if (type === "json") { try { return JSON.parse(v) } catch { return v } }
  return v
}

function serialize(v, type) {
  if (type === "json") return typeof v === "string" ? v : JSON.stringify(v)
  if (type === "boolean") return v ? "true" : "false"
  return String(v)
}

function validateValue(type, value, key) {
  if (type === "number" && Number.isNaN(Number(value))) return `${key} 需要为数字`
  if (type === "boolean" && !["true", "false", true, false, 0, 1].includes(value)) return `${key} 需要为布尔值`
  if (type === "json") { try { JSON.parse(typeof value === "string" ? value : JSON.stringify(value)) } catch { return `${key} 需要为合法 JSON` } }
  return null
}

// GET /api/v1/configs  分组列出（默认脱敏）
router.get("/", requirePerm("config:read"), (req, res) => {
  const reveal = req.query.reveal === "true" && req.actor.permissions.has("config:update")
  const where = []; const args = []
  if (req.query.group) { where.push("group_name = ?"); args.push(req.query.group) }
  if (req.query.keyword) { where.push("(key LIKE ? OR label LIKE ? OR description LIKE ?)"); const k = `%${req.query.keyword}%`; args.push(k, k, k) }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : ""
  const rows = db.prepare(`SELECT * FROM configs${sql} ORDER BY group_name, key`).all(...args)
  const groups = {}
  rows.forEach((r) => {
    groups[r.group_name] = groups[r.group_name] || []
    groups[r.group_name].push(shape(r, reveal))
  })
  return ok(res, {
    total: rows.length,
    masked: !reveal,
    list: rows.map((r) => shape(r, reveal)),
    groups: Object.entries(groups).map(([group, items]) => ({ group, count: items.length, items })),
  })
})

// GET /api/v1/configs/:key
router.get("/:key", requirePerm("config:read"), (req, res, next) => {
  const row = db.prepare("SELECT * FROM configs WHERE key = ?").get(req.params.key)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, `配置项 ${req.params.key} 不存在`))
  const reveal = req.query.reveal === "true" && req.actor.permissions.has("config:update")
  return ok(res, shape(row, reveal))
})

// POST /api/v1/configs  新增配置项
router.post("/", requirePerm("config:update"), validate({
  key: { required: true, maxLen: 64, pattern: /^[a-zA-Z][a-zA-Z0-9._-]*$/, message: "配置键仅支持字母、数字、点、下划线与短横线" },
  value: { required: true },
  type: { default: "string", enum: TYPES },
  group: { default: "general", maxLen: 32 },
  label: { default: "", maxLen: 64 },
  description: { default: "", maxLen: 200 },
  isSecret: { type: "boolean", default: false },
}), (req, res, next) => {
  const b = req.validated
  if (db.prepare("SELECT 1 FROM configs WHERE key = ?").get(b.key)) {
    return next(new ApiError(ERR.DUPLICATE, `配置项 ${b.key} 已存在`))
  }
  const err = validateValue(b.type, b.value, b.key)
  if (err) return next(new ApiError(ERR.PARAM_INVALID, err))
  db.prepare(`INSERT INTO configs(key,value,type,group_name,label,description,is_secret,editable,updated_at,updated_by)
    VALUES(?,?,?,?,?,?,?,1,?,?)`)
    .run(b.key, serialize(b.value, b.type), b.type, b.group, b.label, b.description, b.isSecret ? 1 : 0, now(), req.actor.username)
  const row = db.prepare("SELECT * FROM configs WHERE key = ?").get(b.key)
  return res.status(201).json({ code: 0, message: "ok", data: shape(row, true), traceId: res.locals.traceId, ts: Date.now() })
})

// PUT /api/v1/configs/:key  更新单个配置
router.put("/:key", requirePerm("config:update"), validate({ value: { required: true } }), (req, res, next) => {
  const row = db.prepare("SELECT * FROM configs WHERE key = ?").get(req.params.key)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, `配置项 ${req.params.key} 不存在`))
  if (!row.editable) return next(new ApiError(ERR.BUILTIN_PROTECTED, "该配置项为只读"))
  const err = validateValue(row.type, req.body.value, row.key)
  if (err) return next(new ApiError(ERR.PARAM_INVALID, err))
  db.prepare("UPDATE configs SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?")
    .run(serialize(req.body.value, row.type), now(), req.actor.username, row.key)
  return ok(res, shape(db.prepare("SELECT * FROM configs WHERE key = ?").get(row.key), true))
})

// PUT /api/v1/configs  批量更新
router.put("/", requirePerm("config:update"), (req, res, next) => {
  const items = req.body?.items
  if (!Array.isArray(items) || !items.length) {
    return next(new ApiError(ERR.PARAM_INVALID, "items 必须为非空数组，元素形如 { key, value }"))
  }
  const results = []; const errors = []
  const upd = db.prepare("UPDATE configs SET value = ?, updated_at = ?, updated_by = ? WHERE key = ? AND editable = 1")
  const tx = db.prepare("SELECT * FROM configs WHERE key = ?")
  for (const it of items) {
    const row = tx.get(it.key)
    if (!row) { errors.push({ key: it.key, message: "配置项不存在" }); continue }
    if (!row.editable) { errors.push({ key: it.key, message: "该配置项为只读" }); continue }
    const err = validateValue(row.type, it.value, row.key)
    if (err) { errors.push({ key: it.key, message: err }); continue }
    upd.run(serialize(it.value, row.type), now(), req.actor.username, it.key)
    results.push(shape(db.prepare("SELECT * FROM configs WHERE key = ?").get(it.key), true))
  }
  if (errors.length && !results.length) {
    return next(new ApiError(ERR.VALIDATION_FAILED, errors[0].message, errors))
  }
  return ok(res, { updated: results.length, failed: errors.length, items: results, errors })
})

// DELETE /api/v1/configs/:key
router.delete("/:key", requirePerm("config:update"), (req, res, next) => {
  const row = db.prepare("SELECT * FROM configs WHERE key = ?").get(req.params.key)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, `配置项 ${req.params.key} 不存在`))
  if (!row.editable) return next(new ApiError(ERR.BUILTIN_PROTECTED, "该配置项为只读，不允许删除"))
  if (row.is_secret) return next(new ApiError(ERR.BUILTIN_PROTECTED, "密钥类配置不允许通过接口删除，请在环境变量中轮换"))
  db.prepare("DELETE FROM configs WHERE key = ?").run(row.key)
  return ok(res, { deleted: true, key: row.key })
})

export default router
