import { useParams, useNavigate } from "react-router-dom"
import { GuiHeader } from "../components/ui.jsx"
import { governanceCases, deptById } from "../data/db.js"

export default function UnitPage() {
  const { departmentId, unitId } = useParams()
  const nav = useNavigate()
  const g = governanceCases[unitId]
  const d = deptById(departmentId)

  if (!g) {
    return (
      <div className="page-shell">
        <GuiHeader crumb={[{ t: d?.name ?? "部门", to: `/departments/${departmentId}` }, { t: "详情" }]} accent={d?.dom} />
        <div className="wrap">
          <p className="sec-kicker">UNIT DETAIL</p>
          <section className="pagebrief rise"><h1>该单元暂无治理详情</h1></section>
          <p className="empty-hint">此下钻单元为演示占位，未配置治理链数据。</p>
          <button className="btn" onClick={() => nav(-1)}>← 返回</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <GuiHeader
        crumb={[{ t: `${g.back}经营战情`, to: `/departments/${departmentId}` }, { t: `${g.code} ${g.title.replace(/^CID-\d+ /, "")}` }]}
        accent={d?.dom}
        right={<><span className="code">{g.code}</span><span className="sync">SYNC <b>实时</b></span></>}
      />
      <div className="wrap">
        <p className="sec-kicker">{g.kicker}</p>
        <section className="pagebrief rise">
          <h1>{g.title}</h1>
          <p className="tagline">{g.brief}</p>
        </section>

        <section className="rep-grid rise" style={{ gridTemplateColumns: "1fr", animationDelay: "0.05s" }}>
          <article className="glass corners">
            <div className="panel-h"><span className="t">治理进度 <span>GOVERNANCE CHAIN</span></span></div>
            <div className="chain">
              {g.chain.map((n, i) => (
                <div className={`chain-node ${n.state}`} key={i}>
                  <span className="dot" />
                  <span className="lt">{n.t}</span>
                  <span className="ls">{n.s}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="glass corners">
            <div className="panel-h"><span className="t">事项要素 <span>CASE FACTS</span></span></div>
            <div className="facts-grid">
              {g.facts.map((f) => (
                <div className={`f-item ${f.tone ? `is-${f.tone}` : ""}`} key={f.k}>
                  <div className="fk">{f.k}</div>
                  <div className="fv">{f.v}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-dark corners night-note">
            <div className="cap"><span>黑灯批注 · NIGHT NOTE</span><span className="dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cyan)" }} /></div>
            <div className="line"><span className="ai">AI</span>{g.note}</div>
          </article>

          <div>
            <button className="btn" onClick={() => nav(`/departments/${departmentId}`)}>← 返回{g.back}</button>
          </div>
        </section>
      </div>
    </div>
  )
}
