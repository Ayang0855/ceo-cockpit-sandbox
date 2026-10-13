import { useCallback, useEffect, useRef, useState } from "react"

// ---------- 简易数据请求 Hook（带竞态保护与手动重载） ----------
export function useFetch(fn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState(null)
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const d = await fnRef.current()
      if (my === seq.current) setData(d)
      return d
    } catch (e) {
      if (my === seq.current) setError(e)
      return null
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (immediate) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload: run, setData }
}

// ---------- 时间格式化：后端返回 "YYYY-MM-DD HH:mm:ss" ----------
export function fmtTime(v, { withDate = true } = {}) {
  if (!v) return "—"
  const s = String(v).replace("T", " ").slice(0, 19)
  const [d, t = ""] = s.split(" ")
  if (!withDate) return t.slice(0, 8) || "—"
  const md = d.slice(5)
  return `${md} ${t.slice(0, 5)}`
}

export function fmtUptime(sec) {
  if (sec === null || sec === undefined) return "—"
  const s = Number(sec)
  if (s < 60) return `${s} 秒`
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h < 24) return `${h} 小时 ${m} 分`
  return `${Math.floor(h / 24)} 天 ${h % 24} 小时`
}

export function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—"
  return Number(n).toLocaleString("zh-CN")
}

// ---------- 分页器 ----------
export function Pager({ page = 1, pageSize = 20, total = 0, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return <div className="c-pager"><span className="sum">共 {total} 条</span></div>
  return (
    <div className="c-pager">
      <span className="sum">共 {total} 条 · {pages} 页</span>
      <button className="c-btn sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
      <span className="cur">{page} / {pages}</span>
      <button className="c-btn sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>下一页</button>
    </div>
  )
}

// ---------- 表单字段 ----------
export function Field({ label, hint, required, children, span }) {
  return (
    <div className="c-field" style={span ? { gridColumn: `span ${span}` } : undefined}>
      {label && <label>{label}{required && <b>*</b>}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export const TONES = ["gray", "blue", "green", "amber", "red", "purple"]

export function statusTone(status) {
  return status === "active" || status === "online" ? "green"
    : status === "disabled" || status === "offline" ? "gray"
      : status === "fail" ? "red" : "blue"
}

export function statusText(status) {
  const m = { active: "启用", disabled: "停用", online: "在线", offline: "离线", success: "成功", fail: "失败" }
  return m[status] || status
}
