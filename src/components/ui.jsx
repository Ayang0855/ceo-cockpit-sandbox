import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

// ---------- 品牌 ----------
export function Brand({ sub = "新一代公司操作系统 · COMPANY OS", prod = "CEO 驾驶舱", to = "/" }) {
  return (
    <Link className="brand" to={to}>
      <span className="brand-mark" aria-hidden="true"><span /></span>
      <span className="txt">
        <b>星澜智驭 <i className="prod">{prod}</i></b>
        {sub && <span>{sub}</span>}
      </span>
    </Link>
  )
}

// ---------- 眼睛按钮（金额可见性） ----------
export function EyeToggle({ visible, onToggle }) {
  return (
    <button className="ava-eye" title={visible ? "隐藏金额" : "显示金额"} onClick={onToggle}>
      {visible ? (
        <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>
      ) : (
        <svg viewBox="0 0 24 24"><path d="M3 4l18 16" /><path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.2 8.3A16.4 16.4 0 0 0 2 12s3.5 6 10 6a9.9 9.9 0 0 0 3.4-.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
      )}
    </button>
  )
}

// ---------- 波形画布 ----------
export function Wave({ seed = 1, dark = true, className = "" }) {
  const ref = useRef(null)
  useEffect(() => {
    let alive = true
    const paint = () => {
      import("../lib/util.js").then(({ drawWave }) => {
        if (alive) drawWave(ref.current, seed, dark ? "#9FE8EE" : "#1B3DE4", dark)
      })
    }
    paint()
    const t = setInterval(paint, 2600)
    return () => { alive = false; clearInterval(t) }
  }, [seed, dark])
  return <canvas ref={ref} className={className} />
}

// ---------- 空状态 ----------
export function EmptyState({ text }) {
  return <div className="empty-hint">{text}</div>
}

// ---------- 分页 ----------
export function Pagination({ page, pages, onPage }) {
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
      <span>第 {page}/{pages} 页</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button>
    </div>
  )
}

// ---------- 标签 ----------
export function Tag({ text }) {
  const tone = text === "需介入" || text === "风险" ? "red" : text === "需关注" ? "amber" : ""
  return <span className={`chip ${tone ? `chip-${tone}` : ""}`}>{text}</span>
}

// ---------- 通用页头 ----------
export function GuiHeader({ crumb = [], right = null, accent = null }) {
  const nav = useNavigate()
  return (
    <>
      <header className="gui-top">
        <Brand />
        <nav className="crumb">
          <a onClick={() => nav("/")}>首页</a>
          {crumb.map((c, i) => (
            <span key={i} style={{ display: "contents" }}>
              <span className="sep">›</span>
              {c.to ? <a onClick={() => nav(c.to)}>{c.t}</a> : <b>{c.t}</b>}
            </span>
          ))}
        </nav>
        <div className="right">{right}</div>
      </header>
      {accent && <div className="accent-bar" style={{ "--dept": accent }} />}
    </>
  )
}
