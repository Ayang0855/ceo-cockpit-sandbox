import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { signIn } from "../App.jsx"

export default function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const [account, setAccount] = useState("")
  const [pwd, setPwd] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  // 演示复刻：任意非空账号 + 密码（≥6 位）即可进入
  async function onSubmit(e) {
    e.preventDefault()
    setErr("")
    setBusy(true)
    await new Promise((r) => setTimeout(r, 500))
    if (account.trim() && pwd.length >= 6) {
      signIn()
      nav(loc.state?.from ?? "/", { replace: true })
    } else {
      setErr("账号或密码错误")
    }
    setBusy(false)
  }

  return (
    <main className="login-page-shell">
      <section className="login-card glass corners rise" aria-labelledby="login-title">
        <div className="login-brand-mark" aria-hidden="true"><span /></div>
        <p className="login-kicker">COMPANY OS · ACCESS GATE</p>
        <h1 id="login-title">登录驾驶舱</h1>
        <p className="login-intro">请输入固定访问账号，验证通过后进入经营视图。</p>
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
        <p className="login-tip">演示复刻版：账号任意，密码 ≥ 6 位即可登录</p>
      </section>
    </main>
  )
}
