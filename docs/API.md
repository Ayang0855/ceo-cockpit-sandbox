# CEO 驾驶舱 · 后端控制台接口文档

> 版本 1.0.0 · Base URL `/api/v1` · 传输格式 JSON（UTF-8）
> 运行：`npm run server`（默认 `http://localhost:8787`，可用 `PORT`/`HOST` 覆盖）
> 联调自测：`npm run test:api`（149 项断言，需服务已启动）

---

## 1. 总体约定

### 1.1 统一响应包络

所有接口（含错误）返回同一结构：

```json
{
  "code": 0,          // 0 表示成功，非 0 为业务错误码
  "message": "ok",    // 人类可读提示，前端可直接 toast
  "data": { },        // 业务数据，失败时为 null
  "traceId": "tr_9f2c…",  // 链路 ID，同时写入响应头 X-Trace-Id 与审计日志
  "ts": 1791880000000 // 服务端时间戳（ms）
}
```

- 创建成功返回 HTTP `201`，其余成功为 `200`；业务失败按错误码映射 HTTP 状态（见 1.3）。
- `traceId` 可用于 `GET /logs/audit?traceId=…` 精确定位一次请求的完整留痕。

### 1.2 认证方式

`Authorization: Bearer <token>`；令牌由 `POST /auth/login` 签发（HS256 JWT，默认 7200 秒，`security.sessionTtl` 可调）。
令牌无需服务端存储：每次请求按令牌主体实时回查账号状态与权限点，因此改密/停用/改权限立即生效。

### 1.3 错误码体系

| 分段 | 含义 | 成员 |
|---|---|---|
| 0 | 成功 | — |
| 400xx | 参数与校验 | 40000 参数不合法 · 40001 字段校验未通过 · 40002 不支持的字段 |
| 401xx | 认证 | 40100 未携带令牌 · 40101 令牌过期 · 40102 令牌无效 · 40103 账号或密码错误 · 40104 账号已停用 · 40105 账号已锁定 |
| 403xx | 授权 | 40300 权限不足 · 40301 内置角色受保护 · 40302 内置数据受保护 |
| 404xx | 资源 | 40400 资源不存在 |
| 409xx | 冲突 | 40900 唯一性冲突 · 40901 状态冲突 |
| 429xx | 限流 | 42900 请求过于频繁 |
| 500xx | 服务端 | 50000 内部错误 · 50001 存储异常 |

HTTP 映射：`400xx→400`、`401xx→401`、`403xx→403`、`404xx→404`、`409xx→409`、`429xx→429`、`500xx→500`。
429 响应额外携带 `Retry-After`、`X-RateLimit-Limit`、`X-RateLimit-Remaining` 头。

### 1.4 异常处理方式（分层）

| 层 | 机制 | 说明 |
|---|---|---|
| 路由层 | `validate(schema)` | 声明式字段校验（required / minLen / maxLen / pattern / enum / type / default），失败抛 `40001`，`details` 携带逐字段错误 |
| 业务层 | `throw new ApiError(code, msg, details)` | 业务规则失败（唯一冲突、状态保护、权限不足）统一抛业务异常 |
| 数据层 | try/catch + UNIQUE 识别 | SQLite 约束冲突翻译为 `40900`，其余为 `50001` |
| 兜底层 | `errorHandler` 中间件 | 捕获未处理异常 → `50000`，记录错误堆栈与 traceId；生产环境不外泄堆栈细节 |
| 客户端 | `ApiError` 归一化 | 前端统一解包包络，`40100/40101/40102` 自动清登录态并跳转登录页 |

### 1.5 限流与安全

- 全局限流：滑动窗口（内存），阈值取配置项 `security.rateLimitPerMin`（默认 600 次/分钟/IP），修改后 5 秒内生效。
- 登录限流：`/auth/login` 单独 60 次 / 15 分钟 / IP，与「连续失败 5 次锁定 10 分钟」（`security.maxLoginFail` / `security.lockMinutes`）形成双层防护。
- 登录失败统一口径 `40103`，不区分「账号不存在」与「密码错误」，防账号枚举。
- 安全响应头：`X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`Referrer-Policy: no-referrer`。
- 密码存储：`scrypt` 加盐哈希，不落明文。
- 所有写操作（POST/PATCH/PUT/DELETE）自动写审计日志。

---

## 2. 权限点与角色（RBAC）

15 个权限点，6 个模块；前端侧栏与操作按钮按权限点过滤，后端接口二次强校验。

| 模块 | 权限点 |
|---|---|
| 用户管理 | `user:read` `user:create` `user:update` `user:delete` `user:reset_password` |
| 角色权限 | `role:read` `role:update` |
| 数据管理 | `data:read` `data:create` `data:update` `data:delete` |
| 日志审计 | `log:read` |
| 监控中心 | `monitor:read` |
| 配置维护 | `config:read` `config:update` |

内置角色（不可改名/删除，超管权限不可缩减）：

| 角色 | code | 权限 |
|---|---|---|
| 超级管理员 | `super_admin` | 全部 15 项 |
| 部门管理员 | `dept_admin` | 8 项（无用户写、无角色写、无配置写） |
| 运营人员 | `operator` | 5 项（数据读写 + 日志/监控只读） |
| 只读访客 | `viewer` | 2 项（`data:read` `monitor:read`） |

种子账号：`admin/admin123456`、`cs_lead/cs12345678`、`ops/ops12345678`、`viewer/view12345678`、`disabled_user/off12345678`（停用）。

---

## 3. 认证模块 `/auth`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/auth/login` | 公开 | 账号密码登录 |
| POST | `/auth/logout` | 登录 | 退出（客户端丢弃令牌 + 服务端审计） |
| GET | `/auth/me` | 登录 | 当前用户与权限 |
| POST | `/auth/change-password` | 登录 | 自助改密 |

**POST /auth/login** 请求 `{ username, password }`（password ≥ 6 位）
成功 `data`：

```json
{
  "token": "eyJhbGciOi…", "tokenType": "Bearer", "expiresIn": 7200,
  "expiresAt": "2026-10-13T10:34:21.000Z",
  "user": { "id": "u_admin", "username": "admin", "displayName": "系统管理员",
            "email": "…", "phone": "…", "deptId": 600, "roleId": "role_super_admin",
            "roleCode": "super_admin", "roleName": "超级管理员", "status": "active",
            "mustChangePassword": true, "lastLoginAt": "…", "createdAt": "…" },
  "permissions": ["user:read", "…"]
}
```

**GET /auth/me** → `{ user, permissions: [{code,name,module}], permissionCodes: ["…"] }`
**POST /auth/change-password** 请求 `{ oldPassword, newPassword }`（新 ≥ 8 位且不与原相同）→ `{ changed: true, reloginRequired: true }`

---

## 4. 用户管理 `/users`

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/users` | `user:read` |
| GET | `/users/:id` | `user:read` |
| POST | `/users` | `user:create` |
| PATCH | `/users/:id` | `user:update` |
| DELETE | `/users/:id` | `user:delete` |
| POST | `/users/:id/reset-password` | `user:reset_password` |
| POST | `/users/:id/unlock` | `user:update` |

**GET /users** 查询参数：`page` `pageSize`(≤100) `keyword`（匹配账号/姓名/邮箱/手机）`roleId` `status`(active/disabled) `deptId`
→ `{ total, page, pageSize, list: [User] }`

**User 数据结构**

```json
{ "id": "u_xxx", "username": "ops", "displayName": "运营专员", "email": "…", "phone": "…",
  "deptId": 400, "deptName": "私域部门", "roleId": "role_operator", "roleCode": "operator",
  "roleName": "运营人员", "status": "active", "mustChangePassword": false,
  "failCount": 0, "lockedUntil": null, "lastLoginAt": "…", "lastLoginIp": "…",
  "createdAt": "…", "updatedAt": "…", "createdBy": "u_admin" }
```

详情额外含 `permissions: string[]`。

**POST /users** 校验规则：`username` 3–32 位且 `^[a-zA-Z0-9_.-]+$`；`displayName` 必填 ≤32；`password` 8–128 位；`email` 合法邮箱或空；`phone` `^1[3-9]\d{9}$` 或空；`roleId` 必填；`status` 枚举；`mustChangePassword` 默认 `true`。

**PATCH /users/:id** 部分更新（displayName/email/phone/roleId/deptId/status），空 body → `40000`。

**安全约束（服务端强制）**

| 约束 | 错误码 |
|---|---|
| 不能修改自己的角色 | 40901 |
| 不能停用当前登录账号 | 40901 |
| 不能删除当前登录账号 | 40901 |
| 系统至少保留 1 个启用态超级管理员（降级/停用/删除） | 40901 |
| 用户名唯一 | 40900 |

**POST /users/:id/reset-password** `{ newPassword(≥8), mustChangePassword }` → 重置同时清零失败计数与锁定。
**POST /users/:id/unlock** → `{ unlocked: true }`。

---

## 5. 角色与权限 `/roles`

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/roles` | `role:read` 或 `user:read` |
| GET | `/roles/permissions` | `role:read` 或 `user:read` |
| GET | `/roles/:id` | `role:read` |
| POST | `/roles` | `role:update` |
| PATCH | `/roles/:id` | `role:update` |
| DELETE | `/roles/:id` | `role:update` |
| PUT | `/roles/:id/permissions` | `role:update` |

**Role 数据结构**

```json
{ "id": "role_xxx", "code": "operator", "name": "运营人员", "description": "…",
  "isBuiltin": true, "permissionCodes": ["data:read", "…"],
  "userCount": 1, "createdAt": "…", "updatedAt": "…" }
```

`GET /roles/permissions` → `{ total: 15, list: [{code,name,module,description}], groups: [{module, items}] }`

**POST /roles**：`code` 必填 `^[a-z][a-z0-9_]*$` 2–32 位；重复 → `40900`。
**PUT /roles/:id/permissions**：`{ permissionCodes: string[] }` **覆盖式更新**（未提交即移除）；空数组或含未知权限点 → `40000`；超级管理员缺项 → `40301`。
**DELETE /roles/:id**：内置角色 → `40301`；仍有用户绑定 → `40901`。

---

## 6. 数据管理 `/data`（通用资源接口）

面向 4 类业务资源提供**统一**的分页 / 检索 / 排序 / CRUD：

| resource | 表 | 说明 | filters | 搜索字段 | 可排序 |
|---|---|---|---|---|---|
| `departments` | departments | 部门 | `status` `mcp` | name, code_name | id, name, members, created_at |
| `units` | sandbox_units | 沙盘单位 | `status` `mcp` `kind` | name, dept_name | name, created_at, pos_x |
| `customers` | customers | 客户 | `stage` `owner` `level` | name, code, owner | name, created_at, stage |
| `reports` | reports | 报告 | `kind` | title, body | generated, created_at, title |

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/data` | `data:read`（资源目录 + 字段 Schema + 计数） |
| GET | `/data/:resource` | `data:read` |
| GET | `/data/:resource/:id` | `data:read` |
| POST | `/data/:resource` | `data:create` |
| PATCH | `/data/:resource/:id` | `data:update` |
| DELETE | `/data/:resource/:id` | `data:delete` |

**查询参数**：`page` `pageSize`(≤200) `keyword` `sort`（白名单外自动回落默认，防注入）`order`(asc/desc) + 各资源 `filters` + `updatedFrom`。

**GET /data** 返回的字段 Schema（前端据此动态渲染表单）：

```json
{ "resource": "customers", "label": "客户", "table": "customers", "count": 30,
  "fields": [ { "name": "stage", "type": "string", "required": false,
                "enum": ["已成交","方案展示","需求确认","初步接洽","商务谈判"] } ],
  "filters": ["stage","owner","level"], "searchable": ["name","code","owner"],
  "sorts": ["name","created_at","stage"] }
```

**写入校验（`buildWrite`）**：按资源 Schema 逐字段执行 类型 / 枚举 / 长度 / 数值范围 校验；新增要求必填齐全，更新仅接受出现的字段；任何违规 → `40001`，`details` 为逐条错误。主键/唯一冲突 → `40900`。

**保护规则**：`departments` 中 id=600（总经办）不可删除 → `40302`。

---

## 7. 日志审计 `/logs`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/logs/summary` | `log:read` | 概览与分布 |
| GET | `/logs/audit` | `log:read` | 操作审计（分页） |
| GET | `/logs/login` | `log:read` | 登录日志（分页） |
| DELETE | `/logs/retention` | `log:read` | 按保留天数清理 |

**GET /logs/audit** 参数：`page` `pageSize`(≤200) `module` `action` `method` `actorId` `traceId` `onlyError`(true) `keyword`（path/操作人/目标 ID）`from` `to`。

**AuditLog 数据结构**（数据库下划线字段已统一映射为驼峰）

```json
{ "id": 1, "traceId": "tr_…", "actorId": "u_admin", "actorName": "系统管理员",
  "module": "users", "action": "create", "method": "POST", "path": "/api/v1/users",
  "targetType": "user", "targetId": "u_xxx", "ip": "127.0.0.1", "ua": "…",
  "status": 201, "statusText": "成功", "errorCode": null, "durationMs": 3,
  "detail": { }, "createdAt": "2026-10-13 08:30:00" }
```

**LoginLog**：`{ id, username, userId, ip, ua, result: success|fail, resultText, reason, createdAt }`，`reason ∈ BAD_CREDENTIALS | LOCKED | DISABLED`。

**GET /logs/summary** → `{ auditTotal, auditToday, auditErrors, loginTotal, loginFailToday, topModules[], topErrors[], recentFails[] }`

**DELETE /logs/retention?days=30** → `{ retentionDays, auditDeleted, loginDeleted }`；`days` 缺省取配置项 `observability.logRetentionDays`。

---

## 8. 监控中心 `/monitor`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/monitor/health` | **公开** | 健康探针（供探测/降级判断） |
| GET | `/monitor/overview` | `monitor:read` | 运行总览 |
| GET | `/monitor/endpoints` | `monitor:read` | 接口级调用统计 Top30 |
| GET | `/monitor/series` | `monitor:read` | 时序指标（折线图） |
| GET | `/monitor/alerts` | `monitor:read` | 告警规则判定 |

**GET /monitor/health** → `{ status: up|degraded, checks: { api, database, disk }, uptimeSec, memoryMB, node, traceId, ts }`

**GET /monitor/overview** →

```json
{ "service":  { "name","version","status","startedAt","uptimeSec","node","pid" },
  "runtime":  { "cpuPct","cores","loadAvg":[…],"memRssMB","heapUsedMB","heapTotalMB","systemMemUsedPct" },
  "traffic":  { "totalRequests","totalErrors","errorRatePct","avgMs","p50Ms","p95Ms","p99Ms",
                "requestsLastHour","errorsLastHour" },
  "business": { "users","usersActive","departments","unitsOnline","customers",
                "highRiskCustomers","auditLogs","configs" } }
```

**GET /monitor/series?hours=24**（1–168 自动夹取）→ `{ hours, points: [{ ts, requests, errors, avgMs, p95Ms, memMB }] }`，数据来自 60 秒周期的 `metrics_snapshots` 采样。

**GET /monitor/alerts** → 4 条内置规则：

| 规则 | 指标 | 阈值 | 级别 |
|---|---|---|---|
| 接口错误率过高 | errorRatePct | > 5% | critical |
| 接口 P95 延迟过高 | p95Ms | > 800ms | warning |
| 系统内存占用过高 | systemMemUsedPct | > 90% | warning |
| 登录失败激增 | loginFailLastHour | > 20 次/小时 | warning |

→ `{ total, firing, list: [{ id, name, metric, value, threshold, op, level, action }] }`

---

## 9. 配置维护 `/configs`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/configs` | `config:read` | 分组列出（默认脱敏） |
| GET | `/configs/:key` | `config:read` | 单项 |
| POST | `/configs` | `config:update` | 新增 |
| PUT | `/configs/:key` | `config:update` | 更新单项 |
| PUT | `/configs` | `config:update` | 批量更新 |
| DELETE | `/configs/:key` | `config:update` | 删除 |

**Config 数据结构**

```json
{ "key": "integration.webhookSecret", "value": "••••••••", "type": "string",
  "group": "integration", "label": "回调签名密钥", "description": "…",
  "isSecret": true, "editable": true, "updatedAt": "…", "updatedBy": "system" }
```

**脱敏规则**：`isSecret=true` 的配置默认返回 `••••••••`；`?reveal=true` 且持有 `config:update` 权限时返回明文，响应 `masked:false`。

**类型系统** `string | number | boolean | enum | json`：读取时按类型还原（number→Number、boolean→Boolean、json→对象）；写入时校验（数字非 NaN、布尔仅 true/false、JSON 可解析），违规 → `40000`。

**批量更新** `PUT /configs` `{ items: [{key,value}] }` → 逐项校验、**部分成功**语义：
`{ updated: n, failed: m, items: […], errors: [{ key, message }] }`；全部失败才抛 `40001`。
**只读保护** `editable=false` → `40302`；密钥类不可通过接口删除 → `40302`。
**新增键名规则** `^[a-zA-Z][a-zA-Z0-9._-]*$` ≤64 位，重复 → `40900`。

内置配置：`site.*`（站点信息）、`metrics.*`（业务指标）、`security.*`（会话/锁定/限流，**运行时生效**）、`observability.*`（日志保留/强制留痕）、`integration.*`（告警回调，含 2 个密钥项）、`release.*`（发布开关）。

---

## 10. 驾驶舱公开读接口 `/cockpit`

面向**未登录的驾驶舱视图**（晨报 / 沙盘 / 客户经营 / 主管报告）的只读聚合接口。
数据与 `/data`、`/configs` 完全同源 —— 控制台改了数据或配置，驾驶舱刷新即生效，**前端不再内置任何业务数字**。

### 10.1 `GET /cockpit/overview`（无需认证）

一次返回驾驶舱全部所需数据：

```jsonc
{
  "metrics": {
    "cashActual": 775963,          // 取自配置项 metrics.cashActual
    "cashTarget": 900000,          // 取自配置项 metrics.cashTarget
    "gap": 124037,                 // 目标 - 实际
    "completionRate": 86.22,       // 实际 / 目标 × 100，保留 2 位
    "needIntervention": 5,         // tags 含「需介入」的客户数
    "interventionThreshold": 150,  // 取自配置项 metrics.interventionThreshold
    "riskCustomers": 13            // tags 含「风险」的客户数
  },
  "counts": {
    "customers": 30, "needInterventionCustomers": 5, "riskCustomers": 13, "highLevelCustomers": 5,
    "departments": 7, "onlineDepartments": 5, "offlineDepartments": 2,
    "units": 9, "onlineUnits": 8, "offUnits": 1,
    "reports": 2
  },
  "byStage": { "已成交": 6, "方案展示": 6, "需求确认": 6, "初步接洽": 6, "商务谈判": 6 },
  "departments": [ /* 已驼峰化：departmentId / codeName / dom / online / mcp / members … */ ],
  "units":       [ /* 含 x / y / scale / stats: [[标签,值],…]（由 metrics JSON 展开） */ ],
  "customers":   [ /* 含 needIntervention / risky / red 布尔标记 */ ],
  "reports":     [ /* 含 generated / body（同时给出 md 别名） */ ],
  "site": { "name": "…", "filing": "…" },
  "generatedAt": "2026-10-13 11:34:12"
}
```

### 10.2 `GET /cockpit/customers`（无需认证，服务端筛选分页）

| 参数 | 说明 |
|---|---|
| `page` / `pageSize` | 分页，`pageSize` 默认 12、上限 200 |
| `keyword` | 模糊匹配 `name` / `code` / `owner` |
| `stage` | 精确匹配销售阶段 |
| `owner` | 精确匹配归属销售 |
| `tag` | `tags` LIKE 匹配（如 `需介入`、`风险`） |

返回 `{ list, total, page, pageSize, pages, options }`；`options.stages / owners / tags` 由后端下发，前端下拉框不再写死枚举。

### 10.3 与前端的数据层约定

- `src/lib/dataset.js` 是驾驶舱唯一数据入口：`useCockpit()` 消费 `overview`，`useCustomers()` 消费 `customers`。
- 单次请求 + 模块级缓存 + 订阅广播：多页面共享一份数据，切页不重复请求。
- 后端不可用时回退 `src/data/db.js` 静态演示数据，页面永不白屏；页头徽标显示 `LIVE · 后端数据` 或 `DEMO · 本地演示`，一眼可辨数据口径。
- 后端从「不可用」翻转为「可用」时自动重新拉取（`onApiAvailabilityChange`）。

---

## 11. 前端接入说明

- 前端始终请求同源相对路径 `/api/v1/…`：开发态由 Vite 代理（`CEO_API_TARGET` 可指定后端），生产态由 Node 服务直接同源托管 `dist-site`，天然无跨域。
- `src/lib/api.js`：统一鉴权头、包络解包、`ApiError(code,message,traceId,details)`、`probeApi()` 探测降级（后端不可用时控制台明确提示而非白屏）。
- 驾驶舱数据层 `src/lib/dataset.js`：`useCockpit()` / `useCustomers()` 消费 `/cockpit` 公开聚合接口（见第 10 节），业务数字与列表全部由后端驱动。
- 控制台路由 `/console`：布局加载时校验登录态 → 拉取 `me` → 按权限点过滤菜单与操作按钮；未授权项置灰并标注缺少的权限码。
- 首登/重置密码后 `mustChangePassword=true` 会在控制台顶部常驻提示，侧栏「修改密码」可自助改密。

## 12. 快速自检

```bash
npm run server          # 启动 API + Web（默认 :8787）
npm run test:api        # 182 项断言联调（默认基线+一致性；--seed-strict 校验严格种子）
npm run db:check        # 数据体检：当前库 vs 代码种子，定位「改了代码库没跟上」的漂移
npm run db:reset        # 备份并按当前代码种子重建数据库
curl localhost:8787/api/v1/meta/endpoints   # 接口清单
```

浏览器打开 `http://localhost:8787/#/console`，默认管理员 `admin / admin123456`。
