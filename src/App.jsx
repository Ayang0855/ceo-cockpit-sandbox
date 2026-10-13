import React, { useEffect } from "react"
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom"

const AUTH_KEY = "ceo-cockpit-login"
const AUTH_VAL = "authenticated"
const isAuthed = () => sessionStorage.getItem(AUTH_KEY) === AUTH_VAL
export const signIn = () => sessionStorage.setItem(AUTH_KEY, AUTH_VAL)

function Stars() {
  useEffect(() => {
    let cleanup
    import("./lib/util.js").then(({ paintStars }) => {
      cleanup = paintStars(document.getElementById("stars"))
    })
    return () => cleanup && cleanup()
  }, [])
  return <canvas id="stars" className="stars-canvas" aria-hidden="true" />
}

// 登录守卫
function Guard({ children }) {
  const loc = useLocation()
  if (!isAuthed()) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return children
}

// 全局外壳：天空 / 星空 / 网格 / HUD / 备案
function Shell({ children }) {
  const { pathname } = useLocation()
  useEffect(() => {
    const cls = pathname === "/login"
      ? ["gui", "login-page"]
      : pathname === "/"
        ? ["home"]
        : pathname.startsWith("/sandbox")
          ? ["sandbox-page"]
          : ["gui"]
    document.body.classList.remove("home", "gui", "login-page", "sandbox-page")
    document.body.classList.add(...cls)
  }, [pathname])
  return (
    <>
      <div className="sky" aria-hidden="true" />
      {pathname === "/" && <Stars />}
      <div className="grid-bg" aria-hidden="true" />
      <div className="hud" aria-hidden="true">
        <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
        <span className="ticks-l" /><span className="ticks-r" />
      </div>
      {children}
      <footer className="site-filing-footer">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">演示复刻 · 仅作技术验证</a>
      </footer>
    </>
  )
}

const LoginPage = React.lazy(() => import("./pages/LoginPage.jsx"))
const HomePage = React.lazy(() => import("./pages/HomePage.jsx"))
const SandboxPage = React.lazy(() => import("./pages/SandboxPage.jsx"))
const DepartmentPage = React.lazy(() => import("./pages/DepartmentPage.jsx"))
const UnitPage = React.lazy(() => import("./pages/UnitPage.jsx"))
const CustomerListPage = React.lazy(() => import("./pages/CustomerListPage.jsx"))
const ReportsPage = React.lazy(() => import("./pages/ReportsPage.jsx"))

const Fallback = () => <div className="skeleton-block" role="status" style={{ minHeight: "100vh" }}>页面加载中…</div>

export default function App() {
  return (
    <Shell>
      <React.Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={
            <Guard>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/sandbox" element={<SandboxPage />} />
                <Route path="/departments/:departmentId" element={<DepartmentPage />} />
                <Route path="/departments/:departmentId/units/:unitId" element={<UnitPage />} />
                <Route path="/customers" element={<CustomerListPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Guard>
          } />
        </Routes>
      </React.Suspense>
    </Shell>
  )
}
