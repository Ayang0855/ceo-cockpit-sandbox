// ============================================================
// 角色与权限  /api/v1/roles  /api/v1/permissions
// ============================================================
import { Router } from "express"
import { db, now } from "../db.js"
import { ApiError, ERR } from "../lib/errors.js"
import { ok } from "../lib/resp.js"
import { newId } from "../lib/security.js"
import { authenticate, requirePerm, validate } from "../middleware/index.js"

const router = Router()
router.use(authenticate)

const withMeta = (r) => {
  const perms = db.prepare("SELECT permission_code FROM role_permissions WHERE role_id = ?").all(r.id).map((x) => x.permission_code)
  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role_id = ?").get(r.id).c
  return {
    id: r.id, code: r.code, name: r.name, description: r.description,
    isBuiltin: !!r.is_builtin, permissionCodes: perms,
    userCount, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

// GET /api/v1/permissions  全量权限点（按模块分组）
router.get("/permissions", requirePerm("role:read", "user:read"), (req, res) => {
  const rows = db.prepare("SELECT code,name,module,description FROM permissions ORDER BY sort").all()
  const groups = {}
  rows.forEach((p) => {
    groups[p.module] = groups[p.module] || []
    groups[p.module].push({ code: p.code, name: p.name, description: p.description })
  })
  return ok(res, {
    total: rows.length,
    list: rows,
    groups: Object.entries(groups).map(([module, items]) => ({ module, items })),
  })
})

// GET /api/v1/roles  角色列表
router.get("/", requirePerm("role:read", "user:read"), (req, res) => {
  const rows = db.prepare("SELECT * FROM roles ORDER BY is_builtin DESC, created_at").all()
  return ok(res, { total: rows.length, list: rows.map(withMeta) })
})

// GET /api/v1/roles/:id
router.get("/:id", requirePerm("role:read"), (req, res, next) => {
  const row = db.prepare("SELECT * FROM roles WHERE id = ? OR code = ?").get(req.params.id, req.params.id)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, "角色不存在"))
  return ok(res, withMeta(row))
})

// POST /api/v1/roles  新建角色
router.post("/", requirePerm("role:update"), validate({
  code: { required: true, minLen: 2, maxLen: 32, pattern: /^[a-z][a-z0-9_]*$/, message: "角色编码仅支持小写字母、数字与下划线，且以字母开头" },
  name: { required: true, maxLen: 32 },
  description: { default: "", maxLen: 200 },
}), (req, res, next) => {
  const b = req.validated
  if (db.prepare("SELECT 1 FROM roles WHERE code = ?").get(b.code)) {
    return next(new ApiError(ERR.DUPLICATE, `角色编码 ${b.code} 已存在`))
  }
  const id = newId("role")
  db.prepare("INSERT INTO roles(id,code,name,description,is_builtin,created_at,updated_at) VALUES(?,?,?,?,0,?,?)")
    .run(id, b.code, b.name, b.description, now(), now())
  return res.status(201).json({ code: 0, message: "ok", data: withMeta(db.prepare("SELECT * FROM roles WHERE id = ?").get(id)), traceId: res.locals.traceId, ts: Date.now() })
})

// PUT /api/v1/roles/:id/permissions  覆盖式更新角色权限
router.put("/:id/permissions", requirePerm("role:update"), validate({
  permissionCodes: { required: true },
}), (req, res, next) => {
  const role = db.prepare("SELECT * FROM roles WHERE id = ? OR code = ?").get(req.params.id, req.params.id)
  if (!role) return next(new ApiError(ERR.NOT_FOUND, "角色不存在"))
  const codes = Array.isArray(req.body.permissionCodes) ? req.body.permissionCodes : []
  if (!codes.length) return next(new ApiError(ERR.PARAM_INVALID, "permissionCodes 至少需要一项"))
  const known = new Set(db.prepare("SELECT code FROM permissions").all().map((p) => p.code))
  const unknown = codes.filter((c) => !known.has(c))
  if (unknown.length) {
    return next(new ApiError(ERR.PARAM_INVALID, `存在未知权限点：${unknown.join(", ")}`))
  }
  // 保护：超级管理员必须保留全部权限点，否则系统可能失去管理能力
  if (role.code === "super_admin") {
    const missing = [...known].filter((c) => !codes.includes(c))
    if (missing.length) return next(new ApiError(ERR.ROLE_PROTECTED, `超级管理员不能移除权限：${missing.join(", ")}`))
  }
  const tx = db.prepare("DELETE FROM role_permissions WHERE role_id = ?")
  const ins = db.prepare("INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)")
  tx.run(role.id)
  codes.forEach((c) => ins.run(role.id, c))
  db.prepare("UPDATE roles SET updated_at = ? WHERE id = ?").run(now(), role.id)
  return ok(res, withMeta(db.prepare("SELECT * FROM roles WHERE id = ?").get(role.id)))
})

// PATCH /api/v1/roles/:id  改名与描述（内置角色不可改）
router.patch("/:id", requirePerm("role:update"), validate({
  name: { maxLen: 32 },
  description: { maxLen: 200 },
}), (req, res, next) => {
  const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(req.params.id)
  if (!role) return next(new ApiError(ERR.NOT_FOUND, "角色不存在"))
  if (role.is_builtin) return next(new ApiError(ERR.ROLE_PROTECTED, "内置角色不允许改名"))
  const b = req.validated
  const sets = []; const args = []
  if (b.name) { sets.push("name = ?"); args.push(b.name) }
  if (b.description !== undefined) { sets.push("description = ?"); args.push(b.description) }
  if (!sets.length) return next(new ApiError(ERR.PARAM_INVALID, "没有需要更新的字段"))
  sets.push("updated_at = ?"); args.push(now())
  db.prepare(`UPDATE roles SET ${sets.join(", ")} WHERE id = ?`).run(...args, role.id)
  return ok(res, withMeta(db.prepare("SELECT * FROM roles WHERE id = ?").get(role.id)))
})

// DELETE /api/v1/roles/:id
router.delete("/:id", requirePerm("role:update"), (req, res, next) => {
  const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(req.params.id)
  if (!role) return next(new ApiError(ERR.NOT_FOUND, "角色不存在"))
  if (role.is_builtin) return next(new ApiError(ERR.ROLE_PROTECTED, "内置角色不允许删除"))
  const used = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role_id = ?").get(role.id).c
  if (used > 0) return next(new ApiError(ERR.STATE_CONFLICT, `该角色下仍有 ${used} 个用户，请先调整后再删除`))
  db.prepare("DELETE FROM roles WHERE id = ?").run(role.id)
  return ok(res, { deleted: true, id: role.id })
})

export default router
