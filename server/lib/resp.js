// ============================================================
// 统一响应包络
//   { code, message, data, traceId, ts }
// 成功 code=0；失败 code 为业务错误码（与 HTTP 状态码同时给出）
// ============================================================
import { randomUUID } from "node:crypto"
import { messageOf, ERR } from "./errors.js"

export const newTraceId = () => "tr_" + randomUUID().replace(/-/g, "").slice(0, 20)

export function ok(res, data = null, extra = {}) {
  return res.status(200).json({
    code: ERR.OK,
    message: "ok",
    data,
    traceId: res.locals.traceId,
    ts: Date.now(),
    ...extra,
  })
}

export function page(list, total, p, size) {
  return {
    list,
    total,
    page: p,
    pageSize: size,
    pages: Math.max(1, Math.ceil(total / size)),
  }
}

export function failResp(res, code, message, details = null) {
  return res.status(res.locals.httpStatus || 500).json({
    code,
    message: message || messageOf(code),
    data: null,
    details,
    traceId: res.locals.traceId,
    ts: Date.now(),
  })
}
