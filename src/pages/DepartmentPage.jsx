import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { GuiHeader, Wave } from "../components/ui.jsx"
import { deptById } from "../data/db.js"
import { clockNow } from "../lib/util.js"

export default function DepartmentPage() {
  const { departmentId } = useParams()
  const nav = useNavigate()
  const d = deptById(departmentId)
  const [amountVisible, setAmountVisible] = useState(true)
  const [sync, setSync] = useState(clockNow())

  if (!d) {
    return (
      <div className="page-shell">
        <GuiHeader crumb={[{ t: "未知部门" }]} />
        <div className="wrap"><div className="empty-hint">部门不存在</div></div>
      </div>
    )
  }

  const bo = d.battleOrder
  const mk = (cells) =>
    cells.map((c, i) => (
      <span key={i} className={i === 0 ? "nm" : "num"} style={i === 1 ? { fontWeight: 500, color: "var(--ink)" } : undefined}>{c}</span>
    ))

  return (
    <div className="page-shell" key={d.departmentId}>
      <GuiHeader
        crumb={[{ t: `${d.name}经营战情` }]}
        accent={d.dom}
        right={
          <>
            <span className="code">SEC / {d.departmentId}</span>
            <span className="asof">数据时间 ------</span>
            <span className="sync">SYNC <b>{sync}</b></span>
            <button className="ava-eye" onClick={() => setAmountVisible((v) => !v)} title="金额可见性">
              <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>
            </button>
          </>
        }
      />

      <div className="wrap">
        <p className="sec-kicker">部门战情 · {d.codeName.split(" ")[0]} BRIEF</p>
        <section className="pagebrief rise">
          <h1>{d.name} · <em>{d.codeName}</em></h1>
          <p className="tagline">{d.tagline}</p>
          <p className="tagline"><b>{d.brief}</b></p>
        </section>

        {/* KPI 卡组 */}
        <section className="kpi-cards rise" style={{ animationDelay: "0.05s" }}>
          {d.kpis.map((k) => (
            <div className={`kpi-card tone-${k.tone || "ink"} ${k.tone === "pending" ? "pending" : ""}`} key={k.label}>
              <div className="k">{k.label}</div>
              <div className="b">
                <b>{k.value}</b>
                {k.unit && <small>{k.unit}</small>}
              </div>
            </div>
          ))}
        </section>

        {/* 关注事项 */}
        <section className="attention-list rise" style={{ animationDelay: "0.1s" }}>
          {(d.attentions ?? []).map((a) => (
            <button className={`attention-item ${a.level}`} key={a.code} onClick={() => nav(`/departments/${d.departmentId}/units/${a.id}`)}>
              <span className="id">{a.code}</span>
              <span className="tx">{a.text}</span>
              <em>{a.label} ›</em>
            </button>
          ))}
        </section>

        {/* 作战序列 + 夜报 */}
        <section className="rep-grid rise" style={{ animationDelay: "0.15s" }}>
          <div className="stack">
            {bo && (
              <article className="glass corners">
                <div className="panel-h">
                  <span className="t">作战序列 <span>BATTLE ORDER</span></span>
                  <span className="more">B/T/C 线</span>
                </div>
                <div className="btable">
                  <div className="brow head col-line">{bo.head.map((h) => <span key={h}>{h}</span>)}</div>
                  {bo.rows.map((r, i) => (
                    <div className={`brow col-line`} key={i}>
                      {r.cells.map((c, j) => {
                        const tone = r.toneCol === j ? r.tone : ""
                        return <span key={j} className={j === 0 ? "nm" : `num ${tone}`}>{c}</span>
                      })}
                    </div>
                  ))}
                </div>
              </article>
            )}
            {d.assets && (
              <article className="glass corners">
                <div className="panel-h">
                  <span className="t">{d.departmentId === 600 ? "今日运行时刻表" : d.departmentId === 500 ? "战略预警信号池" : d.departmentId === 400 ? "激活簇表现" : "D 线作战资产"} <span>ASSET LEDGER</span></span>
                  <span className="more">公共账本</span>
                </div>
                <div className="btable">
                  <div className="brow head col-asset">{d.assets.head.map((h) => <span key={h}>{h}</span>)}</div>
                  {d.assets.rows.map((r, i) => (
                    <div className="brow col-asset" key={i}>
                      <span className="tname"><b>{r.name}</b><span style={{ fontSize: 11, color: "var(--ink3)" }}>{r.code}</span></span>
                      <span>{r.status}</span>
                      <span className="num">{r.calls}</span>
                      <span className="num">{r.hit}</span>
                      <span className={`num ${r.tone ?? ""}`}>{r.adopt}</span>
                    </div>
                  ))}
                </div>
              </article>
            )}
          </div>

          <div className="stack">
            {d.nightReport && (
              <article className="glass-dark corners night-report">
                <div className="cap"><span>NIGHT OUTPUT</span><span className="dot" /></div>
                <div className="tt">{d.nightReport.title}</div>
                <div className="night-lines">
                  {d.nightReport.lines.map((l, i) => (
                    <p key={i}><span className="no">0{i + 1}</span>{l}</p>
                  ))}
                </div>
                <Wave seed={d.departmentId} dark />
              </article>
            )}
            {d.drilldowns && (
              <article className="glass corners">
                <div className="panel-h"><span className="t">可下钻单元 <span>DRILL DOWN</span></span></div>
                <div className="drill-list">
                  {d.drilldowns.map((x) => (
                    <div className="drill-item" key={x.id} onClick={() => nav(`/departments/${d.departmentId}/units/${x.id}`)}>
                      <span className="tag">{x.tag}</span>
                      <span className="nm">{x.name}</span>
                      <em>›</em>
                    </div>
                  ))}
                </div>
              </article>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
