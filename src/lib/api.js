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
export const isApiAvailable = () => apiAvailable === true
export async function probeApi() {
  try {
    const r = await fetch("/api/v1/monitor/health", { cache: "no-store" })
    apiAvailable = r.ok
  } catch {
    apiAvailable = false
  }
  return apiAvailable
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
  let url = `/api/v1${path}`
  if (params) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.append(k, v)
    })
    const s = qs.toString()
    if (s) url += `?${s}`
  }
  const headers = { "Content-Type": "application/json" }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
  } catch (e) {
    apiAvailable = false
    throw new ApiError(-1, "无法连接后端服务（已切换为演示模式）", null, null)
  }
  apiAvailable = true

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
}
