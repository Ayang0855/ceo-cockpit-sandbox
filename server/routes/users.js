// ============================================================
// 用户管理  /api/v1/users        权限点：user:*
// ============================================================
import { Router } from "express"
import { db, now } from "../db.js"
import { ApiError, ERR } from "../lib/errors.js"
import { ok, page } from "../lib/resp.js"
import { hashPassword, newId } from "../lib/security.js"
import { authenticate, requirePerm, validate } from "../middleware/index.js"

const router = Router()
router.use(authenticate)

const SELECT_USER = `SELECT u.*, r.code AS role_code, r.name AS role_name, d.name AS dept_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN departments d ON d.id = u.dept_id`

const publicUser = (row) => ({
  id: row.id, username: row.username, displayName: row.display_name,
  email: row.email, phone: row.phone,
  deptId: row.dept_id, deptName: row.dept_name,
  roleId: row.role_id, roleCode: row.role_code, roleName: row.role_name,
  status: row.status, mustChangePassword: !!row.must_change,
  failCount: row.fail_count, lockedUntil: row.locked_until || null,
  lastLoginAt: row.last_login_at, lastLoginIp: row.last_login_ip,
  createdAt: row.created_at, updatedAt: row.updated_at, createdBy: row.created_by,
})

const parsePage = (q) => {
  const p = Math.max(1, Number(q.page) || 1)
  const size = Math.min(100, Math.max(1, Number(q.pageSize) || 20))
  return { p, size }
}

// GET /api/v1/users  分页 + 关键字 + 角色/状态筛选
router.get("/", requirePerm("user:read"), (req, res, next) => {
  const { p, size } = parsePage(req.query)
  const where = []
  const args = []
  if (req.query.keyword) {
    where.push("(u.username LIKE ? OR u.display_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)")
    const k = `%${req.query.keyword}%`
    args.push(k, k, k, k)
  }
  if (req.query.roleId) { where.push("u.role_id = ?"); args.push(req.query.roleId) }
  if (req.query.status) { where.push("u.status = ?"); args.push(req.query.status) }
  if (req.query.deptId) { where.push("u.dept_id = ?"); args.push(Number(req.query.deptId)) }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : ""

  const total = db.prepare(`SELECT COUNT(*) AS c FROM users u${sql}`).get(...args).c
  const rows = db.prepare(`${SELECT_USER}${sql} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`)
    .all(...args, size, (p - 1) * size)
  return ok(res, page(rows.map(publicUser), total, p, size))
})

// GET /api/v1/users/:id  详情（含权限点）
router.get("/:id", requirePerm("user:read"), (req, res, next) => {
  const row = db.prepare(`${SELECT_USER} WHERE u.id = ?`).get(req.params.id)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, "用户不存在"))
  const perms = db.prepare("SELECT permission_code FROM role_permissions WHERE role_id = ?").all(row.role_id).map((x) => x.permission_code)
  return ok(res, { ...publicUser(row), permissions: perms })
})

// POST /api/v1/users  新建用户
router.post("/", requirePerm("user:create"), validate({
  username: { required: true, minLen: 3, maxLen: 32, pattern: /^[a-zA-Z0-9_.-]+$/, message: "用户名仅支持字母、数字、下划线、点与短横线" },
  displayName: { required: true, maxLen: 32 },
  password: { required: true, minLen: 8, maxLen: 128 },
  email: { default: "", maxLen: 64, pattern: /^$|^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "邮箱格式不合法" },
  phone: { default: "", maxLen: 20, pattern: /^$|^1[3-9]\d{9}$/, message: "手机号格式不合法" },
  roleId: { required: true },
  deptId: { type: "number" },
  status: { default: "active", enum: ["active", "disabled"] },
  mustChangePassword: { type: "boolean", default: true },
}), (req, res, next) => {
  const b = req.validated
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(b.username)) {
    return next(new ApiError(ERR.DUPLICATE, `用户名 ${b.username} 已存在`))
  }
  if (!db.prepare("SELECT 1 FROM roles WHERE id = ?").get(b.roleId)) {
    return next(new ApiError(ERR.PARAM_INVALID, "指定的角色不存在"))
  }
  const { salt, hash } = hashPassword(b.password)
  const id = newId("u")
  db.prepare(`INSERT INTO users
    (id,username,display_name,email,phone,password_hash,salt,dept_id,role_id,status,must_change,created_at,updated_at,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, b.username, b.displayName, b.email, b.phone, hash, salt, b.deptId ?? null, b.roleId,
      b.status, b.mustChangePassword ? 1 : 0, now(), now(), req.actor.id)
  const row = db.prepare(`${SELECT_USER} WHERE u.id = ?`).get(id)
  return res.status(201).json({ code: 0, message: "ok", data: publicUser(row), traceId: res.locals.traceId, ts: Date.now() })
})

// PATCH /api/v1/users/:id  编辑用户
router.patch("/:id", requirePerm("user:update"), validate({
  displayName: { maxLen: 32 },
  email: { maxLen: 64, pattern: /^$|^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "邮箱格式不合法" },
  phone: { maxLen: 20, pattern: /^$|^1[3-9]\d{9}$/, message: "手机号格式不合法" },
  roleId: {},
  deptId: { type: "number" },
  status: { enum: ["active", "disabled"] },
}), (req, res, next) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, "用户不存在"))
  const b = req.validated
  if (b.roleId && !db.prepare("SELECT 1 FROM roles WHERE id = ?").get(b.roleId)) {
    return next(new ApiError(ERR.PARAM_INVALID, "指定的角色不存在"))
  }
  // 保护：不允许把自己降级或停用，避免把自己锁在门外
  if (row.id === req.actor.id && b.roleId && b.roleId !== row.role_id) {
    return next(new ApiError(ERR.STATE_CONFLICT, "不能修改自己的角色"))
  }
  if (row.id === req.actor.id && b.status === "disabled") {
    return next(new ApiError(ERR.STATE_CONFLICT, "不能停用当前登录账号"))
  }
  // 保护：系统唯一超级管理员不可被降级/停用
  const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role_id = 'role_super_admin' AND status = 'active'").get().c
  const isLastAdmin = row.role_id === "role_super_admin" && adminCount <= 1
  if (isLastAdmin && (b.roleId && b.roleId !== "role_super_admin")) {
    return next(new ApiError(ERR.ROLE_PROTECTED, "系统至少需要保留一个启用状态的超级管理员"))
  }
  if (isLastAdmin && b.status === "disabled") {
    return next(new ApiError(ERR.ROLE_PROTECTED, "系统至少需要保留一个启用状态的超级管理员"))
  }

  const sets = []
  const args = []
  const map = { displayName: "display_name", email: "email", phone: "phone", roleId: "role_id", deptId: "dept_id", status: "status" }
  Object.entries(map).forEach(([k, col]) => {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); args.push(b[k]) }
  })
  if (!sets.length) return next(new ApiError(ERR.PARAM_INVALID, "没有需要更新的字段"))
  sets.push("updated_at = ?"); args.push(now())
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...args, row.id)
  return ok(res, publicUser(db.prepare(`${SELECT_USER} WHERE u.id = ?`).get(row.id)))
})

// DELETE /api/v1/users/:id
router.delete("/:id", requirePerm("user:delete"), (req, res, next) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, "用户不存在"))
  if (row.id === req.actor.id) return next(new ApiError(ERR.STATE_CONFLICT, "不能删除当前登录账号"))
  const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role_id = 'role_super_admin' AND status = 'active'").get().c
  if (row.role_id === "role_super_admin" && adminCount <= 1) {
    return next(new ApiError(ERR.ROLE_PROTECTED, "不能删除系统唯一的超级管理员"))
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(row.id)
  return ok(res, { deleted: true, id: row.id })
})

// POST /api/v1/users/:id/reset-password
router.post("/:id/reset-password", requirePerm("user:reset_password"), validate({
  newPassword: { required: true, minLen: 8, maxLen: 128 },
  mustChangePassword: { type: "boolean", default: true },
}), (req, res, next) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, "用户不存在"))
  const { salt, hash } = hashPassword(req.validated.newPassword)
  db.prepare("UPDATE users SET password_hash = ?, salt = ?, must_change = ?, fail_count = 0, locked_until = 0, updated_at = ? WHERE id = ?")
    .run(hash, salt, req.validated.mustChangePassword ? 1 : 0, now(), row.id)
  return ok(res, { reset: true, userId: row.id, requireChangeOnNextLogin: !!req.validated.mustChangePassword })
})

// POST /api/v1/users/:id/unlock  解除登录锁定
router.post("/:id/unlock", requirePerm("user:update"), (req, res, next) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id)
  if (!row) return next(new ApiError(ERR.NOT_FOUND, "用户不存在"))
  db.prepare("UPDATE users SET fail_count = 0, locked_until = 0, updated_at = ? WHERE id = ?").run(now(), row.id)
  return ok(res, { unlocked: true, userId: row.id })
})

export default router
