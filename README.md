# 星澜智驭 · CEO 驾驶舱（Company OS Sandbox）

一个**CEO 经营驾驶舱 + 公司沙盘 + 后端控制台**的全栈系统：晨报总览、全域沙盘地图、部门战情、客户经营、主管报告，以及完整的**后端管理控制台**（用户与权限 / 数据管理 / 日志审计 / 监控中心 / 配置维护）。

> 本项目为**原创实现**：全部代码、演示数据与 Canvas 图形均为自研，未使用任何第三方站点的源码或图片素材。界面布局与视觉语言参考了同类「公司操作系统」产品的通用设计范式。

## 功能一览

### 驾驶舱视图（业务侧）

| 页面 | 路由 | 说明 |
|---|---|---|
| 登录 | `#/login` | 访问门禁：优先走后端真实鉴权，后端未启动时自动降级为演示模式 |
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
| 数据管理 | `/console/data` | `data:*` | 4 类业务资源统一 CRUD、动态表单、字段筛选与白名单排序 |
| 日志审计 | `/console/logs` | `log:read` | 操作留痕 + 登录日志双视图、模块/错误码分布、保留期清理 |
| 配置维护 | `/console/configs` | `config:*` | 分组内联编辑、批量保存、类型校验、密钥脱敏/明文切换 |

控制台特性：菜单与按钮按权限点过滤（未授权项置灰标注）、首登/重置密码后强制提示改密、接口异常统一 toast 并展示 traceId、后端不可用时明确降级提示。

## 技术栈

- **构建**：Vite 8
- **框架**：React 18 + React Router 6（HashRouter，静态托管零配置）
- **样式**：原生 CSS 设计令牌体系（玻璃拟态、切角装饰、日夜双主题、HUD 装饰）
- **图表**：零图表库 —— 波形图、星空、全息城市、沙盘地图、监控时序图全部由原生 Canvas/SVG 程序化绘制
- **后端**：Express 5 + Node 22 内置 `node:sqlite`（零原生编译依赖）
- **安全**：自实现 JWT(HS256) + scrypt 密码哈希 + RBAC 权限点 + 登录锁定 + 滑动窗口限流 + 审计留痕
- **接口契约**：统一包络 `{code,message,data,traceId,ts}` + 三段式错误码体系（详见 [docs/API.md](docs/API.md)）

## 目录结构

```
ceo-cockpit/
├── index.html
├── vite.config.js             # 相对基址 + /api 代理 + 统一输出 dist-site
├── docs/API.md                # 后端接口文档（契约/数据结构/异常处理）
├── server/                    # 后端（Express 5 + node:sqlite）
│   ├── index.js               # 装配：中间件顺序、路由挂载、静态托管、SPA 兜底
│   ├── db.js                  # 12 张表 + 种子数据（角色/权限点/用户/业务数据/配置项）
│   ├── middleware/index.js    # traceId / 限流 / 认证 / 鉴权 / 审计 / 指标采样 / 异常兜底
│   ├── lib/                   # 错误码表、响应包络、令牌与密码
│   ├── routes/                # auth / users / roles / data / logs / monitor / configs
│   └── tests/api-test.mjs     # 149 项断言的全接口联调脚本（幂等）
├── src/
│   ├── main.jsx               # 入口 + 路由容器
│   ├── App.jsx                # 外壳、登录守卫、驾驶舱与控制台路由表
│   ├── components/ui.jsx      # 品牌、金额脱敏、波形画布、分页、标签、页头
│   ├── data/db.js             # 驾驶舱演示数据层
│   ├── lib/
│   │   ├── api.js             # API 客户端：鉴权头、包络解包、错误归一化、降级探测
│   │   ├── util.js            # 波形绘制、星空、格式化、时钟
│   │   ├── city.js            # 首页全息城市绘制
│   │   └── sandbox-map.js     # 沙盘世界坐标、六边形平台、建筑、数据流、小地图
│   ├── pages/                 # 驾驶舱 7 个页面组件（懒加载）
│   ├── pages/console/         # 控制台 1 个布局 + 7 个页面组件（懒加载）
│   └── styles/                # base / pages / sandbox / console 四层样式
└── .github/workflows/deploy.yml  # GitHub Pages 自动部署
```

## 本地运行

```bash
npm install
npm run server      # 启动后端 API + 同源托管前端（默认 http://localhost:8787）
npm run test:api    # 149 项接口联调断言（幂等，跑完数据回到种子状态）

npm run dev         # 前端开发服务器 http://localhost:5173（/api 自动代理到 8787）
npm run build       # 构建到 dist-site/
```

默认管理员：`admin / admin123456`（首登提示改密）；其他种子账号见 `docs/API.md` 第 2 节。

> 只跑前端（不启后端）时，登录自动降级为演示模式，`#/console` 会提示后端未就绪。

## 部署

- **同源一体化（推荐）**：`npm run server` 直接对外提供 API + 静态站点（读取 `dist-site`），无跨域、无额外配置。
- **GitHub Pages**：推送到 `main` 分支后，`.github/workflows/deploy.yml` 自动构建并发布 `dist-site`；访问 `https://<用户名>.github.io/<仓库名>/`。纯静态托管下驾驶舱视图完整可用，控制台需另起后端。
- **任意静态托管**：`npm run build` 后上传 `dist-site/`（已用相对基址与 Hash 路由，无需服务端重写规则）。

## 数据接入

- 驾驶舱演示数据集中在 `src/data/db.js`，页面组件不耦合数据来源。
- 控制台全部走真实接口：资源 Schema 由 `GET /api/v1/data` 动态下发，前端据此渲染表格与表单，新增资源无需改前端。
