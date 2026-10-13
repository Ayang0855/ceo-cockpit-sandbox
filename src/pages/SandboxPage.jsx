import { useEffect, useRef, useState, useCallback } from "react"
import { Link } from "react-router-dom"
import { Brand, EyeToggle, Wave, ConsoleEntry } from "../components/ui.jsx"
import { idleUnits, flows } from "../data/db.js"
import { useCockpit } from "../lib/dataset.js"
import { WORLD, w2s, drawSandbox, drawMinimap } from "../lib/sandbox-map.js"
import { clockNow, fmtMoney } from "../lib/util.js"

const LEGEND = [
  { kind: "lead", label: "线索流", color: "#7E63BC" },
  { kind: "contract", label: "合同流", color: "#3FB9C7" },
  { kind: "cash", label: "回款流", color: "#C5A227" },
  { kind: "ammo", label: "弹药流", color: "#C44E5C" },
]

export default function SandboxPage() {
  const mapRef = useRef(null)
  const miniRef = useRef(null)
  const camRef = useRef({ cx: WORLD.w / 2, cy: WORLD.h / 2, scale: Math.min(1, 1) })
  const dragRef = useRef(null)
  const [camV, setCamV] = useState({ ...camRef.current })
  const [selected, setSelected] = useState(null)
  const [hover, setHover] = useState(null)
  const [amountVisible, setAmountVisible] = useState(true)
  const [idleOpen, setIdleOpen] = useState(false)
  const [tip, setTip] = useState(null)
  const [sync, setSync] = useState(clockNow())

  // —— 沙盘单位与经营数字来自后端聚合接口 ——
  const { data } = useCockpit()
  const sandboxUnits = data?.units ?? []
  const metrics = data?.metrics ?? { cashActual: 0, cashTarget: 0, gap: 0, completionRate: 0, needIntervention: 0 }
  const todayFollowCount = (() => {
    const d = new Date()
    const p = (n) => String(n).padStart(2, "0")
    const today = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
    return (data?.customers ?? []).filter((c) => String(c.nextFollow || "").startsWith(today)).length
  })()

  useEffect(() => {
    const t = setInterval(() => setSync(clockNow()), 1000)
    return () => clearInterval(t)
  }, [])

  // 主渲染循环
  useEffect(() => {
    const canvas = mapRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    let raf, alive = true
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)
    const loop = (t) => {
      if (!alive) return
      drawSandbox(ctx, window.innerWidth, window.innerHeight, camRef.current, sandboxUnits, flows, t, selected, hover)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize) }
  }, [selected, hover, sandboxUnits])

  // 小地图
  useEffect(() => {
    let alive = true
    const paint = () => { if (alive) drawMinimap(miniRef.current, sandboxUnits, camRef.current, window.innerWidth, window.innerHeight) }
    const t = setInterval(paint, 200)
    paint()
    return () => { alive = false; clearInterval(t) }
  }, [sandboxUnits])

  const syncCam = useCallback(() => setCamV({ ...camRef.current }), [])

  // 拖拽平移
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, cx: camRef.current.cx, cy: camRef.current.cy }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (d) {
      camRef.current.cx = d.cx - (e.clientX - d.x) / camRef.current.scale
      camRef.current.cy = d.cy - (e.clientY - d.y) / camRef.current.scale
      syncCam()
      return
    }
    // 悬停检测
    const rect = mapRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left, py = e.clientY - rect.top
    let hit = null
    for (const u of sandboxUnits) {
      const [sx, sy] = w2s(u.x * WORLD.w, u.y * WORLD.h, camRef.current, window.innerWidth, window.innerHeight)
      const r = 52 * u.scale * camRef.current.scale
      if ((px - sx) ** 2 / (r * 1.4) ** 2 + ((py - sy + r * 0.2) / (r * 0.8)) ** 2 < 1) hit = u
    }
    setHover(hit?.unitId ?? null)
  }
  const onPointerUp = () => { dragRef.current = null }
  const onWheel = (e) => {
    e.preventDefault()
    const k = e.deltaY < 0 ? 1.12 : 0.9
    const next = Math.min(2.6, Math.max(0.45, camRef.current.scale * k))
    camRef.current.scale = next
    syncCam()
  }

  const zoom = (k) => {
    camRef.current.scale = Math.min(2.6, Math.max(0.45, camRef.current.scale * k))
    syncCam()
  }
  const reset = () => {
    camRef.current = { cx: WORLD.w / 2, cy: WORLD.h / 2, scale: 1 }
    syncCam()
  }

  const clickMap = (e) => {
    const rect = mapRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left, py = e.clientY - rect.top
    for (const u of sandboxUnits) {
      const [sx, sy] = w2s(u.x * WORLD.w, u.y * WORLD.h, camRef.current, window.innerWidth, window.innerHeight)
      const r = 52 * u.scale * camRef.current.scale
      if ((px - sx) ** 2 / (r * 1.4) ** 2 + ((py - sy + r * 0.2) / (r * 0.8)) ** 2 < 1) {
        setSelected(u.unitId)
        return
      }
    }
    setSelected(null)
  }

  // 标签投影（随相机更新）
  const vw = window.innerWidth, vh = window.innerHeight
  const sel = sandboxUnits.find((u) => u.unitId === selected)
  const selUnit = sel && flows.filter((f) => f.from === sel.unitId || f.to === sel.unitId)
  // 单位 → 部门映射：沙盘只带部门名，这里按名字回到后端部门记录拿 id 与配色
  const deptOf = (name) => (data?.departments ?? []).find((d) => d.name === name) || null

  return (
    <div className="sandbox-root">
      <div className="sandbox-map"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onWheel={onWheel} onClick={clickMap}>
        <canvas ref={mapRef} />
      </div>

      {/* 顶栏 */}
      <header className="sb-top">
        <Brand prod="公司沙盘" to="/" />
        <nav className="crumb">
          <Link to="/">首页</Link><span className="sep">/</span><b>公司沙盘</b>
        </nav>
        <div className="sb-right">
          <div className="stat-chips">
            <span className="stat-chip">今日跟进客户 <b>{todayFollowCount}</b></span>
            <span className="stat-chip">缺口（正数）<b className={amountVisible ? "amber" : ""}>{amountVisible ? fmtMoney(metrics.gap) : "¥•••••"}</b></span>
            <span className="stat-chip">需介入 <b className="red">{amountVisible ? metrics.needIntervention : "•••"}</b></span>
          </div>
          <ConsoleEntry compact />
          <EyeToggle visible={amountVisible} onToggle={() => setAmountVisible((v) => !v)} />
        </div>
      </header>

      {/* 建筑标签 + 领导线 */}
      <svg className="map-leaders">
        {sandboxUnits.map((u) => {
          const [sx, sy] = w2s(u.x * WORLD.w, u.y * WORLD.h, camV, vw, vh)
          const ly = sy - 78 * u.scale * camV.scale
          return (
            <line key={u.unitId} className="map-leader-line" x1={sx} y1={sy - 14} x2={sx} y2={ly + 40}
              stroke="rgba(27,61,228,0.5)" />
          )
        })}
      </svg>
      {sandboxUnits.map((u) => {
        const [sx, sy] = w2s(u.x * WORLD.w, u.y * WORLD.h, camV, vw, vh)
        if (sx < -160 || sx > vw + 160 || sy < -80 || sy > vh + 80) return null
        const labelY = sy - 78 * u.scale * camV.scale
        const isCore = u.kind === "core"
        return (
          <div key={u.unitId}
            className={`map-label ${isCore ? "core-l" : ""} ${selected === u.unitId ? "sel" : ""}`}
            style={{ left: sx, top: labelY }}
            onClick={(e) => { e.stopPropagation(); setSelected(u.unitId) }}>
            <span className="code">{u.online ? (u.mcp ? "已接入 MCP" : "经营数据可查看") : "未接入 MCP"}</span>
            <span className="big">{u.name}</span>
            {isCore ? (
              <span className="row"><span>{u.stats[0]?.[0] ?? "入账"}</span><b className={amountVisible ? "" : "off"}>{amountVisible ? (u.stats[0]?.[1] ?? "—") : "¥•••••"}</b></span>
            ) : u.online ? (
              <span className="row">
                <span>{u.stats[0] ? `${u.stats[0][0]} ${u.stats[0][1]}` : "—"}</span>
                <span>{u.stats[1]?.[0]} <b>{amountVisible ? u.stats[1]?.[1] : "•••"}</b></span>
              </span>
            ) : (
              <span className="row"><span className="off">{u.stats[0]?.[1] ?? "—"} 人 · 未接入 MCP</span></span>
            )}
          </div>
        )
      })}

      {/* 单位面板 */}
      {sel && (
        <aside className="unit-panel corners rise">
          <div className="ph">
            <span>当前选中{sel.kind === "core" ? "建筑" : "单位"}</span>
            <span className="cls"><button onClick={() => setSelected(null)} title="关闭">✕</button></span>
          </div>
          <div className="who">
            <span className="ava" style={{ background: sel.online ? "linear-gradient(160deg,#5B73FF,#1B3DE4)" : "#8B95A5" }}>
              {sel.dept.slice(0, 1)}
            </span>
            <div>
              <div className="nm">{sel.name}</div>
              <div className="dp">{sel.dept} · {sel.online ? (sel.mcp ? "已接入 MCP" : "经营数据可查看") : "离线"}</div>
            </div>
          </div>
          {sel.online ? (
            <>
              <div className="stats">
                {sel.stats.map(([k, v]) => (
                  <div className="srow" key={k}>
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.6 2.6" /></svg>
                    <span>{k}</span><b>{amountVisible || !/[¥\d]/.test(v) ? v : "•••"}</b>
                  </div>
                ))}
              </div>
              <div className="wf-cap"><span>近期动作波形</span><span className="cnt">REALTIME</span></div>
              <Wave seed={sel.unitId.length + Math.round(sel.x * 10)} dark={false} className="wf" />
              {deptOf(sel.dept) ? (
                <Link className="btn-primary" to={`/departments/${deptOf(sel.dept).departmentId}`}>进入详情</Link>
              ) : (
                <Link className="btn-primary" to="/customers">进入客户经营</Link>
              )}
            </>
          ) : (
            <p className="offline-hint">该单位未接入 MCP，数据流未打通。需完成数据同步后方可点亮经营视图。</p>
          )}
        </aside>
      )}

      {/* 闲置单位 */}
      <section className="idle-bar glass corners">
        <div className="cap">
          <span>闲置单位 · <span className="cnt">{idleUnits.length}</span></span>
          <button className="tg" onClick={() => setIdleOpen((v) => !v)}>{idleOpen ? "收起" : "展开"}</button>
        </div>
        {idleOpen && (
          <div className="units">
            {idleUnits.map((u) => (
              <div className="idle-u" key={u.unitId}>
                <span className="ava">{u.name.slice(0, 1)}</span>
                <div><div className="nm">{u.name}</div><div className="sb">{u.sub}</div></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 控件组 */}
      <section className="sandbox-controls">
        <div className="zoom">
          <button onClick={() => zoom(1.2)} title="放大">＋</button>
          <button onClick={() => zoom(1 / 1.2)} title="缩小">－</button>
          <button onClick={reset} title="复位">⌂</button>
        </div>
        <div className="minimap corners"><canvas ref={miniRef} /></div>
        <div className="legend">
          {LEGEND.map((l) => (
            <span className="chip" key={l.kind} onMouseEnter={() => setTip(l)} onMouseLeave={() => setTip(null)}>
              <i style={{ background: l.color }} />{l.label}
            </span>
          ))}
        </div>
        <span className="grid-tag">GRID D-07</span>
      </section>

      {/* 图例悬浮说明 */}
      <div className={`flow-tip ${tip ? "show" : ""}`} style={tip ? { left: vw - 250, bottom: 190 } : {}}>
        {tip && (<><div className="tt">{tip.label}</div><div>{LEGEND.find((l) => l.kind === tip.kind) && flows.find((f) => f.kind === tip.kind)?.tip}</div></>)}
      </div>
    </div>
  )
}
