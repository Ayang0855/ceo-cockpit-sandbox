// ============================================================
// JWT（HS256）与密码哈希 —— 仅依赖 node:crypto，无第三方实现
// ============================================================
import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto"

const b64u = (buf) => Buffer.from(buf).toString("base64url")
const unb64u = (s) => Buffer.from(s, "base64url").toString("utf8")

function secret() {
  // 生产环境务必通过环境变量注入；开发环境使用固定回退值以保证重启后令牌可校验
  return process.env.CEO_JWT_SECRET || "ceo-cockpit-dev-secret-change-me"
}

export function signToken(payload, ttlSec = 7200) {
  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + ttlSec, jti: randomUUID() }
  const p1 = b64u(JSON.stringify(header))
  const p2 = b64u(JSON.stringify(body))
  const sig = createHmac("sha256", secret()).update(`${p1}.${p2}`).digest("base64url")
  return { token: `${p1}.${p2}.${sig}`, expiresIn: ttlSec, exp: body.exp }
}

export function verifyToken(token) {
  const parts = String(token || "").split(".")
  if (parts.length !== 3) return { ok: false, reason: "TOKEN_INVALID" }
  const [p1, p2, sig] = parts
  const expect = createHmac("sha256", secret()).update(`${p1}.${p2}`).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "TOKEN_INVALID" }
  let body
  try {
    body = JSON.parse(unb64u(p2))
  } catch {
    return { ok: false, reason: "TOKEN_INVALID" }
  }
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "TOKEN_EXPIRED" }
  return { ok: true, payload: body }
}

// ---------- 密码 ----------
export function hashPassword(plain, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(plain), salt, 64).toString("hex")
  return { salt, hash }
}

export function verifyPassword(plain, salt, hash) {
  if (!salt || !hash) return false
  const calc = scryptSync(String(plain), salt, 64)
  const target = Buffer.from(hash, "hex")
  if (calc.length !== target.length) return false
  return timingSafeEqual(calc, target)
}

export const newId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`
