// ============================================================
// 后端控制台 · 全接口联调测试
//   运行：node server/tests/api-test.mjs [baseUrl]
//   默认 baseUrl = http://127.0.0.1:8787
//   退出码：0 全部通过；1 存在失败
// ============================================================
const BASE = (process.argv[2] || "http://127.0.0.1:8787") + "/api/v1"

let pass = 0, fail = 0
const failures = []

function chk(name, expected, actual) {
  const ok = String(expected) === String(actual)
  if (ok) { pass++; console.log(`  ✅ ${name}  →  ${actual}`) }
  else { fail++; failures.push({ name, expected, actual }); console.log(`  ❌ ${name}  期望 ${expected} 实得 ${actual}`) }
}

async function call(method, path, { body, token, query } = {}) {
  let url = BASE + path
  if (query) {
    const qs = new URLSearchParams()
    Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.append(k, v) })
    if (qs.toString()) url += `?${qs}`
  }
  const headers = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  let json = null
  try { json = await res.json() } catch { /* 非 JSON */ }
  return { status: res.status, ...(json || { code: "NON_JSON" }) }
}
const code = async (...a) => (await call(...a)).code
const data = async (...a) => (await call(...a)).data

function section(t) { console.log(`\n=== ${t} ===`) }

// ------------------------------------------------------------
const stamp = Date.now().toString(36)
const TMP_USER = `qa_${stamp}`
const TMP_ROLE_CODE = `qa_role_${stamp}`
const TMP_CUST = `C${stamp.slice(-6)}`
const TMP_CFG = `qa.flag_${stamp}`

let admin, viewerToken, adminToken

async function main() {
  section("1. 认证与令牌")
  const login = await call("POST", "/auth/login", { body: { username: "admin", password: "admin123456" } })
  chk("管理员登录", 0, login.code)
  adminToken = login.data?.token
  admin = login.data?.user
  chk("超级管理员权限点数量", 15, login.data?.permissions?.length)
  chk("登录返回 tokenType", "Bearer", login.data?.tokenType)
  chk("登录返回 expiresIn", "number", typeof login.data?.expiresIn)
  chk("未携带令牌", 40100, await code("GET", "/users"))
  chk("错误密码", 40103, await code("POST", "/auth/login", { body: { username: "admin", password: "wrong-password-x" } }))
  chk("密码过短→参数校验", 40001, await code("POST", "/auth/login", { body: { username: "admin", password: "1" } }))
  chk("不存在的账号(统一失败口径)", 40103, await code("POST", "/auth/login", { body: { username: "no_such_user_xyz", password: "whatever123" } }))
  chk("停用账号登录被拒", 40104, await code("POST", "/auth/login", { body: { username: "disabled_user", password: "off12345678" } }))
  chk("令牌无效", 40102, await code("GET", "/auth/me", { token: "bad.token.value" }))
  const me = await data("GET", "/auth/me", { token: adminToken })
  chk("me 返回 permissionCodes", true, Array.isArray(me?.permissionCodes) && me.permissionCodes.length === 15)
  chk("me 返回用户角色", "super_admin", me?.user?.roleCode)
  chk("健康检查免认证", 0, await code("GET", "/monitor/health"))

  section("2. 用户管理")
  let list = await data("GET", "/users", { token: adminToken, query: { page: 1, pageSize: 5 } })
  chk("用户总数=5", 5, list?.total)
  chk("分页字段完整", true, !!list?.page && !!list?.pageSize && Array.isArray(list?.list))
  chk("关键字筛选(name)", 1, (await data("GET", "/users", { token: adminToken, query: { keyword: "admin" } }))?.total)
  chk("中文关键字筛选", 1, (await data("GET", "/users", { token: adminToken, query: { keyword: "系统管理员" } }))?.total)
  chk("按角色筛选", 1, (await data("GET", "/users", { token: adminToken, query: { roleId: "role_super_admin" } }))?.total)
  chk("按状态筛选", 4, (await data("GET", "/users", { token: adminToken, query: { status: "active" } }))?.total)

  const created = await call("POST", "/users", {
    token: adminToken,
    body: { username: TMP_USER, displayName: "联调测试账号", password: "qa12345678", roleId: "role_viewer", email: "qa@cockpit.local", phone: "13900000099", mustChangePassword: true },
  })
  chk("新建用户", 0, created.code)
  chk("新建用户 HTTP 201", 201, created.status)
  const uid = created.data?.id
  chk("重复用户名", 40900, await code("POST", "/users", { token: adminToken, body: { username: TMP_USER, displayName: "X", password: "qa12345678", roleId: "role_viewer" } }))
  chk("用户名非法字符", 40001, await code("POST", "/users", { token: adminToken, body: { username: "非法 名", displayName: "X", password: "qa12345678", roleId: "role_viewer" } }))
  chk("邮箱格式校验", 40001, await code("POST", "/users", { token: adminToken, body: { username: `qa_bad${stamp}`, displayName: "X", password: "qa12345678", roleId: "role_viewer", email: "not-an-email" } }))
  chk("手机号格式校验", 40001, await code("POST", "/users", { token: adminToken, body: { username: `qa_bad2${stamp}`, displayName: "X", password: "qa12345678", roleId: "role_viewer", phone: "12345" } }))
  chk("密码长度校验", 40001, await code("POST", "/users", { token: adminToken, body: { username: `qa_bad3${stamp}`, displayName: "X", password: "123", roleId: "role_viewer" } }))
  chk("角色不存在", 40000, await code("POST", "/users", { token: adminToken, body: { username: `qa_bad4${stamp}`, displayName: "X", password: "qa12345678", roleId: "role_nope" } }))
  chk("状态枚举校验", 40001, await code("POST", "/users", { token: adminToken, body: { username: `qa_bad5${stamp}`, displayName: "X", password: "qa12345678", roleId: "role_viewer", status: "frozen" } }))
  chk("用户详情含权限点", true, Array.isArray((await data("GET", `/users/${uid}`, { token: adminToken }))?.permissions))
  chk("编辑用户", 0, await code("PATCH", `/users/${uid}`, { token: adminToken, body: { displayName: "联调测试账号-改名" } }))
  chk("空更新被拒", 40000, await code("PATCH", `/users/${uid}`, { token: adminToken, body: {} }))
  chk("重置密码", 0, await code("POST", `/users/${uid}/reset-password`, { token: adminToken, body: { newPassword: "newqa12345", mustChangePassword: true } }))
  chk("解锁账号", 0, await code("POST", `/users/${uid}/unlock`, { token: adminToken }))
  chk("不存在的用户详情", 40400, await code("GET", "/users/no_such_id", { token: adminToken }))
  chk("禁止修改自己的角色", 40901, await code("PATCH", `/users/${admin.id}`, { token: adminToken, body: { roleId: "role_viewer" } }))
  chk("禁止停用自己", 40901, await code("PATCH", `/users/${admin.id}`, { token: adminToken, body: { status: "disabled" } }))
  chk("禁止删除自己", 40901, await code("DELETE", `/users/${admin.id}`, { token: adminToken }))
  chk("唯一超管受保护", 40901, await code("DELETE", "/users/u_admin", { token: adminToken }))
  chk("删除测试用户", 0, await code("DELETE", `/users/${uid}`, { token: adminToken }))
  chk("重复删除", 40400, await code("DELETE", `/users/${uid}`, { token: adminToken }))

  section("3. 角色与权限")
  const roles = await data("GET", "/roles", { token: adminToken })
  chk("内置角色数=4", 4, roles?.total)
  chk("角色含用户计数", true, typeof roles?.list?.[0]?.userCount === "number")
  const catalog = await data("GET", "/roles/permissions", { token: adminToken })
  chk("权限点总数=15", 15, catalog?.total)
  chk("权限点分组数=6", 6, catalog?.groups?.length)
  const newRole = await call("POST", "/roles", { token: adminToken, body: { code: TMP_ROLE_CODE, name: "联调角色", description: "由联调脚本创建" } })
  chk("新建角色", 0, newRole.code)
  chk("新建角色 HTTP 201", 201, newRole.status)
  const rid = newRole.data?.id
  chk("重复角色编码", 40900, await code("POST", "/roles", { token: adminToken, body: { code: TMP_ROLE_CODE, name: "重复" } }))
  chk("角色编码格式校验", 40001, await code("POST", "/roles", { token: adminToken, body: { code: "BAD-CODE", name: "X" } }))
  chk("覆盖式设置权限", 0, await code("PUT", `/roles/${rid}/permissions`, { token: adminToken, body: { permissionCodes: ["log:read", "data:read"] } }))
  chk("权限点被替换生效", 2, (await data("GET", `/roles/${rid}`, { token: adminToken }))?.permissionCodes?.length)
  chk("未知权限点被拒", 40000, await code("PUT", `/roles/${rid}/permissions`, { token: adminToken, body: { permissionCodes: ["nope:nope"] } }))
  chk("权限点空数组被拒", 40000, await code("PUT", `/roles/${rid}/permissions`, { token: adminToken, body: { permissionCodes: [] } }))
  chk("超管权限不可缩减", 40301, await code("PUT", "/roles/role_super_admin/permissions", { token: adminToken, body: { permissionCodes: ["user:read"] } }))
  chk("内置角色不可改名", 40301, await code("PATCH", "/roles/role_viewer", { token: adminToken, body: { name: "改名" } }))
  chk("自定义角色可改名", 0, await code("PATCH", `/roles/${rid}`, { token: adminToken, body: { name: "联调角色V2" } }))
  chk("内置角色不可删除", 40301, await code("DELETE", "/roles/role_viewer", { token: adminToken }))
  chk("自定义角色可删除", 0, await code("DELETE", `/roles/${rid}`, { token: adminToken }))
  // 角色被用户占用时不可删除：新建角色 → 建用户绑定 → 删除应冲突 → 解绑后可删
  const ro2 = await call("POST", "/roles", { token: adminToken, body: { code: `${TMP_ROLE_CODE}b`, name: "占用测试角色" } })
  const rid2 = ro2.data?.id
  const u2 = await call("POST", "/users", { token: adminToken, body: { username: `${TMP_USER}b`, displayName: "占用测试", password: "qa12345678", roleId: rid2 } })
  chk("角色被占用时不可删除", 40901, await code("DELETE", `/roles/${rid2}`, { token: adminToken }))
  chk("解绑用户后角色可删", 0, await code("DELETE", `/users/${u2.data?.id}`, { token: adminToken }))
  chk("解绑后删除角色", 0, await code("DELETE", `/roles/${rid2}`, { token: adminToken }))

  section("4. 数据管理（通用资源接口）")
  const res = await data("GET", "/data", { token: adminToken })
  chk("资源种类=4", 4, res?.total)
  chk("资源目录含字段 Schema", true, Array.isArray(res?.list?.[0]?.fields) && !!res?.list?.[0]?.filters)
  chk("部门数据量=7", 7, (await data("GET", "/data/departments", { token: adminToken, query: { pageSize: 50 } }))?.total)
  chk("沙盘单位=9", 9, (await data("GET", "/data/units", { token: adminToken, query: { pageSize: 50 } }))?.total)
  chk("客户=30", 30, (await data("GET", "/data/customers", { token: adminToken, query: { pageSize: 50 } }))?.total)
  chk("报告=2", 2, (await data("GET", "/data/reports", { token: adminToken, query: { pageSize: 50 } }))?.total)
  chk("中文关键字筛选", true, (await data("GET", "/data/departments", { token: adminToken, query: { keyword: "客户" } }))?.total > 0)
  chk("状态筛选", true, (await data("GET", "/data/departments", { token: adminToken, query: { status: "online" } }))?.total === 5)
  chk("布尔字段筛选(已接入=4)", 4, (await data("GET", "/data/departments", { token: adminToken, query: { mcp: "true" } }))?.total)
  chk("排序参数生效", true, typeof (await data("GET", "/data/departments", { token: adminToken, query: { sort: "members", order: "desc" } }))?.list?.[0]?.members === "number")
  chk("非法排序字段回落默认", 0, await code("GET", "/data/departments", { token: adminToken, query: { sort: "1; DROP TABLE users" } }))
  chk("不支持的资源", 40400, await code("GET", "/data/unknown_res", { token: adminToken }))
  chk("资源详情", 0, await code("GET", "/data/customers/C26090", { token: adminToken }))
  const nc = await call("POST", "/data/customers", { token: adminToken, body: { id: TMP_CUST, code: `Z${stamp.slice(-5)}`, name: "联调客户", owner: "QA", stage: "初步接洽" } })
  chk("新增客户", 0, nc.code)
  chk("新增客户 HTTP 201", 201, nc.status)
  chk("主键冲突", 40900, await code("POST", "/data/customers", { token: adminToken, body: { id: TMP_CUST, code: "X", name: "重复" } }))
  chk("必填字段缺失", 40001, await code("POST", "/data/customers", { token: adminToken, body: { id: `C${stamp.slice(-5)}x` } }))
  chk("枚举值非法", 40001, await code("POST", "/data/customers", { token: adminToken, body: { id: `C${stamp.slice(-5)}y`, code: "Z", name: "X", stage: "不存在阶段" } }))
  chk("数值范围校验", 40001, await code("POST", "/data/units", { token: adminToken, body: { id: `qa-unit-${stamp}`, name: "X", pos_x: 5, pos_y: 0.5 } }))
  chk("字段长度校验", 40001, await code("POST", "/data/customers", { token: adminToken, body: { id: `C${stamp.slice(-5)}z`, code: "Z", name: "名称".repeat(30) } }))
  chk("部分更新", 0, await code("PATCH", `/data/customers/${TMP_CUST}`, { token: adminToken, body: { stage: "已成交", level: "vip" } }))
  chk("更新结果已落库", "已成交", (await data("GET", `/data/customers/${TMP_CUST}`, { token: adminToken }))?.stage)
  chk("空更新被拒", 40000, await code("PATCH", `/data/customers/${TMP_CUST}`, { token: adminToken, body: {} }))
  chk("删除数据", 0, await code("DELETE", `/data/customers/${TMP_CUST}`, { token: adminToken }))
  chk("内置部门受保护", 40302, await code("DELETE", "/data/departments/600", { token: adminToken }))
  chk("删除不存在的数据", 40400, await code("DELETE", `/data/customers/${TMP_CUST}`, { token: adminToken }))

  section("5. 日志审计")
  const sum = await data("GET", "/logs/summary", { token: adminToken })
  chk("日志概览含审计总量", true, typeof sum?.auditTotal === "number" && sum.auditTotal > 0)
  chk("日志概览含模块分布", true, Array.isArray(sum?.topModules))
  chk("日志概览含失败登录", true, Array.isArray(sum?.recentFails))
  const audit = await data("GET", "/logs/audit", { token: adminToken, query: { page: 1, pageSize: 5 } })
  chk("审计日志分页", true, audit?.total > 0 && audit.list.length <= 5)
  const row = audit?.list?.[0] || {}
  chk("审计字段驼峰化", true, ["traceId", "actorName", "durationMs", "createdAt", "statusText"].every((k) => k in row))
  chk("只看异常筛选", 0, await code("GET", "/logs/audit", { token: adminToken, query: { onlyError: "true" } }))
  chk("按方法筛选", true, (await data("GET", "/logs/audit", { token: adminToken, query: { method: "POST" } }))?.total > 0)
  chk("按关键字筛选", 0, await code("GET", "/logs/audit", { token: adminToken, query: { keyword: "users" } }))
  const lg = await data("GET", "/logs/login", { token: adminToken, query: { pageSize: 5 } })
  chk("登录日志可查", true, lg?.total > 0)
  chk("登录日志含结果文案", true, ["成功", "失败"].includes(lg?.list?.[0]?.resultText))
  chk("失败登录筛选", true, (await data("GET", "/logs/login", { token: adminToken, query: { result: "fail" } }))?.total > 0)
  chk("日志保留期清理", 0, await code("DELETE", "/logs/retention", { token: adminToken, query: { days: 30 } }))

  section("6. 监控中心")
  const ov = await data("GET", "/monitor/overview", { token: adminToken })
  chk("服务信息完整", true, !!ov?.service?.name && !!ov?.service?.node && typeof ov?.service?.uptimeSec === "number")
  chk("运行时指标完整", true, typeof ov?.runtime?.cpuPct === "number" && typeof ov?.runtime?.memRssMB === "number")
  chk("流量指标完整", true, typeof ov?.traffic?.totalRequests === "number" && typeof ov?.traffic?.p95Ms === "number")
  chk("业务指标完整", true, ov?.business?.users === 5 && ov?.business?.departments === 7)
  chk("接口级统计", 0, await code("GET", "/monitor/endpoints", { token: adminToken }))
  chk("接口统计含错误率", true, typeof (await data("GET", "/monitor/endpoints", { token: adminToken }))?.list?.[0]?.errorRatePct === "number")
  chk("时序指标", 0, await code("GET", "/monitor/series", { token: adminToken, query: { hours: 24 } }))
  chk("时序参数被夹取", 168, (await data("GET", "/monitor/series", { token: adminToken, query: { hours: 9999 } }))?.hours)
  const al = await data("GET", "/monitor/alerts", { token: adminToken })
  chk("告警规则数=4", 4, al?.total)
  chk("告警含判定级别", true, ["ok", "warning", "critical"].includes(al?.list?.[0]?.level))
  chk("健康检查返回数据库状态", "up", (await data("GET", "/monitor/health"))?.checks?.database?.status)

  section("7. 配置维护")
  const cfg = await data("GET", "/configs", { token: adminToken })
  chk("配置项数量=16", 16, cfg?.total)
  chk("默认脱敏", true, cfg?.masked === true)
  chk("密钥类配置已打码", true, cfg.list.filter((x) => x.isSecret).every((x) => x.value === "••••••••"))
  chk("非密钥可读明文", true, cfg.list.filter((x) => !x.isSecret).every((x) => x.value !== "••••••••"))
  const revealed = await data("GET", "/configs", { token: adminToken, query: { reveal: "true" } })
  chk("凭权限可查看明文", true, revealed?.masked === false && revealed.list.filter((x) => x.isSecret).every((x) => !String(x.value).includes("•")))
  chk("按分组筛选", true, (await data("GET", "/configs", { token: adminToken, query: { group: "security" } }))?.total === 4)
  chk("关键字检索", true, (await data("GET", "/configs", { token: adminToken, query: { keyword: "令牌" } }))?.total >= 1)
  chk("单条更新", 0, await code("PUT", "/configs/metrics.cashTarget", { token: adminToken, body: { value: 950000 } }))
  chk("更新值已生效", 950000, (await data("GET", "/configs/metrics.cashTarget", { token: adminToken }))?.value)
  chk("数字类型校验", 40000, await code("PUT", "/configs/metrics.cashTarget", { token: adminToken, body: { value: "abc" } }))
  chk("布尔类型校验", 40000, await code("PUT", "/configs/observability.auditWriteOnly", { token: adminToken, body: { value: "zzz" } }))
  chk("缺失 value 被拒", 40001, await code("PUT", "/configs/metrics.cashTarget", { token: adminToken, body: {} }))
  chk("不存在的配置键", 40400, await code("PUT", "/configs/no.such.key", { token: adminToken, body: { value: 1 } }))
  chk("批量更新", 0, await code("PUT", "/configs", { token: adminToken, body: { items: [{ key: "metrics.cashTarget", value: 900000 }, { key: "observability.logRetentionDays", value: 30 }] } }))
  const batch = await data("PUT", "/configs", { token: adminToken, body: { items: [{ key: "metrics.cashTarget", value: 900000 }, { key: "no.such.key", value: 1 }] } })
  chk("批量更新返回部分失败明细", true, batch?.failed === 1 && batch.errors?.[0]?.key === "no.such.key")
  chk("批量空数组被拒", 40000, await code("PUT", "/configs", { token: adminToken, body: { items: [] } }))
  const ncfg = await call("POST", "/configs", { token: adminToken, body: { key: TMP_CFG, value: "1", type: "number", group: "general", label: "联调项" } })
  chk("新增配置项", 0, ncfg.code)
  chk("新增配置项 HTTP 201", 201, ncfg.status)
  chk("重复配置键", 40900, await code("POST", "/configs", { token: adminToken, body: { key: TMP_CFG, value: "1" } }))
  chk("配置键格式校验", 40001, await code("POST", "/configs", { token: adminToken, body: { key: "9 bad key", value: "1" } }))
  chk("密钥类配置不可删除", 40302, await code("DELETE", "/configs/integration.webhookSecret", { token: adminToken }))
  chk("删除自建配置项", 0, await code("DELETE", `/configs/${TMP_CFG}`, { token: adminToken }))

  section("8. RBAC 越权与边界")
  const vLogin = await call("POST", "/auth/login", { body: { username: "viewer", password: "view12345678" } })
  viewerToken = vLogin.data?.token
  chk("viewer 登录成功", 0, vLogin.code)
  chk("viewer 权限点=2", 2, vLogin.data?.permissions?.length)
  chk("viewer 读用户 → 403", 40300, await code("GET", "/users", { token: viewerToken }))
  chk("viewer 读数据 → 允许", 0, await code("GET", "/data/departments", { token: viewerToken }))
  chk("viewer 写数据 → 403", 40300, await code("POST", "/data/customers", { token: viewerToken, body: { id: "C0001", code: "Z", name: "N" } }))
  chk("viewer 删数据 → 403", 40300, await code("DELETE", "/data/customers/C26090", { token: viewerToken }))
  chk("viewer 读日志 → 403", 40300, await code("GET", "/logs/audit", { token: viewerToken }))
  chk("viewer 读配置 → 403", 40300, await code("GET", "/configs", { token: viewerToken }))
  chk("viewer 读监控 → 允许", 0, await code("GET", "/monitor/overview", { token: viewerToken }))
  chk("viewer 读角色 → 403", 40300, await code("GET", "/roles", { token: viewerToken }))
  chk("viewer 提权尝试 → 403", 40300, await code("PUT", "/roles/role_viewer/permissions", { token: viewerToken, body: { permissionCodes: ["user:read"] } }))

  section("9. 统一响应包络与异常")
  const raw = await call("GET", "/monitor/health")
  chk("包络含 code/message/data/traceId/ts", true, ["code", "message", "data", "traceId", "ts"].every((k) => k in raw))
  chk("traceId 前缀", true, String(raw.traceId).startsWith("tr_"))
  chk("不存在的接口", 40400, await code("GET", "/no-such-endpoint", { token: adminToken }))
  chk("未认证访问受保护接口", 40100, await code("GET", "/logs/audit"))
  const badJson = await fetch(BASE + "/users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: "{not json" })
  chk("非法 JSON 请求体被拒", 50000, badJson.status >= 500 ? 50000 : 0)
  chk("安全响应头 X-Content-Type-Options", "nosniff", (await fetch(BASE + "/monitor/health")).headers.get("x-content-type-options"))
  chk("退出登录", 0, await code("POST", "/auth/logout", { token: adminToken }))

  console.log(`\n${"=".repeat(58)}`)
  console.log(`  结果：通过 ${pass} / 失败 ${fail}  （共 ${pass + fail} 项）`)
  if (failures.length) {
    console.log("\n  未通过明细：")
    failures.forEach((f) => console.log(`   · ${f.name}  期望 ${f.expected} 实得 ${f.actual}`))
  }
  console.log("=".repeat(58))
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error("联调脚本异常：", e); process.exit(1) })
