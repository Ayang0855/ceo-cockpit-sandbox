// ============================================================
// API 客户端：统一鉴权头、包络解包、错误归一化、降级探测
// ============================================================
const TOKEN_KEY = "ceo-cockpit-token"
const USER_KEY = "ceo-cockpit-user"

export const getToken = () => sessionStorage.getItem(TOKEN_KEY) || ""
export const setToken = (t) => sessionStorage.setItem(TOKEN_KEY, t)
export const getUser = () => {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null") } catch { return null }
}
export const setUser = (u) => sessionStorage.setItem(USER_KEY, JSON.stringify(u))
export const clearAuth = () => {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

// 后端可用性：探测失败则整个控制台进入演示降级模式
let apiAvailable = null
const availableListeners = new Set()
export const isApiAvailable = () => apiAvailable === true

// ------------------------------------------------------------
// 后端地址解析
//   控制台与后端可能不同源（例如前端跑在 GitHub Pages、后端跑在本机 8787），
//   因此不再写死同源相对路径，而是按候选顺序逐个探测：
//     1) ?api=<url> 显式指定   2) 上次探测成功的地址（localStorage）
//     3) 同源（单端口发布 / 开发态 Vite 代理，优先级最高、无跨域）
//     4) 当前主机名:8787（局域网 IP 访问）   5) localhost / 127.0.0.1:8787
//   localhost 属「可信来源」，浏览器允许 https 页面请求 http://localhost。
// ------------------------------------------------------------
const API_BASE_KEY = "ceo-cockpit-api-base"
let apiBase = null

function candidateBases() {
  const list = []
  const qs = new URLSearchParams(location.search)
  const override = qs.get("api")
  if (override) list.push(override.replace(/\/+$/, ""))
  // 同源优先：单端口发布 / 开发态 Vite 代理时天然可用，且无跨域开销
  list.push("")
  try {
    const saved = localStorage.getItem(API_BASE_KEY)
    if (saved) list.push(saved.replace(/\/+$/, ""))
  } catch { /* 忽略 */ }

  // 本机后端：后端启动端口顺延顺序为 8787 → 8899 → 8900 → …
  const PORTS = [8787, 8899, 8900]
  const host = location.hostname
  const hosts = []
  if (host && host !== "localhost" && host !== "127.0.0.1") hosts.push(host) // 局域网 IP 访问
  hosts.push("localhost", "127.0.0.1")
  for (const h of hosts) for (const p of PORTS) list.push(`http://${h}:${p}`)

  const seen = new Set()
  return list.filter((b) => {
    const k = b || "__same_origin__"
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function probeBase(base, timeoutMs = 1500) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(`${base}/api/v1/monitor/health`, { cache: "no-store", signal: ctrl.signal })
    if (!r.ok) return false
    const j = await r.json().catch(() => null)
    return j?.code === 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** 请求前确保已解析出可用地址（首次请求会先探测一次） */
async function ensureBase() {
  if (apiBase === null && apiAvailable !== false) await probeApi()
  return apiBase ?? ""
}

/** 订阅可用性翻转（false→true 或 true→false），返回取消订阅函数 */
export function onApiAvailabilityChange(cb) {
  availableListeners.add(cb)
  return () => availableListeners.delete(cb)
}
function setAvailability(v) {
  const prev = apiAvailable
  apiAvailable = v
  // 首次探测（null → true/false）同样广播：数据层需要从「回退态」切到「真实态」
  if (prev !== v) availableListeners.forEach((cb) => { try { cb(v) } catch { /* 忽略订阅方异常 */ } })
}

export async function probeApi() {
  // 已解析出的地址仍然可用则直接复用，避免每次路由切换都重新探测
  if (apiBase !== null) {
    if (await probeBase(apiBase)) { setAvailability(true); return true }
    apiBase = null
  }
  for (const base of candidateBases()) {
    if (await probeBase(base)) {
      apiBase = base
      // 同源（base 为空）无需持久化，下次照样是同源优先
      try {
        if (base) localStorage.setItem(API_BASE_KEY, base)
        else localStorage.removeItem(API_BASE_KEY)
      } catch { /* 隐私模式忽略 */ }
      setAvailability(true)
      return true
    }
  }
  setAvailability(false)
  return false
}

/** 供 UI 展示当前实际使用的后端地址 */
export const getApiBase = () => apiBase
/** 用户手动指定后端地址（写入后立即重探） */
export function setApiBase(base) {
  apiBase = base === null ? null : String(base).replace(/\/+$/, "")
  try {
    if (apiBase === null) localStorage.removeItem(API_BASE_KEY)
    else localStorage.setItem(API_BASE_KEY, apiBase)
  } catch { /* 忽略 */ }
  return probeApi()
}

export class ApiError extends Error {
  constructor(code, message, traceId, details) {
    super(message)
    this.code = code
    this.traceId = traceId
    this.details = details
  }
}

async function request(method, path, { body, params, raw } = {}) {
  let base = await ensureBase()
  let qsSuffix = ""
  if (params) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.append(k, v)
    })
    const s = qs.toString()
    if (s) qsSuffix = `?${s}`
  }
  let url = `${base}/api/v1${path}${qsSuffix}`
  const headers = { "Content-Type": "application/json" }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const init = { method, headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }

  let res
  try {
    res = await fetch(url, init)
  } catch {
    // 网络层失败：后端可能刚被重启并顺延到其他端口，清缓存重探一次再重试
    apiBase = null
    if (await probeApi()) {
      base = apiBase ?? ""
      url = `${base}/api/v1${path}${qsSuffix}`
      try { res = await fetch(url, init) } catch { res = undefined }
    }
    if (!res) {
      setAvailability(false)
      throw new ApiError(-1, "无法连接后端服务（已切换为演示模式）", null, null)
    }
  }
  setAvailability(true)

  let payload = null
  try { payload = await res.json() } catch { /* 非 JSON 响应 */ }
  if (!payload) throw new ApiError(res.status, `服务返回了非 JSON 响应（HTTP ${res.status}）`, null, null)
  if (payload.code !== 0) {
    if (payload.code === 40100 || payload.code === 40101 || payload.code === 40102) {
      clearAuth()
    }
    throw new ApiError(payload.code, payload.message, payload.traceId, payload.details)
  }
  return raw ? payload : payload.data
}

export const api = {
  get: (p, params) => request("GET", p, { params }),
  post: (p, body) => request("POST", p, { body }),
  patch: (p, body) => request("PATCH", p, { body }),
  put: (p, body) => request("PUT", p, { body }),
  del: (p, params) => request("DELETE", p, { params }),

  // ---- 认证 ----
  login: (username, password) => request("POST", "/auth/login", { body: { username, password } }),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),
  changePassword: (oldPassword, newPassword) => request("POST", "/auth/change-password", { body: { oldPassword, newPassword } }),

  // ---- 用户 ----
  users: (params) => request("GET", "/users", { params }),
  user: (id) => request("GET", `/users/${id}`),
  createUser: (body) => request("POST", "/users", { body }),
  updateUser: (id, body) => request("PATCH", `/users/${id}`, { body }),
  deleteUser: (id) => request("DELETE", `/users/${id}`),
  resetPassword: (id, body) => request("POST", `/users/${id}/reset-password`, { body }),
  unlockUser: (id) => request("POST", `/users/${id}/unlock`),

  // ---- 角色权限 ----
  roles: () => request("GET", "/roles"),
  permissions: () => request("GET", "/roles/permissions"),
  createRole: (body) => request("POST", "/roles", { body }),
  updateRole: (id, body) => request("PATCH", `/roles/${id}`, { body }),
  deleteRole: (id) => request("DELETE", `/roles/${id}`),
  setRolePermissions: (id, permissionCodes) => request("PUT", `/roles/${id}/permissions`, { body: { permissionCodes } }),

  // ---- 数据管理 ----
  resources: () => request("GET", "/data"),
  list: (resource, params) => request("GET", `/data/${resource}`, { params }),
  detail: (resource, id) => request("GET", `/data/${resource}/${id}`),
  create: (resource, body) => request("POST", `/data/${resource}`, { body }),
  update: (resource, id, body) => request("PATCH", `/data/${resource}/${id}`, { body }),
  remove: (resource, id) => request("DELETE", `/data/${resource}/${id}`),

  // ---- 日志 ----
  logSummary: () => request("GET", "/logs/summary"),
  auditLogs: (params) => request("GET", "/logs/audit", { params }),
  loginLogs: (params) => request("GET", "/logs/login", { params }),
  purgeLogs: (days) => request("DELETE", "/logs/retention", { params: { days } }),

  // ---- 监控 ----
  monitorOverview: () => request("GET", "/monitor/overview"),
  endpoints: () => request("GET", "/monitor/endpoints"),
  series: (hours) => request("GET", "/monitor/series", { params: { hours } }),
  alerts: () => request("GET", "/monitor/alerts"),

  // ---- 配置 ----
  configs: (params) => request("GET", "/configs", { params }),
  saveConfig: (key, value) => request("PUT", `/configs/${key}`, { body: { value } }),
  saveConfigsBatch: (items) => request("PUT", "/configs", { body: { items } }),
  createConfig: (body) => request("POST", "/configs", { body }),
  deleteConfig: (key) => request("DELETE", `/configs/${key}`),

  // ---- 驾驶舱（公开只读聚合，未登录也可读） ----
  cockpitOverview: () => request("GET", "/cockpit/overview"),
  cockpitCustomers: (params) => request("GET", "/cockpit/customers", { params }),
}
