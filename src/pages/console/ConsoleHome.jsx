import { Link, useOutletContext } from "react-router-dom"
import { api } from "../../lib/api.js"
import { ConsoleHead, Panel, Tag, Metric, Loading, ErrorNote } from "./ConsoleLayout.jsx"
import { useFetch, fmtTime, fmtUptime, statusTone, statusText } from "./common.jsx"

const QUICK = [
  { to: "/console/users", perm: "user:read", t: "用户管理", s: "账号、角色、状态与密码重置" },
  { to: "/console/roles", perm: "role:read", t: "角色与权限", s: "15 个权限点的矩阵化配置" },
  { to: "/console/data", perm: "data:read", t: "数据管理", s: "部门 / 沙盘单位 / 客户 / 报告" },
  { to: "/console/logs", perm: "log:read", t: "日志审计", s: "操作留痕与登录失败追踪" },
  { to: "/console/monitor", perm: "monitor:read", t: "监控中心", s: "运行指标、慢接口与告警" },
  { to: "/console/configs", perm: "config:read", t: "配置维护", s: "运行参数与密钥脱敏管理" },
]

export default function ConsoleHome() {
  const { me, perms } = useOutletContext()
  const health = useFetch(() => api.get("/monitor/health"))
  const overview = useFetch(() => api.monitorOverview())
  const summary = useFetch(() => api.logSummary())

  const b = overview.data?.business
  const t = overview.data?.traffic
  const r = overview.data?.runtime
  const can = (p) => perms.has(p)

  return (
    <>
      <ConsoleHead kicker="CONSOLE · OVERVIEW" title={`你好，${me?.user?.displayName || "管理员"}`}
        sub="后端服务的运行态、业务数据量与最近操作的统一入口。">
        <button className="c-btn" onClick={() => { health.reload(); overview.reload(); summary.reload() }}>刷新</button>
      </ConsoleHead>

      <ErrorNote error={overview.error || health.error} onRetry={() => { overview.reload(); health.reload() }} />

      <div className="c-metrics">
        <Metric k="服务状态" v={health.data?.status === "up" ? "正常" : health.loading ? "检测中" : "异常"}
          tone={health.data?.status === "up" ? "green" : "red"}
          extra={`${health.data?.node || "—"} · 运行 ${fmtUptime(health.data?.uptimeSec)}`} />
        <Metric k="今日请求" v={t ? t.requestsLastHour : "—"} unit="次/近1小时"
          extra={`错误率 ${t ? t.errorRatePct : "—"}%`} tone={t && t.errorRatePct > 5 ? "red" : "blue"} />
        <Metric k="接口延迟 P95" v={t ? t.p95Ms : "—"} unit="ms"
          extra={`平均 ${t ? t.avgMs : "—"} ms`} tone={t && t.p95Ms > 800 ? "amber" : "green"} />
        <Metric k="进程内存" v={r ? r.memRssMB : health.data?.memoryMB ?? "—"} unit="MB"
          extra={`堆 ${r ? r.heapUsedMB : "—"} / ${r ? r.heapTotalMB : "—"} MB`} />
      </div>

      <div className="c-metrics">
        <Metric k="用户总数" v={b ? b.users : "—"} extra={`启用 ${b ? b.usersActive : "—"} 个`} />
        <Metric k="沙盘单位" v={b ? b.unitsOnline : "—"} extra="在线单位数" />
        <Metric k="客户总数" v={b ? b.customers : "—"} extra={`高风险 ${b ? b.highRiskCustomers : "—"} 个`}
          tone={b && b.highRiskCustomers > 0 ? "amber" : undefined} />
        <Metric k="审计日志" v={b ? b.auditLogs : "—"} extra={`今日新增 ${summary.data?.auditToday ?? "—"}`} />
      </div>

      <div className="c-two">
        <Panel title="功能入口">
          {me?.permissions ? (
            <div className="c-quick">
              {QUICK.map((q) => {
                const allowed = !q.perm || can(q.perm)
                return allowed
                  ? <Link key={q.to} to={q.to} className="q-item"><b>{q.t}</b><span>{q.s}</span></Link>
                  : <div key={q.to} className="q-item off"><b>{q.t}</b><span>缺少权限 {q.perm}</span></div>
              })}
            </div>
          ) : <Loading />}
        </Panel>

        <Panel title="当前身份">
          <div className="c-kv">
            <div className="i"><div className="k">登录账号</div><div className="v">{me?.user?.username || "—"}</div></div>
            <div className="i"><div className="k">显示名称</div><div className="v">{me?.user?.displayName || "—"}</div></div>
            <div className="i"><div className="k">所属角色</div><div className="v">{me?.user?.roleName || "—"}</div></div>
            <div className="i"><div className="k">状态</div><div className="v">
              <Tag tone={statusTone(me?.user?.status)} text={statusText(me?.user?.status)} />
            </div></div>
            <div className="i"><div className="k">最近登录</div><div className="v">{fmtTime(me?.user?.lastLoginAt)}</div></div>
            <div className="i"><div className="k">权限点数量</div><div className="v">{me?.permissionCodes?.length ?? 0} / 15</div></div>
          </div>
          <div className="c-permlist">
            {(me?.permissions || []).map((p) => (
              <span key={p.code} className="c-perm-chip" title={p.code}>{p.name}<em>{p.module}</em></span>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="最近操作留痕" extra={<Link className="c-btn sm" to="/console/logs">查看全部</Link>}>
        <RecentAudit />
      </Panel>
    </>
  )
}

function RecentAudit() {
  const { data, loading, error, reload } = useFetch(() => api.auditLogs({ page: 1, pageSize: 6 }))
  if (loading) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  const list = data?.list || []
  if (!list.length) return <Loading text="暂无操作记录" />
  return (
    <div className="c-table-wrap">
      <table className="c-table">
        <thead>
          <tr><th>时间</th><th>操作人</th><th>模块 / 动作</th><th>方法</th><th>路径</th><th>耗时</th><th>结果</th></tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td className="mono">{fmtTime(r.createdAt)}</td>
              <td className="strong">{r.actorName || "匿名"}</td>
              <td>{r.module} · {r.action}</td>
              <td className="mono">{r.method}</td>
              <td className="mono ellip" title={r.path}>{r.path}</td>
              <td className="num">{r.durationMs} ms</td>
              <td><Tag tone={r.status < 400 ? "green" : "red"} text={`${r.status} ${r.statusText}`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
