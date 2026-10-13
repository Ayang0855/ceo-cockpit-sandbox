import { useState } from "react"
import { useNavigate, useLocation, Link } from "react-router-dom"
import { signIn } from "../App.jsx"
import { api, setToken, setUser, probeApi } from "../lib/api.js"

export default function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const [account, setAccount] = useState("")
  const [pwd, setPwd] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  // 登录：优先走后端真实鉴权；后端不可用时降级为本地演示登录
  async function onSubmit(e) {
    e.preventDefault()
    setErr("")
    setBusy(true)
    const user = account.trim()
    try {
      const online = await probeApi()
      if (online) {
        const d = await api.login(user, pwd)
        setToken(d.token)
        setUser(d.user)
        signIn()
        nav(loc.state?.from ?? "/console", { replace: true })
        return
      }
      // 降级：任意非空账号 + 密码 ≥ 6 位
      if (user && pwd.length >= 6) {
        signIn()
        nav(loc.state?.from ?? "/", { replace: true })
      } else {
        setErr("账号或密码错误")
      }
    } catch (e2) {
      setErr(e2.code === -1 ? "无法连接后端服务，请确认服务已启动" : e2.message || "登录失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page-shell">
      <section className="login-card glass corners rise" aria-labelledby="login-title">
        <div className="login-brand-mark" aria-hidden="true"><span /></div>
        <p className="login-kicker">COMPANY OS · ACCESS GATE</p>
        <h1 id="login-title">登录驾驶舱</h1>
        <p className="login-intro">使用分配的账号登录，进入经营视图与后端控制台。</p>
        <form className="login-form" onSubmit={onSubmit}>
          <label>
            <span>账号</span>
            <input name="account" autoComplete="username" autoFocus required value={account}
              onChange={(e) => setAccount(e.target.value)} />
          </label>
          <label>
            <span>密码</span>
            <input name="password" type="password" autoComplete="current-password" required value={pwd}
              onChange={(e) => setPwd(e.target.value)} />
          </label>
          {err && <p className="login-error" role="alert">{err}</p>}
          <button className="login-submit" disabled={busy} type="submit">{busy ? "验证中…" : "登录"}</button>
        </form>
        <p className="login-tip">
          默认管理员 <code>admin / admin123456</code>（首次登录建议修改密码）
        </p>
        <p className="login-tip">
          未启动后端时自动降级为演示模式 · <Link to="/">返回驾驶舱</Link>
        </p>
      </section>
    </main>
  )
}
