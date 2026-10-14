// ============================================================
// 应用装配：中间件顺序 + 路由挂载 + 静态站点 + 启动
// ============================================================
import express from "express"
import cors from "cors"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { traceId, securityHeaders, rateLimit, configNumber, requestLog, notFound, errorHandler, startMetricsSampler } from "./middleware/index.js"
import { ok } from "./lib/resp.js"
import authRoutes from "./routes/auth.js"
import userRoutes from "./routes/users.js"
import roleRoutes from "./routes/roles.js"
import dataRoutes from "./routes/data.js"
import logRoutes from "./routes/logs.js"
import monitorRoutes from "./routes/monitor.js"
import configRoutes from "./routes/configs.js"
import cockpitRoutes from "./routes/cockpit.js"

const __dir = dirname(fileURLToPath(import.meta.url))
export function createApp() {
  const app = express()
  app.set("trust proxy", true)
  app.disable("x-powered-by")

  app.use(cors({ origin: true, credentials: true, allowedHeaders: ["Content-Type", "Authorization", "X-Trace-Id"] }))
  app.use(express.json({ limit: "1mb" }))
  app.use(express.urlencoded({ extended: false }))
  app.use(traceId)
  app.use(securityHeaders)
  // 全局限流：阈值取自配置项 security.rateLimitPerMin（可在控制台「配置维护」中调整）
  app.use(rateLimit({ windowMs: 60_000, max: () => configNumber("security.rateLimitPerMin", 600), scope: "api" }))
  app.use(requestLog)

  // 登录接口单独从严限流（与账号失败锁定形成双层防护）
  app.use("/api/v1/auth/login", rateLimit({ windowMs: 15 * 60_000, max: 60, scope: "login" }))

  // 元信息
  app.get("/api/v1/meta", (req, res) => ok(res, {
    name: "CEO 驾驶舱控制台 API",
    version: "1.0.0",
    docs: "/api/v1/meta/endpoints",
    modules: ["auth 认证", "users 用户管理", "roles 角色权限", "data 数据管理", "logs 日志审计", "monitor 监控中心", "configs 配置维护", "cockpit 驾驶舱公开读"],
  }))

  app.get("/api/v1/meta/endpoints", (req, res) => ok(res, {
    envelope: { code: "0 表示成功", message: "提示信息", data: "业务数据", traceId: "链路 ID，可用于日志排查", ts: "服务端时间戳(ms)" },
    auth: ["POST /api/v1/auth/login", "POST /api/v1/auth/logout", "GET /api/v1/auth/me", "POST /api/v1/auth/change-password"],
    users: ["GET /api/v1/users", "GET /api/v1/users/:id", "POST /api/v1/users", "PATCH /api/v1/users/:id", "DELETE /api/v1/users/:id", "POST /api/v1/users/:id/reset-password", "POST /api/v1/users/:id/unlock"],
    roles: ["GET /api/v1/roles", "GET /api/v1/roles/:id", "POST /api/v1/roles", "PATCH /api/v1/roles/:id", "DELETE /api/v1/roles/:id", "PUT /api/v1/roles/:id/permissions", "GET /api/v1/roles/permissions"],
    data: ["GET /api/v1/data", "GET /api/v1/data/:resource", "GET /api/v1/data/:resource/:id", "POST /api/v1/data/:resource", "PATCH /api/v1/data/:resource/:id", "DELETE /api/v1/data/:resource/:id"],
    logs: ["GET /api/v1/logs/summary", "GET /api/v1/logs/audit", "GET /api/v1/logs/login", "DELETE /api/v1/logs/retention"],
    monitor: ["GET /api/v1/monitor/health", "GET /api/v1/monitor/overview", "GET /api/v1/monitor/endpoints", "GET /api/v1/monitor/series", "GET /api/v1/monitor/alerts"],
    configs: ["GET /api/v1/configs", "GET /api/v1/configs/:key", "POST /api/v1/configs", "PUT /api/v1/configs/:key", "PUT /api/v1/configs", "DELETE /api/v1/configs/:key"],
    cockpit: ["GET /api/v1/cockpit/overview（公开只读，驾驶舱全量聚合）", "GET /api/v1/cockpit/customers（公开只读，服务端筛选分页）"],
  }))

  app.use("/api/v1/auth", authRoutes)
  app.use("/api/v1/users", userRoutes)
  app.use("/api/v1/roles", roleRoutes)
  app.use("/api/v1/data", dataRoutes)
  app.use("/api/v1/logs", logRoutes)
  app.use("/api/v1/monitor", monitorRoutes)
  app.use("/api/v1/configs", configRoutes)
  app.use("/api/v1/cockpit", cockpitRoutes)

  app.use("/api", notFound)

  // 前端静态站点（构建产物存在时同源提供，避免跨域与额外部署）
  const candidates = [process.env.CEO_WEB_ROOT, join(__dir, "../dist-site"), join(__dir, "../dist")].filter(Boolean)
  const webRoot = candidates.find((p) => existsSync(join(p, "index.html")))
  if (webRoot) {
    app.use(express.static(webRoot, { index: false, maxAge: "1h" }))
    // SPA 兜底：非 /api 路径统一回落到入口页（Express 5 不支持 "*" 通配写法）
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next()
      res.sendFile(join(webRoot, "index.html"))
    })
  }

  app.use(errorHandler)
  return app
}

const isMain = process.argv[1] && process.argv[1].endsWith("index.js")
if (isMain) {
  const host = process.env.HOST || "0.0.0.0"
  const explicit = Number(process.env.PORT) || null
  // 未显式指定端口时：默认 8787，若被占用则依次顺延（同机多个项目默认都爱用 8787）
  const ports = explicit ? [explicit] : [8787, 8899, 8900, 8901, 8902]
  const app = createApp()

  const tryListen = (i) => {
    if (i >= ports.length) {
      console.error(`[ceo-cockpit] 端口全部被占用：${ports.join(", ")}`)
      console.error("[ceo-cockpit] 请用 PORT=<空闲端口> npm start 指定其他端口")
      process.exit(1)
    }
    const port = ports[i]
    const srv = app.listen(port, host)
    srv.once("listening", () => {
      if (i > 0) {
        console.log(`[ceo-cockpit] ⚠ 默认端口 ${ports[0]} 已被其他进程占用，已自动顺延到 ${port}`)
      }
      startMetricsSampler()
      console.log(`[ceo-cockpit] API + Web 已启动: http://localhost:${port}`)
      console.log(`[ceo-cockpit] 控制台入口: http://localhost:${port}/#/console`)
      console.log(`[ceo-cockpit] 接口清单: http://localhost:${port}/api/v1/meta/endpoints`)
      console.log(`[ceo-cockpit] 默认管理员: admin / admin123456（首次登录需改密）`)
    })
    srv.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`[ceo-cockpit] 端口 ${port} 被占用，尝试下一个…`)
        tryListen(i + 1)
        return
      }
      console.error(`[ceo-cockpit] 启动失败：${err.message}`)
      process.exit(1)
    })
  }
  tryListen(0)
}
