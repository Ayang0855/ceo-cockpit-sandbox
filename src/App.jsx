import React, { useEffect } from "react"
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom"

const AUTH_KEY = "ceo-cockpit-login"
const AUTH_VAL = "authenticated"
const isAuthed = () => sessionStorage.getItem(AUTH_KEY) === AUTH_VAL
export const signIn = () => sessionStorage.setItem(AUTH_KEY, AUTH_VAL)
export const signOut = () => sessionStorage.removeItem(AUTH_KEY)

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

// 登录守卫（驾驶舱视图）
function Guard({ children }) {
  const loc = useLocation()
  if (!isAuthed()) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return children
}

// 全局外壳：天空 / 星空 / 网格 / HUD / 备案
function Shell({ children }) {
  const { pathname } = useLocation()
  const isConsole = pathname.startsWith("/console")
  useEffect(() => {
    const cls = isConsole
      ? ["gui", "console-page"]
      : pathname === "/login"
        ? ["gui", "login-page"]
        : pathname === "/"
          ? ["home"]
          : pathname.startsWith("/sandbox")
            ? ["sandbox-page"]
            : ["gui"]
    document.body.classList.remove("home", "gui", "login-page", "sandbox-page", "console-page")
    document.body.classList.add(...cls)
  }, [pathname, isConsole])

  // 控制台使用独立浅色工作台外壳，不叠加驾驶舱的星空与 HUD
  if (isConsole) return <div className="console-shell-root">{children}</div>

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

// 控制台（后端管理台）
const ConsoleLayout = React.lazy(() => import("./pages/console/ConsoleLayout.jsx"))
const ConsoleHome = React.lazy(() => import("./pages/console/ConsoleHome.jsx"))
const MonitorPage = React.lazy(() => import("./pages/console/MonitorPage.jsx"))
const UsersPage = React.lazy(() => import("./pages/console/UsersPage.jsx"))
const RolesPage = React.lazy(() => import("./pages/console/RolesPage.jsx"))
const DataPage = React.lazy(() => import("./pages/console/DataPage.jsx"))
const LogsPage = React.lazy(() => import("./pages/console/LogsPage.jsx"))
const ConfigsPage = React.lazy(() => import("./pages/console/ConfigsPage.jsx"))

const Fallback = () => <div className="skeleton-block" role="status" style={{ minHeight: "100vh" }}>页面加载中…</div>

export default function App() {
  return (
    <Shell>
      <React.Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* 控制台：布局自带登录态校验与权限过滤 */}
          <Route path="/console" element={<ConsoleLayout />}>
            <Route index element={<ConsoleHome />} />
            <Route path="monitor" element={<MonitorPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="data" element={<DataPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="configs" element={<ConfigsPage />} />
            <Route path="*" element={<Navigate to="/console" replace />} />
          </Route>

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
