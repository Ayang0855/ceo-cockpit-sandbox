import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Brand, EyeToggle, Wave } from "../components/ui.jsx"
import { departments, deptHue, agents } from "../data/db.js"
import { fmtMoney, clockNow } from "../lib/util.js"
import { paintCity } from "../lib/city.js"

const METRICS = { cash: 775963.0, target: 900000.0 }

function AgentCard({ a, i }) {
  return (
    <article className="sent-card glass-dark corners hoverable rise" style={{ animationDelay: `${0.15 + i * 0.07}s` }}>
      <span className="hex" aria-hidden="true">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="2.4" /><path d="M12 3.8v2.4M12 17.8v2.4M3.8 12h2.4M17.8 12h2.4" /></svg>
      </span>
      <span className="inf">
        <span className="code">{a.code}</span>
        <span className="nm">{a.name}</span>
        <span className="ds">{a.desc}</span>
      </span>
      <Wave seed={i + 3} dark />
    </article>
  )
}

export default function HomePage() {
  const nav = useNavigate()
  const [amountVisible, setAmountVisible] = useState(true)
  const [view, setView] = useState("brief")
  const [sync, setSync] = useState(clockNow())
  const cityRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setSync(clockNow()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    import("../lib/util.js").then(({ paintStars }) => {})
    const t = setTimeout(() => paintCity(cityRef.current), 60)
    return () => clearTimeout(t)
  }, [])

  const gap = METRICS.target - METRICS.cash
  const rate = ((METRICS.cash / METRICS.target) * 100).toFixed(2)
  const online = departments.filter((d) => d.online)
  const offline = departments.filter((d) => !d.online)
  const money = (v) => (amountVisible ? fmtMoney(v) : "¥ *****")

  const mask = (s) =>
    amountVisible ? s : s.replace(/[\d,]+(\.\d+)?/g, "•••")

  return (
    <div className="home-main">
      <header className="topbar">
        <Brand sub="" />
        <div className="top-right">
          <div className="views" role="tablist">
            <button className={view === "brief" ? "on" : ""} onClick={() => setView("brief")}>
              <span className="vd" /> 早报
            </button>
            <button onClick={() => nav("/sandbox")}>沙盘</button>
            <button className={view === "flow" ? "on" : ""} onClick={() => setView("flow")}>链路</button>
          </div>
          <EyeToggle visible={amountVisible} onToggle={() => setAmountVisible((v) => !v)} />
        </div>
      </header>

      {/* 简报 */}
      <section className="brief rise">
        <p className="kicker">星澜智驭 · AI 晨报 · MORNING BRIEF</p>
        <h1>
          今日跟进 <em>2</em> 个客户，月度完成 <em>{rate}%</em>，{" "}
          <em className="red">158</em> 个客户需要你介入
        </h1>
        <p className="sub">白昼 · 人机并肩</p>
      </section>

      {/* 左列 · 部门矩阵 */}
      <section className="day-col">
        <div className="col-head rise">
          <span className="domain-tab">组织 · 部门矩阵</span>
          <span className="cnt">{online.length} 可查看 / {departments.length} 部门</span>
        </div>
        <div className="col-scroll">
          {online.map((d, i) => (
            <article key={d.departmentId}
              className="dept-card glass ow-card hoverable rise"
              style={{ "--hue": deptHue(d.name), animationDelay: `${0.1 + i * 0.05}s` }}
              onClick={() => nav(`/departments/${d.departmentId}`)}>
              <span className="ow-rail" aria-hidden="true" />
              <div className="code">
                <span>SEC / {d.departmentId}</span>
                <span className="dept-state"><i className="sd" /> {d.mcp ? "ONLINE" : "READY"}</span>
              </div>
              <div className="mid">
                <span className="ava" aria-hidden="true">{d.name.slice(0, 1)}</span>
                <div>
                  <div className="nm">{d.name}</div>
                  <div className="sub">{d.members} 人 <i>·</i> {d.mcp ? "已接入 MCP" : "经营数据可查看"}</div>
                </div>
              </div>
            </article>
          ))}
          {offline.map((d, i) => (
            <article key={d.departmentId}
              className="dept-card glass ow-card off hoverable rise"
              style={{ "--hue": deptHue(d.name), animationDelay: `${0.3 + i * 0.05}s` }}>
              <span className="ow-rail" aria-hidden="true" />
              <div className="code">
                <span>SEC / {d.departmentId}</span>
                <span className="off-tag">待点亮</span>
              </div>
              <div className="mid">
                <span className="ava" aria-hidden="true">{d.name.slice(0, 1)}</span>
                <div>
                  <div className="nm">{d.name}</div>
                  <div className="sub">未接入 MCP · 待点亮</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 中央全息城市 + 沙盘入口 */}
      <div className="home-center">
        <div className="rise" style={{ animationDelay: "0.1s" }}>
        <canvas ref={cityRef} className="city" width={560} height={430} style={{ width: "min(44vw,560px)", height: "auto" }} />
        <div>
          <button className="sand-cap" onClick={() => nav("/sandbox")}>
            星澜智驭 · 公司沙盘 · 进入全域视图 <span className="arr">→</span>
          </button>
        </div>
        </div>
      </div>

      {/* 右列 · 黑灯工厂 */}
      <section className="night-col">
        <div className="col-head rise">
          <span className="night-tab">黑夜 · 黑灯工厂</span>
          <span className="cnt">{agents.length} 个智能体</span>
        </div>
        <div className="col-scroll">
          {agents.map((a, i) => <AgentCard key={a.unitId} a={a} i={i} />)}
        </div>
      </section>

      {/* 底部 KPI 带 */}
      <section className="kpi-band glass corners rise" style={{ animationDelay: "0.2s" }}>
        <span className="band-code">CORE-METRICS</span>
        <div className="km"><span className="k">实际收款</span><span className="v">{money(METRICS.cash)}</span></div>
        <div className="divider" />
        <div className="km"><span className="k">目标</span><span className="v">{money(METRICS.target)}</span></div>
        <div className="divider" />
        <div className="km"><span className="k">缺口</span><span className="v is-gap">{money(gap)}</span></div>
        <div className="divider" />
        <div className="km"><span className="k">完成率</span><span className="v">{rate}<small>%</small></span></div>
        <div className="kpi-cta">
          <button className="btn-primary" onClick={() => nav("/departments/200")}>
            <b>158</b> 个需介入客户 · 立即介入 <span className="arr">→</span>
          </button>
        </div>
      </section>

      {/* 链路弹窗 */}
      {view === "flow" && (
        <div className="demo-overlay" onClick={() => setView("brief")}>
          <section className="demo-panel glass-dark corners" onClick={(e) => e.stopPropagation()}>
            <div className="demo-h">
              <div>
                <b>黑灯处理链路 · PIPELINE</b>
                <span>销售个人黑灯处理链路 · 流程说明，不代表某条客户任务正在执行</span>
              </div>
              <button className="btn demo-close" onClick={() => setView("brief")}>关闭</button>
            </div>
            <div className="demo-kpis">
              <div className="demo-kpi"><small>日表扫描</small><b>22</b></div>
              <div className="demo-kpi"><small>待入账草稿</small><b>9</b></div>
              <div className="demo-kpi is-red"><small>风险标记</small><b>1</b></div>
              <div className="demo-kpi is-green"><small>资产命中</small><b>71%</b></div>
            </div>
            <ol className="night-lines" style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 14 }}>
              {[
                "日终扫描：B 线客户日表逐份对账，生成待入账草稿",
                "风险定级：异常信号进入红黄灯重排，红灯升级老板判断",
                "资产调用：命中作战资产话术，记录采纳率",
                "入账结算：黑灯复核后写入 A 线客户账本",
                "次日确认：晨间复核确认后正式生效",
              ].map((t, i) => (
                <p key={i}><span className="no" style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--cyan)", marginRight: 10 }}>0{i + 1}</span>{t}</p>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  )
}
