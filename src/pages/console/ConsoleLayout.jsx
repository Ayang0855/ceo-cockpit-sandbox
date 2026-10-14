import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { NavLink, Link, useNavigate, Outlet } from "react-router-dom"
import { api, clearAuth, getToken, getUser, isApiAvailable, probeApi, setUser } from "../../lib/api.js"
import { Field } from "./common.jsx"

// ---------- 全局提示 ----------
const ToastCtx = createContext({ push: () => {} })
export const useToast = () => useContext(ToastCtx)

function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((message, type = "ok", traceId = null) => {
    const id = Math.random().toString(36).slice(2)
    setItems((a) => [...a, { id, message, type, traceId }])
    setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), 3600)
  }, [])
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="c-toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={`c-toast ${t.type}`}>
            <div className="msg">{t.message}</div>
            {t.traceId && <div className="trace">TRACE {t.traceId}</div>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------- 侧栏菜单（按权限点过滤） ----------
const MENU = [
  { group: "总览", items: [
    { to: "/console", end: true, label: "控制台首页", perm: null, icon: "M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-5H4v5Zm10-16v4h6V4h-6Z" },
    { to: "/console/monitor", label: "监控中心", perm: "monitor:read", icon: "M3 12h4l2.5-7 4 14L16 12h5" },
  ] },
  { group: "组织与权限", items: [
    { to: "/console/users", label: "用户管理", perm: "user:read", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8c0-3.3 3.6-5 8-5s8 1.7 8 5" },
    { to: "/console/roles", label: "角色与权限", perm: "role:read", icon: "M12 3l8 4v5c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V7l8-4Z" },
  ] },
  { group: "数据与运维", items: [
    { to: "/console/data", label: "数据管理", perm: "data:read", icon: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" },
    { to: "/console/logs", label: "日志审计", perm: "log:read", icon: "M6 3h9l5 5v13H6V3Zm9 0v5h5M9 13h7M9 17h5" },
    { to: "/console/configs", label: "配置维护", perm: "config:read", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a8 8 0 0 0-2-1.2L15.2 3H8.8l-.4 2.5a8 8 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a8 8 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 2 1.2l.4 2.5h6.4l.4-2.5a8 8 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" },
  ] },
]

export default function ConsoleLayout() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [ready, setReady] = useState(false)
  const [apiOk, setApiOk] = useState(isApiAvailable())
  const [err, setErr] = useState("")
  const [pwdOpen, setPwdOpen] = useState(false)

  const loadMe = useCallback(async () => {
    const d = await api.me()
    setMe(d)
    setUser(d.user)
    return d
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const okApi = await probeApi()
      if (!alive) return
      setApiOk(okApi)
      if (!okApi) { setReady(true); return }
      if (!getToken()) { nav("/login", { replace: true, state: { from: "/console" } }); return }
      try {
        await loadMe()
      } catch (e) {
        if (!alive) return
        setErr(e.message)
        if ([40100, 40101, 40102].includes(e.code)) {
          clearAuth()
          nav("/login", { replace: true, state: { from: "/console" } })
        }
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => { alive = false }
  }, [nav, loadMe])

  // 权限判定：me 未加载完成时不显示「受限」，避免加载瞬间/后端未就绪时误以为控制台坏了
  const perms = useMemo(() => new Set(me?.permissionCodes || []), [me])
  const permsReady = !!me

  const logout = async () => {
    try { await api.logout() } catch { /* 网络异常也允许本地登出 */ }
    clearAuth()
    nav("/login", { replace: true })
  }

  const user = me?.user || getUser()
  const mustChange = !!user?.mustChangePassword

  return (
    <ToastProvider>
      <div className="console-shell">
        <aside className="console-side">
          <div className="side-brand">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span>
              <div className="t">控制台</div>
              <div className="s">COMPANY OS CONSOLE</div>
            </span>
          </div>
          <button type="button" className="back-cockpit" onClick={() => nav("/")}
            title="返回 CEO 驾驶舱（业务视图：晨报 / 全域沙盘 / 部门战情 / 客户经营 / 主管报告）">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
              <path d="M9 12h10" />
            </svg>
            返回驾驶舱
          </button>
          {MENU.map((g) => (
            <div key={g.group}>
              <div className="side-group">{g.group}</div>
              <nav className="side-nav">
                {g.items.map((it) => {
                  const allowed = !permsReady ? true : (!it.perm || perms.has(it.perm))
                  return allowed ? (
                    <NavLink key={it.to} to={it.to} end={it.end}
                      className={({ isActive }) => (isActive ? "on" : "")}>
                      <svg viewBox="0 0 24 24"><path d={it.icon} /></svg>
                      {it.label}
                    </NavLink>
                  ) : (
                    <a key={it.to} title={`缺少权限：${it.perm}`} style={{ opacity: 0.45, cursor: "not-allowed" }}>
                      <svg viewBox="0 0 24 24"><path d={it.icon} /></svg>
                      {it.label}<span className="lock">受限</span>
                    </a>
                  )
                })}
              </nav>
            </div>
          ))}
          <div className="side-foot">
            <div className="who">{user?.displayName || "未登录"}</div>
            <div className="role">{user?.roleName || "—"} {user?.username ? `· ${user.username}` : ""}</div>
            <button className="out" onClick={() => setPwdOpen(true)}>修改密码</button>
            <button className="out" onClick={logout}>退出登录</button>
          </div>
        </aside>

        <main className="console-main">
          {!apiOk && (
            <div className="c-hint-bar">
              未检测到后端服务，控制台不可用。启动后端：<code>npm run server</code>
              （默认 http://localhost:8787；若端口被其他项目占用，会自动顺延到 8899/8900 等，以启动日志为准）
            </div>
          )}
          {err && apiOk && <div className="c-hint-bar err">接口调用异常：{err}</div>}
          {mustChange && apiOk && (
            <div className="c-hint-bar">
              当前账号为首登/重置后的临时密码，请尽快修改。
              <button className="c-btn sm" style={{ marginLeft: 8 }} onClick={() => setPwdOpen(true)}>立即修改</button>
            </div>
          )}
          {!ready && <div className="c-empty">正在校验登录态…</div>}
          {ready && apiOk && <Outlet context={{ me, perms, apiOk, reloadMe: loadMe }} />}
          {ready && !apiOk && <div className="c-empty">后端未就绪，无法加载控制台数据。</div>}
        </main>

        {pwdOpen && (
          <ChangePasswordDrawer
            onClose={() => setPwdOpen(false)}
            onDone={async () => { setPwdOpen(false); await loadMe() }}
          />
        )}
      </div>
    </ToastProvider>
  )
}

// ---------- 自助修改密码 ----------
function ChangePasswordDrawer({ onClose, onDone }) {
  const { push } = useToast()
  const [oldPwd, setOldPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [repeat, setRepeat] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const submit = async () => {
    setErr("")
    if (newPwd.length < 8) return setErr("新密码至少 8 位")
    if (newPwd !== repeat) return setErr("两次输入的新密码不一致")
    setBusy(true)
    try {
      await api.changePassword(oldPwd, newPwd)
      push("密码已更新，请使用新密码重新登录", "ok")
      await onDone()
    } catch (e) {
      setErr(e.message)
      push(e.message, "err", e.traceId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer title="修改密码" sub="自助更新当前账号的登录密码" onClose={onClose}
      footer={<>
        <button className="c-btn" onClick={onClose}>取消</button>
        <button className="c-btn primary" disabled={busy} onClick={submit}>{busy ? "提交中…" : "确认修改"}</button>
      </>}>
      <Field label="原密码" required>
        <input className="c-input" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
      </Field>
      <Field label="新密码" required hint="至少 8 位，且不能与原密码相同">
        <input className="c-input" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
      </Field>
      <Field label="确认新密码" required>
        <input className="c-input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </Field>
      {err && <div className="c-hint-bar err">{err}</div>}
    </Drawer>
  )
}

// ---------- 通用小部件 ----------
export function ConsoleHead({ kicker, title, sub, children }) {
  return (
    <header className="console-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="acts">
        {children}
        <Link className="c-btn ghost back" to="/" title="返回 CEO 驾驶舱（业务视图）">
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 14, height: 14, marginRight: 4, verticalAlign: -2 }}>
            <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          返回驾驶舱
        </Link>
      </div>
    </header>
  )
}

export function Panel({ title, extra, children, id }) {
  return (
    <section className="c-panel glass corners" id={id}>
      {(title || extra) && (
        <div className="c-panel-h">
          <div className="t">{title}</div>
          <div>{extra}</div>
        </div>
      )}
      <div className="c-body">{children}</div>
    </section>
  )
}

export function Drawer({ title, sub, onClose, children, footer }) {
  return (
    <>
      <div className="c-drawer-mask" onClick={onClose} />
      <aside className="c-drawer" role="dialog" aria-modal="true">
        <div className="d-h">
          <div>
            <div className="t">{title}</div>
            {sub && <div className="s">{sub}</div>}
          </div>
          <button className="c-close" onClick={onClose}>✕</button>
        </div>
        <div className="d-body">{children}</div>
        {footer && <div className="d-foot">{footer}</div>}
      </aside>
    </>
  )
}

export function Tag({ tone = "gray", text }) {
  return <span className={`c-tag ${tone}`}><i style={{ background: "currentColor" }} />{text}</span>
}

export function Empty({ text }) {
  return <div className="c-empty">{text}</div>
}

export function Metric({ k, v, unit, extra, tone }) {
  return (
    <div className={`c-metric ${tone ? `tone-${tone}` : ""}`}>
      <div className="k">{k}</div>
      <div className="v">{v}{unit && <small>{unit}</small>}</div>
      {extra && <div className="x">{extra}</div>}
    </div>
  )
}

export function Loading({ text = "加载中…" }) {
  return <div className="c-empty">{text}</div>
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="c-hint-bar err">
      {error.message || "请求失败"}
      {error.traceId && <code style={{ marginLeft: 6 }}>traceId {error.traceId}</code>}
      {onRetry && <button className="c-btn sm" style={{ marginLeft: "auto" }} onClick={onRetry}>重试</button>}
    </div>
  )
}
