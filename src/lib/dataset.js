// ============================================================
// 驾驶舱数据层（唯一数据入口）
//   1) 全部业务数字与列表来自后端 GET /api/v1/cockpit/overview
//      —— 与后端各表、与控制台「数据管理」页共用同一份数据，口径天然一致
//   2) 后端不可用时回退 src/data/db.js 静态演示数据，保证驾驶舱永不白屏
//   3) 单次请求 + 模块级缓存 + 订阅广播：多个页面共享一份数据，切页不重复请求
// ============================================================
import { useCallback, useEffect, useState } from "react"
import { api, onApiAvailabilityChange } from "./api.js"
import {
  customers as staticCustomers,
  departments as staticDepartments,
  sandboxUnits as staticUnits,
  reports as staticReports,
} from "../data/db.js"

// ---------- 静态回退（仅演示兜底，非业务口径来源） ----------
const fallbackDepartments = () => staticDepartments
const fallbackUnits = () =>
  staticUnits.map((u) => ({ ...u, stats: u.stats.map(([k, v]) => [k, String(v)]) }))
const fallbackCustomers = () =>
  staticCustomers.map((c) => ({
    ...c,
    needIntervention: c.tags.includes("需介入"),
    risky: c.tags.includes("风险"),
  }))
const fallbackReports = () => staticReports

function fallbackOverview() {
  const customers = fallbackCustomers()
  const departments = fallbackDepartments()
  const units = fallbackUnits()
  const reports = fallbackReports()
  const cashActual = 775963
  const cashTarget = 900000
  return {
    metrics: {
      cashActual,
      cashTarget,
      gap: cashTarget - cashActual,
      completionRate: Number(((cashActual / cashTarget) * 100).toFixed(2)),
      needIntervention: customers.filter((c) => c.needIntervention).length,
      interventionThreshold: 150,
      riskCustomers: customers.filter((c) => c.risky).length,
    },
    counts: {
      customers: customers.length,
      needInterventionCustomers: customers.filter((c) => c.needIntervention).length,
      riskCustomers: customers.filter((c) => c.risky).length,
      highLevelCustomers: 0,
      departments: departments.length,
      onlineDepartments: departments.filter((d) => d.online).length,
      offlineDepartments: departments.filter((d) => !d.online).length,
      units: units.length,
      onlineUnits: units.filter((u) => u.online).length,
      offUnits: units.filter((u) => !u.online).length,
      reports: reports.length,
    },
    departments,
    units,
    customers,
    reports,
    site: { name: "星澜智驭 · CEO 驾驶舱", filing: "演示复刻 · 仅作技术验证" },
    generatedAt: null,
    __degraded: true,
  }
}

// ---------- 模块级 store：一次请求，多处订阅 ----------
let state = { data: null, source: "static", loading: true, error: null }
let inflight = null
let listenerBound = false
const subs = new Set()
const emit = () => subs.forEach((fn) => { try { fn(state) } catch { /* 忽略订阅方异常 */ } })

async function loadCockpit(force = false) {
  if (inflight && !force) return inflight
  state = { ...state, loading: true, error: null }
  emit()
  inflight = api
    .cockpitOverview()
    .then((d) => {
      state = { data: d, source: "api", loading: false, error: null }
      return state
    })
    .catch((e) => {
      state = { data: fallbackOverview(), source: "static", loading: false, error: e?.message || "后端不可用" }
      return state
    })
    .finally(() => { inflight = null; emit() })
  return inflight
}

/** 驾驶舱聚合数据：{ data, source, loading, error, reload } */
export function useCockpit() {
  const [s, setS] = useState(state)

  useEffect(() => {
    subs.add(setS)
    setS(state)
    if (!state.data && !inflight) loadCockpit()
    // 后端在页面打开后就绪时自动升级为真实数据
    if (!listenerBound) {
      listenerBound = true
      onApiAvailabilityChange((ok) => { if (ok) loadCockpit(true) })
    }
    return () => { subs.delete(setS) }
  }, [])

  return { ...s, reload: useCallback(() => loadCockpit(true), []) }
}

// ---------- 客户经营页：服务端筛选 / 搜索 / 分页 ----------
export const STAGES = ["已成交", "方案展示", "需求确认", "初步接洽", "商务谈判"]
export const TAG_FILTERS = ["全部客户", "需介入", "风险客户"]

export function useCustomers({ keyword = "", stage = "", owner = "", filter = TAG_FILTERS[0], page = 1, pageSize = 12 }) {
  const [s, setS] = useState({ list: [], total: 0, pages: 1, source: "static", loading: true, error: null })
  const [kwDebounced, setKwDebounced] = useState(keyword)
  const tagOf = { 需介入: "需介入", 风险客户: "风险" }[filter] || ""

  // 关键字输入防抖，避免逐字触发请求
  useEffect(() => {
    const t = setTimeout(() => setKwDebounced(keyword), 250)
    return () => clearTimeout(t)
  }, [keyword])

  const load = useCallback(async () => {
    setS((p) => ({ ...p, loading: true }))
    try {
      const d = await api.cockpitCustomers({ keyword: kwDebounced, stage, owner, tag: tagOf, page, pageSize })
      setS({ list: d.list || [], total: d.total || 0, pages: d.pages || 1, options: d.options, source: "api", loading: false, error: null })
    } catch (e) {
      // 回退：本地静态数据上做同样的筛选与分页
      let r = fallbackCustomers()
      const kw = kwDebounced.trim()
      if (kw) r = r.filter((c) => c.name.includes(kw) || c.code.includes(kw) || c.owner.includes(kw))
      if (stage) r = r.filter((c) => c.stage === stage)
      if (owner) r = r.filter((c) => c.owner === owner)
      if (tagOf) r = r.filter((c) => c.tags.includes(tagOf))
      const pages = Math.max(1, Math.ceil(r.length / pageSize))
      setS({
        list: r.slice((page - 1) * pageSize, page * pageSize),
        total: r.length, pages,
        options: { stages: STAGES, owners: ["李婷", "张三", "小林", "王磊"], tags: ["已安排跟进", "需介入", "风险"] },
        source: "static", loading: false, error: e?.message || "后端不可用",
      })
    }
  }, [kwDebounced, stage, owner, tagOf, page, pageSize])

  useEffect(() => { load() }, [load])
  return { ...s, reload: load }
}
