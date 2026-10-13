import { useEffect, useMemo, useState } from "react"
import { GuiHeader, Pagination, Tag, SourceBadge, EmptyState } from "../components/ui.jsx"
import { useCustomers, STAGES, TAG_FILTERS } from "../lib/dataset.js"
import { fmtInt } from "../lib/util.js"

const PAGE_SIZE = 12

export default function CustomerListPage() {
  const [kw, setKw] = useState("")
  const [filter, setFilter] = useState(TAG_FILTERS[0])
  const [owner, setOwner] = useState("")
  const [stage, setStage] = useState("")
  const [page, setPage] = useState(1)

  // 关键字变化时回到第 1 页
  useEffect(() => { setPage(1) }, [kw, filter, owner, stage])

  const { list, total, pages, options, source, loading, error } = useCustomers({
    keyword: kw, stage, owner, filter, page, pageSize: PAGE_SIZE,
  })

  // 下拉选项由后端下发（与库内枚举同源），后端不可用时用本地兜底
  const stageOpts = options?.stages ?? STAGES
  const ownerOpts = options?.owners ?? []
  const filterOpts = useMemo(() => TAG_FILTERS, [])

  return (
    <div className="page-shell">
      <GuiHeader
        crumb={[{ t: "客户经营" }]}
        right={<><span className="code">CUST / ASSETS</span><SourceBadge source={source} /></>}
      />
      <div className="wrap">
        <p className="sec-kicker">页面摘要 · CUST BRIEF</p>
        <section className="pagebrief rise">
          <h1>
            当前客户共 <em>{fmtInt(total)}</em> 个，{" "}
            <em className="red">优先处理需介入与风险队列</em>
          </h1>
        </section>

        <div className="filters rise" style={{ animationDelay: "0.05s" }}>
          <input type="text" placeholder="搜索客户编号 / 姓名 / 归属销售" value={kw}
            onChange={(e) => setKw(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {filterOpts.map((f) => <option key={f}>{f}</option>)}
          </select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">全部销售</option>
            {ownerOpts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">全部阶段</option>
            {stageOpts.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <section className="ctable glass corners rise" style={{ animationDelay: "0.1s" }}>
          {/* 窄屏下由外层容器横向滚动，避免 7 列被裁切 */}
          <div className="ctable-scroll">
            <div className="crow head">
              <span>客户</span><span>编号</span><span>归属销售</span><span>销售阶段</span><span>标记</span><span>下次跟进</span><span>画像更新时间</span>
            </div>
            {list.map((c) => (
              <div className="crow" key={c.customerId}>
                <span className="cname">{c.name}</span>
                <span className="cnum">{c.code}</span>
                <span>{c.owner}</span>
                <span className="stage" style={{ color: c.stage === "已成交" ? "#238A57" : "var(--ink2)" }}>{c.stage}</span>
                <span className="tags">{(c.tags || []).map((t) => <Tag key={t} text={t} />)}</span>
                <span className="mut">{c.nextFollow || "—"}</span>
                <span className="mut">{c.profileAt || "—"}</span>
              </div>
            ))}
          </div>
          {!loading && !list.length && <EmptyState text="没有符合条件的客户" />}
          {loading && <div className="empty-hint">正在读取客户数据…</div>}
          {error && source === "static" && (
            <div className="empty-hint">后端不可用（{error}），当前为本地演示数据</div>
          )}
          <Pagination page={page} pages={pages} onPage={setPage} />
        </section>
      </div>
    </div>
  )
}
