# 星澜智驭 · CEO 驾驶舱（Company OS Sandbox）

一个**前后端同仓一体化**的全栈系统：CEO 经营驾驶舱 + 公司沙盘 + 后端管理控制台。

- **前端**：React 19 + React Router 7 + Vite 8，零图表库（Canvas/SVG 程序化绘制）
- **后端**：Express 5 + Node 22 内置 `node:sqlite`，零原生编译依赖
- **一体化**：一条 `npm run server` 同时提供 API 与前端站点，同源部署、天然无跨域

> **在线体验**：<https://ceo-cockpit-sandbox.app.workbuddy.host/>
> 手机 / 电脑直接打开即可（已做 375–430px 移动端适配）。登录 `admin / admin123456` 或 `cs_lead / cs12345678`。

> 本项目为**原创实现**：全部代码、演示数据与图形均为自研，未使用任何第三方站点的源码或图片素材。界面布局与视觉语言参考了同类「公司操作系统」产品的通用设计范式。

---

## 1. 快速开始（新克隆后 3 步跑起来）

> 环境要求：**Node.js ≥ 22.5**（`node:sqlite` 内置模块要求）。仓库已带 `.nvmrc`，可用 `nvm use` 切换。

```bash
git clone https://github.com/ayang8091/ceo-cockpit-sandbox.git
cd ceo-cockpit-sandbox

npm install          # 安装前后端全部依赖（单一 package.json，无需分包）

npm run start:prod   # 构建前端 + 启动后端，二者同源
# → API + Web 已启动: http://0.0.0.0:8787
# → 浏览器打开 http://localhost:8787/#/console
```

默认管理员 **`admin / admin123456`**（首登会提示改密）。其他种子账号见 [docs/API.md](docs/API.md) 第 2 节。

首次启动会自动创建 `server/data/cockpit.db` 并写入种子数据（15 权限点 / 4 角色 / 5 用户 / 7 部门 / 9 沙盘单位 / 30 客户 / 16 配置项），无需手工初始化数据库。配置项的**定义**（类型 / 分组 / 名称 / 说明）每次启动都会与代码同步，已修改的 `value` 不会被覆盖；业务数据发生漂移时可用 `npm run db:check` 定位、`npm run db:reset` 重建。

### 自检

```bash
npm run test:api     # 182 项接口联调断言（默认=基线+跨接口一致性；--seed-strict 校验严格种子）
npm run db:check     # 数据体检：当前库 vs 代码种子，定位「改了代码、库没跟上」的漂移
curl localhost:8787/api/v1/meta/endpoints   # 查看完整接口清单
```

---

## 2. 前后端如何衔接（无冲突设计）

| 关注点 | 设计 | 效果 |
|---|---|---|
| **接口地址** | 前端一律请求同源相对路径 `/api/v1/…`（`src/lib/api.js` 中写死相对路径） | 生产态由后端同源托管，**不存在跨域**；换域名/换端口无需改前端代码 |
| **开发态联调** | Vite `server.proxy` 把 `/api` 代理到 `CEO_API_TARGET`（默认 `http://127.0.0.1:8787`） | `npm run dev`（:5173）与 `npm run server`（:8787）可**同时运行**，端口不冲突 |
| **静态托管** | 后端按 `CEO_WEB_ROOT` → `dist-site` → `dist` 顺序探测并托管；未找到则只提供 API | 只跑后端不会报错；构建后自动接管前端路由（含 SPA 兜底） |
| **前端路由** | `HashRouter` + Vite `base: "./"` | 部署在根路径或任意子路径（含 GitHub Pages）都能直接用，**无需服务端重写规则** |
| **响应契约** | 统一包络 `{code,message,data,traceId,ts}`，前端 `ApiError` 统一解包与归一化 | 后端改错误码前端自动适配；401 系列自动清登录态并跳登录页 |
| **数据字段** | 后端出口全部驼峰化（`shapeAudit()` 等映射层），前端不感知数据库下划线字段 | 改表结构不影响前端 |
| **驾驶舱数据源** | 驾驶舱业务数字与列表全部来自公开聚合接口 `GET /api/v1/cockpit/overview`（`src/lib/dataset.js` 统一消费，模块级缓存 + 可用性翻转自动重拉） | **前端不再内置任何业务数字**：控制台改数/改配置，驾驶舱刷新即一致；后端不可用时回退演示数据并在页头显示 `DEMO` 徽标 |
| **资源扩展** | `GET /api/v1/data` 下发资源 Schema（字段/类型/枚举/筛选/排序） | 新增业务资源只改后端注册表，前端数据管理页**自动可读可写** |
| **降级容错** | `probeApi()` 探测后端可用性 | 后端未启动时控制台明确提示「后端未就绪」而非白屏；驾驶舱降级为演示模式 |
| **依赖管理** | 单一 `package.json` 同时包含前后端依赖，锁定在 `package-lock.json` | 一次 `npm ci` 装齐，无 monorepo/workspace 耦合问题 |

---

## 3. 功能一览

### 驾驶舱视图（业务侧）

| 页面 | 路由 | 说明 |
|---|---|---|
| 登录 | `#/login` | 走后端真实鉴权；后端未启动时自动降级为演示模式 |
| 晨报总览 | `#/` | AI 简报、部门矩阵、黑灯工厂智能体、CORE-METRICS 资金带、程序化全息城市 |
| 公司沙盘 | `#/sandbox` | 可拖拽/缩放的全域地图：六边形平台、建筑群、四色数据流、单位面板、小地图 |
| 部门战情 | `#/departments/:id` | KPI 卡组、关注事项、作战序列、黑灯夜报、作战资产、可下钻单元 |
| 治理详情 | `#/departments/:id/units/:unitId` | 治理进度链、事项要素、黑灯批注 |
| 客户经营 | `#/customers` | 搜索与多条件筛选、客户表格、分页 |
| 主管报告 | `#/reports` | 日报/周报切换、报告列表与正文 |

### 后端控制台（管理侧，`#/console`）

| 页面 | 路由 | 权限点 | 能力 |
|---|---|---|---|
| 控制台首页 | `/console` | — | 服务状态、业务规模、身份与权限点、最近操作留痕 |
| 监控中心 | `/console/monitor` | `monitor:read` | 运行时/流量/业务指标、SVG 时序趋势、4 条告警规则、接口级统计 |
| 用户管理 | `/console/users` | `user:*` | 分页检索、新建/编辑/删除、重置密码、解锁、内置安全约束 |
| 角色与权限 | `/console/roles` | `role:*` | 15 个权限点的矩阵化配置、角色 CRUD、覆盖式授权 |
| 数据管理 | `/console/data` | `data:*` | 4 类业务资源统一 CRUD、Schema 动态表单、字段筛选与白名单排序 |
| 日志审计 | `/console/logs` | `log:read` | 操作留痕 + 登录日志双视图、模块/错误码分布、保留期清理 |
| 配置维护 | `/console/configs` | `config:*` | 分组内联编辑、批量保存、类型校验、密钥脱敏/明文切换 |

控制台特性：菜单与按钮按权限点过滤（未授权项置灰并标注缺少的权限码）、首登/重置密码后强制提示改密、接口异常统一 toast 并展示 traceId。

---

## 4. 运行配置

所有配置项都有合理默认值，**不配置任何环境变量即可直接运行**。可复制 `.env.example` 为 `.env` 按需覆盖。

| 变量 | 默认值 | 作用 |
|---|---|---|
| `PORT` | `8787` | 后端监听端口 |
| `HOST` | `0.0.0.0` | 后端监听地址 |
| `CEO_WEB_ROOT` | 空 | 前端构建产物目录；留空则回退 `dist-site` → `dist` |
| `CEO_DATA_DIR` | `server/data` | SQLite 数据目录（自动创建） |
| `CEO_DB_FILE` | `server/data/cockpit.db` | SQLite 数据库文件 |
| `CEO_JWT_SECRET` | 开发用回退值 | JWT 签名密钥，**生产必须替换** |
| `CEO_API_TARGET` | `http://127.0.0.1:8787` | 仅 `npm run dev` 的代理目标 |

> 业务侧运行参数（会话 TTL、登录失败阈值、锁定时长、限流阈值、日志保留天数等）不放在环境变量里，而是存在 `configs` 表中，可在控制台 **配置维护** 页面在线修改并即时生效（中间件按 5 秒缓存动态读取）。

---

## 5. 项目结构

```
ceo-cockpit/
├── index.html                      # 前端入口 HTML
├── vite.config.js                  # 相对基址 + /api 开发代理 + 统一输出 dist-site
├── package.json                    # 前后端统一依赖与脚本
├── .nvmrc / .env.example           # 运行时版本与配置示例
├── docs/API.md                     # 后端接口文档（契约 / 数据结构 / 异常处理 / 权限矩阵）
├── server/                         # ── 后端（Express 5 + node:sqlite）
│   ├── index.js                    #   装配：中间件顺序、路由挂载、静态托管、SPA 兜底
│   ├── db.js                       #   12 张表 + 幂等种子数据
│   ├── middleware/index.js         #   traceId / 限流 / 认证 / 鉴权 / 审计 / 指标采样 / 异常兜底
│   ├── lib/                        #   错误码表、响应包络、JWT 与密码哈希
│   ├── routes/                     #   auth / users / roles / data / logs / monitor / configs
│   └── tests/api-test.mjs          #   149 项断言的全接口联调脚本（幂等）
├── src/                            # ── 前端（React 19 + Vite 8）
│   ├── main.jsx                    #   入口 + HashRouter 容器
│   ├── App.jsx                     #   外壳、登录守卫、驾驶舱与控制台路由表
│   ├── components/ui.jsx           #   通用部件（品牌/脱敏金额/波形画布/分页/标签/页头）
│   ├── lib/
│   │   ├── api.js                  #   API 客户端：鉴权头、包络解包、错误归一化、降级探测
│   │   ├── util.js                 #   波形绘制、星空、格式化、时钟
│   │   ├── city.js                 #   首页全息城市绘制
│   │   └── sandbox-map.js          #   沙盘世界坐标、六边形平台、建筑、数据流、小地图
│   ├── data/db.js                  #   驾驶舱演示数据层
│   ├── pages/                      #   驾驶舱 7 个页面组件（懒加载）
│   ├── pages/console/              #   控制台 1 个布局 + 7 个页面组件（懒加载）
│   └── styles/                     #   base / pages / sandbox / console 四层样式
└── .github/workflows/deploy.yml    # GitHub Pages 自动部署（构建 dist-site）
```

---

## 6. 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 前端开发服务器 `:5173`（`/api` 自动代理到后端） |
| `npm run build` | 构建前端到 `dist-site/` |
| `npm run preview` | 预览构建产物（纯静态，另需单独启动后端） |
| `npm run server` / `npm start` | 启动后端 API + 同源托管已有构建产物 |
| `npm run start:prod` | `build` + `server`，一条命令跑起完整生产形态 |
| `npm run test:api` | 182 项接口联调断言（需后端已启动；业务数据只做基线与一致性校验） |
| `npm run db:check` | 数据体检：对比当前库与代码种子，列出漂移字段（退出码 1 = 有漂移） |
| `npm run db:reset` | 备份当前库到 `server/data/backup-<时间戳>.db` 后按当前种子重建（保留最近 5 份备份） |
| `npm run prepare:deploy` | 生成「发布就绪」目录 `../ceo-cockpit-deploy`（前端产物改名为 `public-site/`、只带运行时依赖、JWT 密钥固定），用于单端口公网发布 |

---

## 7. 部署方式

1. **同源一体化（推荐）**：`npm run start:prod` 后由 Node 进程同时对外提供 API 与静态站点。适合自有服务器 / 容器 / PaaS，无跨域、无额外网关配置。
2. **前端静态托管 + 后端独立部署**：
   - 前端：`npm run build`，把 `dist-site/` 上传到任意静态托管。驾驶舱视图完整可用；控制台需把 `/api` 反向代理到后端，或设置 `CEO_WEB_ROOT` 由后端托管。
   - 后端：`npm run server`，用 `CEO_JWT_SECRET` 注入生产密钥、`CEO_DATA_DIR` 指向持久化卷。
3. **GitHub Pages**：推送到 `main` 分支后 `.github/workflows/deploy.yml` 自动构建发布 `dist-site`，访问 `https://<用户名>.github.io/<仓库名>/`。纯静态环境下驾驶舱可用（数据层会自动回退演示数据并显示 `DEMO` 徽标），控制台需另起后端（见方式 2）。

### 4. 单端口公网发布（当前线上形态）

`npm run prepare:deploy` 会生成发布副本（`public-site/` 承载前端、`server/` 承载 API、仅保留 `express`+`cors` 运行时依赖、JWT 密钥固定以免重新发布后登录态失效），随后把该目录发布为一个 HTTP 服务即可——**前端与后端同源、同一条链接**，无需额外配置域名、跨域或反向代理：

```bash
npm run build            # 产出 dist-site
npm run prepare:deploy   # → ../ceo-cockpit-deploy
```

当前线上：**<https://ceo-cockpit-sandbox.app.workbuddy.host/>**

---

## 8. 安全说明（生产部署前必读）

- **必须替换 `CEO_JWT_SECRET`**，否则令牌签名可被伪造。
- 首次登录后**立即修改默认管理员密码**；`admin` 种子账号带 `mustChangePassword` 标记，控制台会持续提示。
- 数据目录 `server/data/` 已加入 `.gitignore`，**不要提交**（含审计日志与账号哈希）。
- 生产建议置于 HTTPS 反向代理之后，并保留 `X-Forwarded-For`（后端已 `trust proxy`，限流按真实 IP 计数）。
