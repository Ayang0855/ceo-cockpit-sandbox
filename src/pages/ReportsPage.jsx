import { useState } from "react"
import { GuiHeader, EmptyState } from "../components/ui.jsx"
import { reports } from "../data/db.js"

const TABS = ["全部", "日报", "周报"]

export default function ReportsPage() {
  const [tab, setTab] = useState(TABS[0])
  const [sel, setSel] = useState(null)

  const list = tab === "全部" ? reports : reports.filter((r) => r.kind === tab)
  const cur = list.find((r) => r.id === sel) ?? list[0]

  // 简易 markdown 渲染（标题 / 列表 / 段落）
  const renderMd = (md) =>
    md.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h3 key={i}>{line.slice(3)}</h3>
      if (line.startsWith("- ")) return <li key={i}>{line.slice(2)}</li>
      if (/^\d+\. /.test(line)) return <li key={i}>{line.replace(/^\d+\. /, "")}</li>
      if (!line.trim()) return null
      return <p key={i}>{line}</p>
    })

  return (
    <div className="page-shell">
      <GuiHeader
        crumb={[{ t: "主管报告" }]}
        right={<><span className="code">UNIT-N7 / REPLAY</span><span className="asof">数据时间 ------</span><span className="sync">SYNC <b>11:50:24</b></span></>}
      />
      <div className="wrap">
        <p className="sec-kicker">页面摘要 · REPORT BRIEF</p>
        <section className="pagebrief rise">
          <h1>当前窗口共 {reports.length} 份主管报告，<em>点击左侧阅读全文</em></h1>
        </section>

        <div className="rep-layout rise" style={{ animationDelay: "0.05s" }}>
          <article className="glass corners">
            <div className="rep-tabs">
              {TABS.map((t) => (
                <button key={t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setSel(null) }}>{t}</button>
              ))}
            </div>
            <div className="rep-list">
              {list.map((r) => (
                <div className={`rep-item ${cur?.id === r.id ? "on" : ""}`} key={r.id} onClick={() => setSel(r.id)}>
                  <div className="rm">{r.title}</div>
                  <div className="rd">{r.kind} · {r.at}</div>
                </div>
              ))}
              {!list.length && <EmptyState text="该时间窗口暂无报告，可能未生成或写入失败，需确认" />}
            </div>
            <div className="pager">
              <button disabled>上一页</button>
              <span>第 1/1 页 · 共 {list.length} 条</span>
              <button disabled>下一页</button>
            </div>
          </article>

          <article className="glass corners">
            {cur ? (
              <div className="rep-body">
                <div className="hd">
                  <h2>{cur.title}</h2>
                  <div className="ver">{cur.kind} · 生成于 {cur.at}</div>
                </div>
                <div className="md">{renderMd(cur.md)}</div>
              </div>
            ) : (
              <div className="rep-body" style={{ display: "grid", placeItems: "center" }}>
                <EmptyState text="从左侧选择一篇报告" />
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}
