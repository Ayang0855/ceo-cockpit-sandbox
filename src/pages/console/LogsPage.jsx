import { useState } from "react"
import { useOutletContext } from "react-router-dom"
import { api } from "../../lib/api.js"
import { ConsoleHead, Panel, Tag, Empty, Loading, ErrorNote, Metric, useToast } from "./ConsoleLayout.jsx"
import { useFetch, Pager, fmtTime, fmtNum } from "./common.jsx"

const ERROR_CODES = [
  ["40000", "参数校验失败"], ["40001", "请求参数不合法"], ["40100", "未携带令牌"],
  ["40101", "令牌无效"], ["40102", "令牌过期"], ["40103", "账号或密码错误"],
  ["40300", "权限不足"], ["40301", "角色受保护"], ["40302", "内置对象受保护"],
  ["40400", "资源不存在"], ["40900", "唯一性冲突"], ["42900", "请求过于频繁"], ["50000", "服务内部错误"],
]

export default function LogsPage() {
  const { perms } = useOutletContext()
  const { push } = useToast()
  const can = (p) => perms.has(p)
  const [tab, setTab] = useState("audit")
  const [aq, setAq] = useState({ module: "", method: "", keyword: "", onlyError: false, page: 1, pageSize: 15 })
  const [lq, setLq] = useState({ result: "", username: "", page: 1, pageSize: 15 })
  const [days, setDays] = useState(30)

  const summary = useFetch(() => api.logSummary(), [])
  const audits = useFetch(() => api.auditLogs({ ...aq, onlyError: aq.onlyError ? "true" : "" }),
    [aq.page, aq.module, aq.method, aq.keyword, aq.onlyError])
  const logins = useFetch(() => api.loginLogs(lq), [lq.page, lq.result, lq.username])

  const purge = async () => {
    if (!window.confirm(`将删除 ${days} 天前的审计日志与登录日志，确认继续？`)) return
    try {
      const d = await api.purgeLogs(days)
      push(`已清理审计 ${d.auditDeleted} 条、登录 ${d.loginDeleted} 条（保留 ${d.retentionDays} 天）`, "ok")
      summary.reload(); audits.reload(); logins.reload()
    } catch (e) { push(e.message, "err", e.traceId) }
  }

  const s = summary.data

  return (
    <>
      <ConsoleHead kicker="OPS · AUDIT" title="日志审计"
        sub="所有写操作与鉴权事件均落库留痕，可按模块、动作、错误码、traceId 与时间窗检索，并支持按保留天数归档清理。">
        <button className="c-btn" onClick={() => { summary.reload(); audits.reload(); logins.reload() }}>刷新</button>
        <button className="c-btn danger" onClick={purge}>按保留期清理</button>
      </ConsoleHead>

      <div className="c-metrics">
        <Metric k="审计日志总量" v={s ? fmtNum(s.auditTotal) : "—"} extra={`今日 ${s ? fmtNum(s.auditToday) : "—"} 条`} />
        <Metric k="异常请求累计" v={s ? fmtNum(s.auditErrors) : "—"} tone={s?.auditErrors > 0 ? "amber" : "green"} extra="HTTP ≥ 400" />
        <Metric k="登录记录总量" v={s ? fmtNum(s.loginTotal) : "—"} extra={`今日失败 ${s ? s.loginFailToday : "—"} 次`}
          tone={s?.loginFailToday > 0 ? "red" : "green"} />
        <Metric k="保留策略" v={days} unit="天" extra="超出后由清理任务删除" />
      </div>

      <div className="c-two">
        <Panel title="模块调用分布">
          {summary.loading && !s ? <Loading /> : (
            <BarList items={(s?.topModules || []).map((x) => ({ label: x.module || "unknown", value: x.count }))} />
          )}
        </Panel>
        <Panel title="错误码分布">
          {summary.loading && !s ? <Loading /> : (
            <BarList tone="red"
              items={(s?.topErrors || []).map((x) => ({ label: codeText(x.error_code), value: x.count }))}
              empty="暂无异常记录" />
          )}
        </Panel>
      </div>

      <div className="c-tabs" style={{ marginTop: 18 }}>
        <button className={`c-tab ${tab === "audit" ? "on" : ""}`} onClick={() => setTab("audit")}>
          操作审计<span className="cnt">{audits.data?.total ?? "—"}</span>
        </button>
        <button className={`c-tab ${tab === "login" ? "on" : ""}`} onClick={() => setTab("login")}>
          登录日志<span className="cnt">{logins.data?.total ?? "—"}</span>
        </button>
      </div>

      {tab === "audit" ? (
        <Panel>
          <div className="c-filters">
            <input className="c-input" placeholder="搜索路径 / 操作人 / 目标 ID" style={{ width: 230 }}
              value={aq.keyword} onChange={(e) => setAq((v) => ({ ...v, keyword: e.target.value, page: 1 }))} />
            <select className="c-select" value={aq.module} onChange={(e) => setAq((v) => ({ ...v, module: e.target.value, page: 1 }))}>
              <option value="">全部模块</option>
              {(s?.topModules || []).map((m) => <option key={m.module} value={m.module}>{m.module}</option>)}
            </select>
            <select className="c-select" value={aq.method} onChange={(e) => setAq((v) => ({ ...v, method: e.target.value, page: 1 }))}>
              <option value="">全部方法</option>
              {["GET", "POST", "PATCH", "PUT", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <label className="c-check inline">
              <input type="checkbox" checked={aq.onlyError} onChange={(e) => setAq((v) => ({ ...v, onlyError: e.target.checked, page: 1 }))} />
              只看异常
            </label>
            <button className="c-btn sm" onClick={() => setAq({ module: "", method: "", keyword: "", onlyError: false, page: 1, pageSize: 15 })}>重置</button>
          </div>

          <ErrorNote error={audits.error} onRetry={audits.reload} />
          {audits.loading && !audits.data ? <Loading /> : (
            <>
              <div className="c-table-wrap">
                <table className="c-table">
                  <thead>
                    <tr>
                      <th>时间</th><th>操作人</th><th>模块 / 动作</th><th>方法</th><th>路径</th>
                      <th>目标</th><th>IP</th><th className="num">耗时</th><th>结果</th><th>traceId</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(audits.data?.list || []).map((r) => (
                      <tr key={r.id}>
                        <td className="mono">{fmtTime(r.createdAt)}</td>
                        <td className="strong">{r.actorName || "匿名"}</td>
                        <td>{r.module} · {r.action}</td>
                        <td className="mono">{r.method}</td>
                        <td className="mono ellip" title={r.path}>{r.path}</td>
                        <td className="mono">{r.targetType ? `${r.targetType}${r.targetId ? `#${r.targetId}` : ""}` : "—"}</td>
                        <td className="mono">{r.ip || "—"}</td>
                        <td className="num">{r.durationMs} ms</td>
                        <td>
                          <Tag tone={r.status < 400 ? "green" : r.status < 500 ? "amber" : "red"} text={`${r.status}`} />
                        </td>
                        <td className="mono ellip" title={r.traceId}>{String(r.traceId || "").slice(0, 12)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!audits.data?.list?.length && <Empty text="没有匹配的审计记录" />}
              <Pager page={audits.data?.page} pageSize={audits.data?.pageSize} total={audits.data?.total}
                onChange={(p) => setAq((v) => ({ ...v, page: p }))} />
            </>
          )}
        </Panel>
      ) : (
        <Panel>
          <div className="c-filters">
            <input className="c-input" placeholder="按账号搜索" style={{ width: 200 }}
              value={lq.username} onChange={(e) => setLq((v) => ({ ...v, username: e.target.value, page: 1 }))} />
            <select className="c-select" value={lq.result} onChange={(e) => setLq((v) => ({ ...v, result: e.target.value, page: 1 }))}>
              <option value="">全部结果</option>
              <option value="success">成功</option>
              <option value="fail">失败</option>
            </select>
            <button className="c-btn sm" onClick={() => setLq({ result: "", username: "", page: 1, pageSize: 15 })}>重置</button>
          </div>

          <ErrorNote error={logins.error} onRetry={logins.reload} />
          {logins.loading && !logins.data ? <Loading /> : (
            <>
              <div className="c-table-wrap">
                <table className="c-table">
                  <thead>
                    <tr><th>时间</th><th>账号</th><th>结果</th><th>原因</th><th>IP</th><th>User-Agent</th></tr>
                  </thead>
                  <tbody>
                    {(logins.data?.list || []).map((r) => (
                      <tr key={r.id}>
                        <td className="mono">{fmtTime(r.createdAt)}</td>
                        <td className="strong">{r.username}</td>
                        <td><Tag tone={r.result === "success" ? "green" : "red"} text={r.resultText} /></td>
                        <td>{reasonText(r.reason)}</td>
                        <td className="mono">{r.ip || "—"}</td>
                        <td className="ellip" title={r.ua}>{r.ua || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!logins.data?.list?.length && <Empty text="没有匹配的登录记录" />}
              <Pager page={logins.data?.page} pageSize={logins.data?.pageSize} total={logins.data?.total}
                onChange={(p) => setLq((v) => ({ ...v, page: p }))} />
            </>
          )}
        </Panel>
      )}

      <Panel title="登录失败追踪（最近 8 条）">
        {summary.loading && !s ? <Loading /> : (s?.recentFails?.length ? (
          <div className="c-feed">
            {s.recentFails.map((f, i) => (
              <div className="f-item" key={i}>
                <span className="mono">{fmtTime(f.created_at)}</span>
                <b>{f.username}</b>
                <span className="mono">{f.ip || "—"}</span>
                <Tag tone="red" text={reasonText(f.reason)} />
              </div>
            ))}
          </div>
        ) : <Empty text="暂无失败登录" />)}
      </Panel>
    </>
  )
}

function BarList({ items = [], tone, empty = "暂无数据" }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) return <Empty text={empty} />
  return (
    <div className="c-barlist">
      {items.map((it, i) => (
        <div className="b-row" key={i}>
          <span className="b-label ellip" title={it.label}>{it.label}</span>
          <span className="b-bar"><i style={{ width: `${Math.max(6, (it.value / max) * 100)}%` }}
            className={tone === "red" ? "is-red" : ""} /></span>
          <span className="b-val">{it.value}</span>
        </div>
      ))}
    </div>
  )
}

function codeText(code) {
  if (!code) return "未分类"
  const hit = ERROR_CODES.find(([c]) => String(c) === String(code))
  return hit ? `${code} ${hit[1]}` : String(code)
}

function reasonText(reason) {
  const m = { BAD_CREDENTIALS: "账号或密码错误", LOCKED: "账号已锁定", DISABLED: "账号已停用", NOT_FOUND: "账号不存在" }
  return reason ? (m[reason] || reason) : "—"
}
