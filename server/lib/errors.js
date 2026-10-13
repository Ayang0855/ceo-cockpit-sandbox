// ============================================================
// 统一错误码与业务异常
//   0        成功
//   400xx    参数与校验
//   401xx    认证
//   403xx    授权
//   404xx    资源
//   409xx    冲突
//   429xx    限流
//   500xx    服务端
// ============================================================

export const ERR = {
  OK: 0,

  PARAM_INVALID: 40000,
  VALIDATION_FAILED: 40001,
  UNSUPPORTED_FIELD: 40002,

  UNAUTHENTICATED: 40100,
  TOKEN_EXPIRED: 40101,
  TOKEN_INVALID: 40102,
  BAD_CREDENTIALS: 40103,
  ACCOUNT_DISABLED: 40104,
  ACCOUNT_LOCKED: 40105,

  FORBIDDEN: 40300,
  ROLE_PROTECTED: 40301,
  BUILTIN_PROTECTED: 40302,

  NOT_FOUND: 40400,

  DUPLICATE: 40900,
  STATE_CONFLICT: 40901,

  RATE_LIMITED: 42900,

  INTERNAL: 50000,
  DB_ERROR: 50001,
}

const MESSAGES = {
  [ERR.OK]: "ok",
  [ERR.PARAM_INVALID]: "请求参数不合法",
  [ERR.VALIDATION_FAILED]: "字段校验未通过",
  [ERR.UNSUPPORTED_FIELD]: "包含不支持的字段",
  [ERR.UNAUTHENTICATED]: "未认证，请先登录",
  [ERR.TOKEN_EXPIRED]: "登录令牌已过期，请重新登录",
  [ERR.TOKEN_INVALID]: "登录令牌无效",
  [ERR.BAD_CREDENTIALS]: "账号或密码错误",
  [ERR.ACCOUNT_DISABLED]: "账号已被禁用，请联系管理员",
  [ERR.ACCOUNT_LOCKED]: "账号因多次登录失败被临时锁定，请稍后再试",
  [ERR.FORBIDDEN]: "当前角色无权执行该操作",
  [ERR.ROLE_PROTECTED]: "内置角色不允许删除或改名",
  [ERR.BUILTIN_PROTECTED]: "内置数据受保护，不允许删除",
  [ERR.NOT_FOUND]: "请求的资源不存在",
  [ERR.DUPLICATE]: "资源已存在",
  [ERR.STATE_CONFLICT]: "当前状态不允许该操作",
  [ERR.RATE_LIMITED]: "请求过于频繁，请稍后再试",
  [ERR.INTERNAL]: "服务器内部错误",
  [ERR.DB_ERROR]: "数据存储异常",
}

export class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message || MESSAGES[code] || "未知错误")
    this.code = code
    this.details = details
    this.httpStatus = httpStatusOf(code)
    this.expose = true
  }
}

function httpStatusOf(code) {
  if (code === ERR.OK) return 200
  const head = Math.floor(code / 100)
  switch (head) {
    case 400: return 400
    case 401: return 401
    case 403: return 403
    case 404: return 404
    case 409: return 409
    case 429: return 429
    default: return 500
  }
}

export const fail = (code, message, details) => new ApiError(code, message, details)
export const messageOf = (code) => MESSAGES[code] || "未知错误"
