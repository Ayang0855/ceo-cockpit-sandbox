// ============================================================
// 认证模块  /api/v1/auth
// ============================================================
import { Router } from "express"
import { db, logLogin, now } from "../db.js"
import { ApiError, ERR } from "../lib/errors.js"
import { ok } from "../lib/resp.js"
import { hashPassword, signToken, verifyPassword } from "../lib/security.js"
import { authenticate, clientIp } from "../middleware/index.js"
import { validate } from "../middleware/index.js"

const router = Router()

const cfgNum = (key, dflt) => {
  const row = db.prepare("SELECT value FROM configs WHERE key = ?").get(key)
  const n = Number(row?.value)
  return Number.isFinite(n) && n > 0 ? n : dflt
}

function permsOf(roleId) {
  return db.prepare("SELECT p.code, p.name, p.module FROM role_permissions rp JOIN permissions p ON p.code = rp.permission_code WHERE rp.role_id = ? ORDER BY p.sort")
    .all(roleId)
}

function publicUser(row) {
  return {
    id: row.id, username: row.username, displayName: row.display_name,
    email: row.email, phone: row.phone, deptId: row.dept_id,
    roleId: row.role_id, roleName: row.role_name, roleCode: row.role_code,
    status: row.status, mustChangePassword: !!row.must_change,
    lastLoginAt: row.last_login_at, createdAt: row.created_at,
  }
}

// POST /api/v1/auth/login  账号密码登录
router.post("/login", validate({
  username: { required: true, maxLen: 64 },
  password: { required: true, minLen: 6, maxLen: 128 },
}), (req, res, next) => {
  const { username, password } = req.validated
  const ip = clientIp(req)
  const ua = req.get("User-Agent")
  const row = db.prepare(`SELECT u.*, r.code AS role_code, r.name AS role_name
    FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ?`).get(username)

  const maxFail = cfgNum("security.maxLoginFail", 5)
  const lockMin = cfgNum("security.lockMinutes", 10)

  // 统一失败口径，避免账号枚举
  const bad = () => {
    logLogin({ username, userId: row?.id, ip, ua, result: "fail", reason: "BAD_CREDENTIALS" })
    return next(new ApiError(ERR.BAD_CREDENTIALS))
  }

  if (!row) return bad()
  if (row.locked_until && row.locked_until > Date.now()) {
    logLogin({ username, userId: row.id, ip, ua, result: "fail", reason: "LOCKED" })
    const mins = Math.ceil((row.locked_until - Date.now()) / 60000)
    return next(new ApiError(ERR.ACCOUNT_LOCKED, `账号已锁定，请 ${mins} 分钟后再试`))
  }
  if (row.status !== "active") {
    logLogin({ username, userId: row.id, ip, ua, result: "fail", reason: "DISABLED" })
    return next(new ApiError(ERR.ACCOUNT_DISABLED))
  }
  if (!verifyPassword(password, row.salt, row.password_hash)) {
    const failCount = row.fail_count + 1
    const locked = failCount >= maxFail
    db.prepare("UPDATE users SET fail_count = ?, locked_until = ?, updated_at = ? WHERE id = ?")
      .run(locked ? 0 : failCount, locked ? Date.now() + lockMin * 60_000 : 0, now(), row.id)
    logLogin({ username, userId: row.id, ip, ua, result: "fail", reason: locked ? "LOCKED" : "BAD_CREDENTIALS" })
    if (locked) return next(new ApiError(ERR.ACCOUNT_LOCKED, `连续失败 ${maxFail} 次，账号已锁定 ${lockMin} 分钟`))
    return bad()
  }

  const ttl = cfgNum("security.sessionTtl", 7200)
  const { token, exp } = signToken({ sub: row.id, uname: row.username, role: row.role_code }, ttl)
  db.prepare("UPDATE users SET fail_count = 0, locked_until = 0, last_login_at = ?, last_login_ip = ?, updated_at = ? WHERE id = ?")
    .run(now(), ip, now(), row.id)
  logLogin({ username, userId: row.id, ip, ua, result: "success" })

  return ok(res, {
    token,
    tokenType: "Bearer",
    expiresIn: ttl,
    expiresAt: new Date(exp * 1000).toISOString(),
    user: publicUser(row),
    permissions: permsOf(row.role_id).map((p) => p.code),
  })
})

// POST /api/v1/auth/logout  客户端丢弃令牌；服务端记录审计
router.post("/logout", authenticate, (req, res) => ok(res, { loggedOut: true, at: now() }))

// GET /api/v1/auth/me  当前用户与权限
router.get("/me", authenticate, (req, res) => {
  const row = db.prepare(`SELECT u.*, r.code AS role_code, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`).get(req.actor.id)
  return ok(res, {
    user: publicUser(row),
    permissions: permsOf(row.role_id),
    permissionCodes: [...req.actor.permissions],
  })
})

// POST /api/v1/auth/change-password  自助修改密码
router.post("/change-password", authenticate, validate({
  oldPassword: { required: true, minLen: 6, maxLen: 128 },
  newPassword: { required: true, minLen: 8, maxLen: 128 },
}), (req, res, next) => {
  const { oldPassword, newPassword } = req.validated
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.actor.id)
  if (!verifyPassword(oldPassword, row.salt, row.password_hash)) {
    return next(new ApiError(ERR.BAD_CREDENTIALS, "原密码不正确"))
  }
  if (oldPassword === newPassword) {
    return next(new ApiError(ERR.STATE_CONFLICT, "新密码不能与原密码相同"))
  }
  const { salt, hash } = hashPassword(newPassword)
  db.prepare("UPDATE users SET password_hash = ?, salt = ?, must_change = 0, updated_at = ? WHERE id = ?")
    .run(hash, salt, now(), req.actor.id)
  return ok(res, { changed: true, reloginRequired: true })
})

export default router
