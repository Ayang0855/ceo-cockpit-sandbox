// ============================================================
// 驾驶舱公开读接口  /api/v1/cockpit
//   面向未登录的驾驶舱（早报 / 沙盘 / 客户经营 / 主管报告）
//   只读、聚合，返回口径与后端各表完全一致 —— 前端不再内置任何业务数字
//   说明：控制台写操作走 /api/v1/data（需认证），写完后驾驶舱立即读到新值
// ============================================================
import { Router } from "express"
import { db } from "../db.js"
import { ok } from "../lib/resp.js"

const router = Router()

// ---------- 工具 ----------
const rows = (sql, ...args) => db.prepare(sql).all(...args)
const one = (sql, ...args) => db.prepare(sql).get(...args)

function configMap() {
  const out = {}
  for (const r of rows("SELECT key, value, type FROM configs")) {
    if (r.type === "number") out[r.key] = Number(r.value)
    else if (r.type === "boolean") out[r.key] = r.value === "true" || r.value === "1"
    else if (r.type === "json") { try { out[r.key] = JSON.parse(r.value) } catch { out[r.key] = r.value } }
    else out[r.key] = r.value
  }
  return out
}

const parseJson = (s, fallback = {}) => {
  if (s === null || s === undefined || s === "") return fallback
  try { return JSON.parse(s) } catch { return fallback }
}
const tagsOf = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean)

// 形状转换：DB 行 → 驾驶舱字段（snake_case → 前端既有的 camelCase 形态）
const adaptDepartment = (r) => ({
  departmentId: r.id,
  id: r.id,
  name: r.name,
  codeName: r.code_name,
  dom: r.color,
  color: r.color,
  tagline: r.tagline,
  brief: r.brief,
  status: r.status,
  online: r.status === "online",
  mcp: !!r.mcp,
  members: r.members,
})

const adaptUnit = (r) => {
  const metrics = parseJson(r.metrics, {})
  return {
    unitId: r.id,
    id: r.id,
    name: r.name,
    dept: r.dept_name,
    deptName: r.dept_name,
    kind: r.kind,
    x: r.pos_x,
    y: r.pos_y,
    posX: r.pos_x,
    posY: r.pos_y,
    scale: r.scale,
    status: r.status,
    online: r.status === "online",
    mcp: !!r.mcp,
    metrics,
    // 沙盘浮层用的 [标签, 数值] 序列；离线单位只展示人数口径
    stats: Object.entries(metrics).map(([k, v]) => [k, String(v)]),
  }
}

const adaptCustomer = (r) => {
  const tags = tagsOf(r.tags)
  return {
    customerId: r.id,
    id: r.id,
    code: r.code,
    name: r.name,
    owner: r.owner,
    stage: r.stage,
    tags,
    nextFollow: r.next_follow,
    profileAt: r.profiled_at,
    level: r.level,
    needIntervention: tags.includes("需介入"),
    risky: tags.includes("风险"),
    red: r.level === "high" || tags.includes("风险") || tags.includes("需介入"),
  }
}

const adaptReport = (r) => ({
  reportId: r.id,
  id: r.id,
  kind: r.kind,
  title: r.title,
  generated: r.generated,
  at: r.generated,
  body: r.body,
  md: r.body, // 兼容前端 markdown 渲染入口
})

// ---------- GET /api/v1/cockpit/overview ----------
router.get("/overview", (req, res) => {
  const cfg = configMap()

  const allCustomers = rows("SELECT * FROM customers ORDER BY id ASC").map(adaptCustomer)
  const departments = rows("SELECT * FROM departments ORDER BY id ASC").map(adaptDepartment)
  const units = rows("SELECT * FROM sandbox_units ORDER BY pos_x ASC").map(adaptUnit)
  const reports = rows("SELECT * FROM reports ORDER BY generated DESC").map(adaptReport)

  const cashActual = Number(cfg["metrics.cashActual"] ?? 0)
  const cashTarget = Number(cfg["metrics.cashTarget"] ?? 0)
  const gap = cashTarget - cashActual
  const completionRate = cashTarget > 0 ? Number(((cashActual / cashTarget) * 100).toFixed(2)) : 0

  const needInterventionCustomers = allCustomers.filter((c) => c.needIntervention).length
  const riskCustomers = allCustomers.filter((c) => c.risky).length
  const highLevelCustomers = allCustomers.filter((c) => c.level === "high").length

  const stageBuckets = {}
  allCustomers.forEach((c) => { stageBuckets[c.stage] = (stageBuckets[c.stage] || 0) + 1 })

  return ok(res, {
    metrics: {
      cashActual,
      cashTarget,
      gap,
      completionRate,
      needIntervention: needInterventionCustomers,
      interventionThreshold: Number(cfg["metrics.interventionThreshold"] ?? 0),
      riskCustomers,
    },
    counts: {
      customers: allCustomers.length,
      needInterventionCustomers,
      riskCustomers,
      highLevelCustomers,
      departments: departments.length,
      onlineDepartments: departments.filter((d) => d.online).length,
      offlineDepartments: departments.filter((d) => !d.online).length,
      units: units.length,
      onlineUnits: units.filter((u) => u.online).length,
      offUnits: units.filter((u) => !u.online).length,
      reports: reports.length,
    },
    byStage: stageBuckets,
    // 列表（种子规模下一次性下发；后续数据量增大可改为分页 + query 参数）
    departments,
    units,
    customers: allCustomers,
    reports,
    site: {
      name: cfg["site.name"] ?? null,
      filing: cfg["site.filing"] ?? null,
    },
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
  })
})

// ---------- GET /api/v1/cockpit/customers ----------
// 客户经营页专用：服务端筛选 / 搜索 / 分页（口径与 /api/v1/data/customers 完全一致）
router.get("/customers", (req, res) => {
  const p = Math.max(1, Number(req.query.page) || 1)
  const size = Math.min(200, Math.max(1, Number(req.query.pageSize) || 12))
  const where = []
  const args = []

  if (req.query.keyword) {
    where.push("(name LIKE ? OR code LIKE ? OR owner LIKE ?)")
    const kw = `%${req.query.keyword}%`
    args.push(kw, kw, kw)
  }
  if (req.query.stage) { where.push("stage = ?"); args.push(req.query.stage) }
  if (req.query.owner) { where.push("owner = ?"); args.push(req.query.owner) }
  if (req.query.tag) { where.push("tags LIKE ?"); args.push(`%${req.query.tag}%`) }

  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : ""
  const total = one(`SELECT COUNT(*) AS c FROM customers${sql}`, ...args).c
  const list = rows(`SELECT * FROM customers${sql} ORDER BY id ASC LIMIT ? OFFSET ?`, ...args, size, (p - 1) * size)
    .map(adaptCustomer)

  return ok(res, {
    list,
    total,
    page: p,
    pageSize: size,
    pages: Math.max(1, Math.ceil(total / size)),
    // 下拉选项由后端给，前端不再各自写死，避免与库里枚举漂移
    options: {
      stages: ["已成交", "方案展示", "需求确认", "初步接洽", "商务谈判"],
      owners: rows("SELECT DISTINCT owner FROM customers WHERE owner <> '' ORDER BY owner").map((r) => r.owner),
      tags: ["已安排跟进", "需介入", "风险"],
    },
  })
})

export default router
