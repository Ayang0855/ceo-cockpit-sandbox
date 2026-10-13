// ============================================================
// 数据管理  /api/v1/data
//   resources: departments | units | customers | reports
//   统一分页 / 排序 / 关键字 / 状态筛选 + CRUD
// ============================================================
import { Router } from "express"
import { db, now } from "../db.js"
import { ApiError, ERR } from "../lib/errors.js"
import { ok, page } from "../lib/resp.js"
import { newId } from "../lib/security.js"
import { authenticate, requirePerm, validate } from "../middleware/index.js"

const router = Router()
router.use(authenticate)

// 资源注册表：表名、主键、可写字段、可筛字段、可搜索字段、排序白名单
const RESOURCES = {
  departments: {
    table: "departments", pk: "id", idGen: null, label: "部门",
    fields: {
      id: { type: "number", required: true },
      name: { type: "string", required: true, maxLen: 32 },
      code_name: { type: "string", maxLen: 48 },
      color: { type: "string", maxLen: 16 },
      tagline: { type: "string", maxLen: 200 },
      brief: { type: "string", maxLen: 300 },
      status: { type: "string", enum: ["online", "offline"] },
      mcp: { type: "boolean" },
      members: { type: "number", min: 0, max: 100000 },
    },
    filters: ["status", "mcp"], search: ["name", "code_name"], sorts: ["id", "name", "members", "created_at"],
  },
  units: {
    table: "sandbox_units", pk: "id", idGen: "unit", label: "沙盘单位",
    fields: {
      id: { type: "string", required: true, maxLen: 40 },
      name: { type: "string", required: true, maxLen: 64 },
      dept_name: { type: "string", maxLen: 32 },
      kind: { type: "string", enum: ["core", "mine", "forge", "farm", "ammo", "camp", "tower", "other"] },
      pos_x: { type: "number", min: 0, max: 1 },
      pos_y: { type: "number", min: 0, max: 1 },
      scale: { type: "number", min: 0.2, max: 3 },
      status: { type: "string", enum: ["online", "offline"] },
      mcp: { type: "boolean" },
      metrics: { type: "string", maxLen: 500 },
    },
    filters: ["status", "mcp", "kind"], search: ["name", "dept_name"], sorts: ["name", "created_at", "pos_x"],
  },
  customers: {
    table: "customers", pk: "id", idGen: "c", label: "客户",
    fields: {
      id: { type: "string", required: true, maxLen: 40 },
      code: { type: "string", required: true, maxLen: 32 },
      name: { type: "string", required: true, maxLen: 32 },
      owner: { type: "string", maxLen: 32 },
      stage: { type: "string", enum: ["已成交", "方案展示", "需求确认", "初步接洽", "商务谈判"] },
      tags: { type: "string", maxLen: 120 },
      next_follow: { type: "string", maxLen: 32 },
      profiled_at: { type: "string", maxLen: 32 },
      level: { type: "string", enum: ["normal", "high", "vip"] },
    },
    filters: ["stage", "owner", "level"], search: ["name", "code", "owner"], sorts: ["name", "created_at", "stage"],
  },
  reports: {
    table: "reports", pk: "id", idGen: "rep", label: "报告",
    fields: {
      id: { type: "string", required: true, maxLen: 40 },
      kind: { type: "string", enum: ["日志", "任务", "周报", "日报"] },
      title: { type: "string", required: true, maxLen: 80 },
      generated: { type: "string", maxLen: 32 },
      body: { type: "string", maxLen: 8000 },
    },
    filters: ["kind"], search: ["title", "body"], sorts: ["generated", "created_at", "title"],
  },
}

function resOf(req, next) {
  const r = RESOURCES[req.params.resource]
  if (!r) { next(new ApiError(ERR.NOT_FOUND, `不支持的数据资源：${req.params.resource}`)); return null }
  return r
}

const toBool = (cols) => (row) => {
  const out = { ...row }
  cols?.forEach((c) => { if (out[c] !== undefined) out[c] = !!out[c] })
  return out
}

// GET /api/v1/data/:resource  列表
router.get("/:resource", requirePerm("data:read"), (req, res, next) => {
  const R = resOf(req, next); if (!R) return
  const p = Math.max(1, Number(req.query.page) || 1)
  const size = Math.min(200, Math.max(1, Number(req.query.pageSize) || 20))
  const where = []; const args = []

  if (req.query.keyword && R.search.length) {
    where.push(`(${R.search.map((c) => `${c} LIKE ?`).join(" OR ")})`)
    R.search.forEach(() => args.push(`%${req.query.keyword}%`))
  }
  R.filters.forEach((f) => {
    if (req.query[f] !== undefined && req.query[f] !== "") {
      where.push(`${f} = ?`)
      args.push(f === "mcp" ? (req.query[f] === "true" ? 1 : 0) : req.query[f])
    }
  })
  if (req.query.updatedFrom) { where.push("updated_at >= ?"); args.push(req.query.updatedFrom) }

  const sortField = R.sorts.includes(req.query.sort) ? req.query.sort : R.sorts[0]
  const order = String(req.query.order || "asc").toLowerCase() === "desc" ? "DESC" : "ASC"
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : ""

  const total = db.prepare(`SELECT COUNT(*) AS c FROM ${R.table}${sql}`).get(...args).c
  const rows = db.prepare(`SELECT * FROM ${R.table}${sql} ORDER BY ${sortField} ${order} LIMIT ? OFFSET ?`)
    .all(...args, size, (p - 1) * size)
  const boolCols = R.fields.mcp ? ["mcp"] : []
  return ok(res, { resource: req.params.resource, ...page(rows.map(toBool(boolCols)), total, p, size) })
})

// GET /api/v1/data/:resource/:id  详情
router.get("/:resource/:id", requirePerm("data:read"), (req, res, next) => {
  const R = resOf(req, next); if (!R) return
  const row = db.prepare(`SELECT * FROM ${R.table} WHERE ${R.pk} = ?`).get(req.params.id)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, `${R.label}不存在`))
  return ok(res, toBool(["mcp"])(row))
})

function buildWrite(R, body, { partial }) {
  const sets = []; const args = []; const errors = []
  for (const [field, rule] of Object.entries(R.fields)) {
    const has = body[field] !== undefined && body[field] !== null && body[field] !== ""
    if (!has) { if (!partial && rule.required) errors.push(`${field} 为必填项`); continue }
    let v = body[field]
    if (rule.type === "number") {
      v = Number(v)
      if (Number.isNaN(v)) { errors.push(`${field} 必须为数字`); continue }
      if (rule.min !== undefined && v < rule.min) { errors.push(`${field} 不能小于 ${rule.min}`); continue }
      if (rule.max !== undefined && v > rule.max) { errors.push(`${field} 不能大于 ${rule.max}`); continue }
    } else if (rule.type === "boolean") {
      v = v === true || v === "true" || v === 1 || v === "1" ? 1 : 0
    } else {
      v = String(v)
      if (rule.maxLen && v.length > rule.maxLen) { errors.push(`${field} 长度不能超过 ${rule.maxLen}`); continue }
      if (rule.enum && !rule.enum.includes(v)) { errors.push(`${field} 只能是 ${rule.enum.join(" / ")}`); continue }
    }
    sets.push([field, v])
  }
  return { sets, errors }
}

// POST /api/v1/data/:resource  新增
router.post("/:resource", requirePerm("data:create"), (req, res, next) => {
  const R = resOf(req, next); if (!R) return
  const { sets, errors } = buildWrite(R, req.body, { partial: false })
  if (errors.length) return next(new ApiError(ERR.VALIDATION_FAILED, errors[0], errors))

  const cols = sets.map(([c]) => c)
  const vals = sets.map(([, v]) => v)
  if (!cols.includes(R.pk)) {
    cols.unshift(R.pk)
    vals.unshift(`${R.idGen || "row"}_${newId("x").split("_")[1]}`)
  }
  cols.push("created_at", "updated_at"); vals.push(now(), now())
  try {
    db.prepare(`INSERT INTO ${R.table}(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`).run(...vals)
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return next(new ApiError(ERR.DUPLICATE, `${R.label}主键或唯一字段已存在`))
    }
    throw e
  }
  const row = db.prepare(`SELECT * FROM ${R.table} WHERE ${R.pk} = ?`).get(vals[0])
  return res.status(201).json({ code: 0, message: "ok", data: toBool(["mcp"])(row), traceId: res.locals.traceId, ts: Date.now() })
})

// PATCH /api/v1/data/:resource/:id  更新
router.patch("/:resource/:id", requirePerm("data:update"), (req, res, next) => {
  const R = resOf(req, next); if (!R) return
  const row = db.prepare(`SELECT * FROM ${R.table} WHERE ${R.pk} = ?`).get(req.params.id)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, `${R.label}不存在`))
  const { sets, errors } = buildWrite(R, req.body, { partial: true })
  if (errors.length) return next(new ApiError(ERR.VALIDATION_FAILED, errors[0], errors))
  if (!sets.length) return next(new ApiError(ERR.PARAM_INVALID, "没有需要更新的字段"))
  const assign = sets.map(([c]) => `${c} = ?`).join(", ")
  db.prepare(`UPDATE ${R.table} SET ${assign}, updated_at = ? WHERE ${R.pk} = ?`)
    .run(...sets.map(([, v]) => v), now(), req.params.id)
  return ok(res, toBool(["mcp"])(db.prepare(`SELECT * FROM ${R.table} WHERE ${R.pk} = ?`).get(req.params.id)))
})

// DELETE /api/v1/data/:resource/:id
router.delete("/:resource/:id", requirePerm("data:delete"), (req, res, next) => {
  const R = resOf(req, next); if (!R) return
  const row = db.prepare(`SELECT * FROM ${R.table} WHERE ${R.pk} = ?`).get(req.params.id)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, `${R.label}不存在`))
  if (R.table === "departments" && row.id === 600) {
    return next(new ApiError(ERR.BUILTIN_PROTECTED, "总经办为内置核心部门，不允许删除"))
  }
  db.prepare(`DELETE FROM ${R.table} WHERE ${R.pk} = ?`).run(req.params.id)
  return ok(res, { deleted: true, resource: req.params.resource, id: req.params.id })
})

// GET /api/v1/data  资源目录与统计
router.get("/", requirePerm("data:read"), (req, res) => {
  const list = Object.entries(RESOURCES).map(([key, R]) => ({
    resource: key, label: R.label, table: R.table,
    count: db.prepare(`SELECT COUNT(*) AS c FROM ${R.table}`).get().c,
    fields: Object.entries(R.fields).map(([name, r]) => ({ name, type: r.type || "string", required: !!r.required, enum: r.enum || null })),
    filters: R.filters, searchable: R.search, sorts: R.sorts,
  }))
  return ok(res, { total: list.length, list })
})

export default router
