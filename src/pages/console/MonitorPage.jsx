import { useState } from "react"
import { api } from "../../lib/api.js"
import { ConsoleHead, Panel, Tag, Empty, Loading, ErrorNote, Metric } from "./ConsoleLayout.jsx"
import { useFetch, fmtTime, fmtUptime, fmtNum } from "./common.jsx"

export default function MonitorPage() {
  const [hours, setHours] = useState(24)
  const overview = useFetch(() => api.monitorOverview(), [])
  const endpoints = useFetch(() => api.endpoints(), [])
  const series = useFetch(() => api.series(hours), [hours])
  const alerts = useFetch(() => api.alerts(), [])

  const o = overview.data
  const s = o?.service
  const r = o?.runtime
  const t = o?.traffic
  const b = o?.business

  return (
    <>
      <ConsoleHead kicker="OPS · MONITOR" title="监控中心"
        sub="服务、运行时、流量与业务四类指标；内置 4 条告警规则（错误率 / P95 延迟 / 内存 / 登录失败激增）。">
        <select className="c-select" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          {[1, 6, 12, 24, 72, 168].map((h) => <option key={h} value={h}>近 {h} 小时</option>)}
        </select>
        <button className="c-btn" onClick={() => { overview.reload(); endpoints.reload(); series.reload(); alerts.reload() }}>刷新</button>
      </ConsoleHead>

      <ErrorNote error={overview.error || alerts.error} onRetry={() => { overview.reload(); alerts.reload() }} />

      <div className="c-metrics">
        <Metric k="服务状态" v={s?.status === "up" ? "正常" : "未知"} tone={s?.status === "up" ? "green" : "red"}
          extra={`${s?.name || "—"} v${s?.version || "—"} · pid ${s?.pid ?? "—"}`} />
        <Metric k="运行时长" v={fmtUptime(s?.uptimeSec)} extra={`启动于 ${fmtTime(s?.startedAt)}`} />
        <Metric k="Node 版本" v={s?.node || "—"} extra={`${r?.cores ?? "—"} 核 · load ${r ? r.loadAvg.join(" / ") : "—"}`} />
        <Metric k="CPU 使用率" v={r?.cpuPct ?? "—"} unit="%" tone={r?.cpuPct > 80 ? "red" : "blue"} extra="采样窗口：两次刷新之间" />
      </div>

      <div className="c-metrics">
        <Metric k="累计请求" v={t ? fmtNum(t.totalRequests) : "—"} extra={`近 1 小时 ${t ? fmtNum(t.requestsLastHour) : "—"} 次`} />
        <Metric k="累计错误" v={t ? fmtNum(t.totalErrors) : "—"} extra={`错误率 ${t?.errorRatePct ?? "—"}%`}
          tone={t?.errorRatePct > 5 ? "red" : "green"} />
        <Metric k="平均延迟" v={t?.avgMs ?? "—"} unit="ms"
          extra={`P50 ${t?.p50Ms ?? "—"} · P95 ${t?.p95Ms ?? "—"} · P99 ${t?.p99Ms ?? "—"}`} />
        <Metric k="进程内存" v={r?.memRssMB ?? "—"} unit="MB"
          extra={`堆 ${r?.heapUsedMB ?? "—"} / ${r?.heapTotalMB ?? "—"} MB · 系统 ${r?.systemMemUsedPct ?? "—"}%`} />
      </div>

      <Panel title={`时序趋势 · 近 ${hours} 小时`}
        extra={<span className="c-sub">来自 metrics_snapshots 定时采样</span>}>
        <ErrorNote error={series.error} onRetry={series.reload} />
        {series.loading && !series.data ? <Loading /> : <SeriesChart points={series.data?.points || []} />}
      </Panel>

      <div className="c-two">
        <Panel title={`告警规则${alerts.data ? ` · 触发 ${alerts.data.firing} / ${alerts.data.total}` : ""}`}>
          {alerts.loading && !alerts.data ? <Loading /> : (
            <div className="c-alerts">
              {(alerts.data?.list || []).map((a) => (
                <div className={`a-item lv-${a.level}`} key={a.id}>
                  <div className="a-h">
                    <b>{a.name}</b>
                    <Tag tone={a.level === "ok" ? "green" : a.level === "warning" ? "amber" : "red"}
                      text={a.level === "ok" ? "正常" : a.level === "warning" ? "警告" : "严重"} />
                  </div>
                  <div className="a-m">
                    <span className="mono">{a.metric}</span>
                    <span className="cur">{a.value}</span>
                    <span className="op">{a.op} {a.threshold}</span>
                  </div>
                  <div className="a-s">{a.action}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="业务数据规模">
          <div className="c-kv">
            <div className="i"><div className="k">用户 / 启用</div><div className="v">{b?.users ?? "—"} / {b?.usersActive ?? "—"}</div></div>
            <div className="i"><div className="k">部门</div><div className="v">{b?.departments ?? "—"}</div></div>
            <div className="i"><div className="k">在线沙盘单位</div><div className="v">{b?.unitsOnline ?? "—"}</div></div>
            <div className="i"><div className="k">客户 / 高风险</div><div className="v">{b?.customers ?? "—"} / {b?.highRiskCustomers ?? "—"}</div></div>
            <div className="i"><div className="k">审计日志</div><div className="v">{b?.auditLogs ?? "—"}</div></div>
            <div className="i"><div className="k">配置项</div><div className="v">{b?.configs ?? "—"}</div></div>
          </div>
        </Panel>
      </div>

      <Panel title="接口级调用统计" extra={<span className="c-sub">按累计调用次数倒序 · Top 30</span>}>
        <ErrorNote error={endpoints.error} onRetry={endpoints.reload} />
        {endpoints.loading && !endpoints.data ? <Loading /> : (
          <>
            <div className="c-table-wrap">
              <table className="c-table">
                <thead>
                  <tr><th>接口路径</th><th className="num">调用次数</th><th className="num">错误数</th><th className="num">错误率</th><th className="num">平均耗时</th><th style={{ width: 160 }}>耗时分布</th></tr>
                </thead>
                <tbody>
                  {(endpoints.data?.list || []).map((e) => (
                    <tr key={e.path}>
                      <td className="mono strong ellip" title={e.path}>{e.path}</td>
                      <td className="num">{e.count}</td>
                      <td className="num">{e.errors}</td>
                      <td className="num">
                        <span style={{ color: e.errorRatePct > 5 ? "var(--red)" : "inherit" }}>{e.errorRatePct}%</span>
                      </td>
                      <td className="num">{e.avgMs} ms</td>
                      <td>
                        <div className={`c-bar ${e.avgMs > 800 ? "is-red" : e.avgMs > 300 ? "is-amber" : "is-green"}`}>
                          <i style={{ width: `${Math.min(100, Math.max(3, e.avgMs / 10))}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!endpoints.data?.list?.length && <Empty text="暂无接口调用统计（近 5 分钟无请求或刚重启）" />}
          </>
        )}
      </Panel>
    </>
  )
}

// ---------- 纯 SVG 时序折线（请求量 / 错误量 / 平均延迟） ----------
function SeriesChart({ points }) {
  if (!points.length) return <Empty text="暂无采样点，服务启动并产生请求后会自动写入" />

  const W = 900, H = 220, PAD = { l: 44, r: 44, t: 16, b: 26 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const n = points.length
  const reqMax = Math.max(1, ...points.map((p) => p.requests))
  const errMax = Math.max(1, ...points.map((p) => p.errors))
  const msMax = Math.max(1, ...points.map((p) => p.avgMs))
  const x = (i) => PAD.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v, max) => PAD.t + ih - (v / max) * ih
  const line = (key, max) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key], max).toFixed(1)}`).join(" ")
  const area = (key, max) => `${line(key, max)} L${x(n - 1).toFixed(1)},${PAD.t + ih} L${x(0).toFixed(1)},${PAD.t + ih} Z`

  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="c-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="时序趋势">
        {ticks.map((t) => (
          <line key={t} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih * t} y2={PAD.t + ih * t}
            stroke="rgba(24,33,49,.08)" strokeWidth="1" />
        ))}
        <path d={area("requests", reqMax)} fill="rgba(27,61,228,.10)" />
        <path d={line("requests", reqMax)} fill="none" stroke="#1B3DE4" strokeWidth="2" />
        <path d={line("errors", errMax)} fill="none" stroke="#D9484E" strokeWidth="1.6" strokeDasharray="4 3" />
        <path d={line("avgMs", msMax)} fill="none" stroke="#269A61" strokeWidth="1.6" />
        {ticks.map((t) => (
          <text key={`ly${t}`} x={PAD.l - 8} y={PAD.t + ih * t + 4} textAnchor="end" className="c-chart-tick">
            {Math.round(reqMax * (1 - t))}
          </text>
        ))}
      </svg>
      <div className="c-legend">
        <span><i style={{ background: "#1B3DE4" }} />请求量（左轴）</span>
        <span><i style={{ background: "#D9484E" }} />错误量</span>
        <span><i style={{ background: "#269A61" }} />平均延迟 ms</span>
        <span className="rng">{fmtTime(points[0].ts)} → {fmtTime(points[n - 1].ts)} · {n} 个采样点</span>
      </div>
    </div>
  )
}
