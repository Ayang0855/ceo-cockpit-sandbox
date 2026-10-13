import { useMemo, useState } from "react"
import { GuiHeader, Pagination, Tag } from "../components/ui.jsx"
import { customers } from "../data/db.js"
import { fmtInt } from "../lib/util.js"

const PAGE_SIZE = 12
const STAGES = ["全部阶段", "已成交", "方案展示", "需求确认", "初步接洽", "商务谈判"]
const OWNERS = ["全部销售", "李婷", "张三", "小林", "王磊"]
const FILTERS = ["全部客户", "需介入", "风险客户"]

export default function CustomerListPage() {
  const [kw, setKw] = useState("")
  const [filter, setFilter] = useState(FILTERS[0])
  const [owner, setOwner] = useState(OWNERS[0])
  const [stage, setStage] = useState(STAGES[0])
  const [page, setPage] = useState(1)

  const list = useMemo(() => {
    let r = customers
    if (kw.trim()) r = r.filter((c) => c.name.includes(kw.trim()) || c.code.includes(kw.trim()))
    if (filter === "需介入") r = r.filter((c) => c.tags.includes("需介入"))
    if (filter === "风险客户") r = r.filter((c) => c.tags.includes("风险"))
    if (owner !== OWNERS[0]) r = r.filter((c) => c.owner === owner)
    if (stage !== STAGES[0]) r = r.filter((c) => c.stage === stage)
    return r
  }, [kw, filter, owner, stage])

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const cur = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="page-shell">
      <GuiHeader
        crumb={[{ t: "客户经营" }]}
        right={<><span className="code">CUST / ASSETS</span><span className="asof">数据时间 11:44</span><span className="sync">SYNC <b>11:50:19</b></span></>}
      />
      <div className="wrap">
        <p className="sec-kicker">页面摘要 · CUST BRIEF</p>
        <section className="pagebrief rise">
          <h1>
            当前客户共 {fmtInt(1834)} 个，{" "}
            <em className="red">优先处理需介入与风险队列</em>
          </h1>
        </section>

        <div className="filters rise" style={{ animationDelay: "0.05s" }}>
          <input type="text" placeholder="搜索客户编号 / 姓名" value={kw}
            onChange={(e) => { setKw(e.target.value); setPage(1) }} />
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1) }}>
            {FILTERS.map((f) => <option key={f}>{f}</option>)}
          </select>
          <select value={owner} onChange={(e) => { setOwner(e.target.value); setPage(1) }}>
            {OWNERS.map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={stage} onChange={(e) => { setStage(e.target.value); setPage(1) }}>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <section className="ctable glass corners rise" style={{ animationDelay: "0.1s" }}>
          <div className="crow head">
            <span>客户</span><span>编号</span><span>归属销售</span><span>销售阶段</span><span>标记</span><span>下次跟进</span><span>画像更新时间</span>
          </div>
          {cur.map((c) => (
            <div className="crow" key={c.customerId}>
              <span className="cname">{c.name}</span>
              <span className="cnum">{c.code}</span>
              <span>{c.owner}</span>
              <span className="stage" style={{ color: c.stage === "已成交" ? "#238A57" : "var(--ink2)" }}>{c.stage}</span>
              <span className="tags">{c.tags.map((t) => <Tag key={t} text={t} />)}</span>
              <span className="mut">{c.nextFollow}</span>
              <span className="mut">{c.profileAt}</span>
            </div>
          ))}
          {!cur.length && <div className="empty-hint">没有符合条件的客户</div>}
          <Pagination page={page} pages={pages} onPage={setPage} />
        </section>
      </div>
    </div>
  )
}
