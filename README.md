# 星澜智驭 · CEO 驾驶舱（Company OS Sandbox）

一个**CEO 经营驾驶舱 + 公司沙盘**的可视化系统实现：晨报总览、全域沙盘地图、部门战情、客户经营与主管报告。

> 本项目为**原创实现**：全部代码、演示数据与 Canvas 图形均为自研，未使用任何第三方站点的源码或图片素材。界面布局与视觉语言参考了同类「公司操作系统」产品的通用设计范式。

## 功能一览

| 页面 | 路由 | 说明 |
|---|---|---|
| 登录 | `#/login` | 访问门禁（演示模式：账号任意，密码 ≥ 6 位） |
| 晨报总览 | `#/` | AI 简报、部门矩阵、黑灯工厂智能体、CORE-METRICS 资金带、程序化全息城市 |
| 公司沙盘 | `#/sandbox` | 可拖拽/缩放的全域地图：六边形平台、建筑群、四色数据流、单位面板、小地图 |
| 部门战情 | `#/departments/:id` | KPI 卡组、关注事项、作战序列、黑灯夜报、作战资产、可下钻单元 |
| 治理详情 | `#/departments/:id/units/:unitId` | 治理进度链、事项要素、黑灯批注 |
| 客户经营 | `#/customers` | 搜索与多条件筛选、客户表格、分页 |
| 主管报告 | `#/reports` | 日报/周报切换、报告列表与正文 |

## 技术栈

- **构建**：Vite 8
- **框架**：React 18 + React Router 6（HashRouter，静态托管零配置）
- **样式**：原生 CSS 设计令牌体系（玻璃拟态、切角装饰、日夜双主题、HUD 装饰）
- **图表**：零图表库 —— 波形图、星空、全息城市、沙盘地图全部由原生 Canvas 程序化绘制，流程链由 SVG 绘制

## 目录结构

```
ceo-cockpit/
├── index.html
├── vite.config.js
├── src/
│   ├── main.jsx               # 入口 + 路由容器
│   ├── App.jsx                # 外壳（天空/星空/网格/HUD/备案）、登录守卫、路由表
│   ├── components/ui.jsx      # 品牌、金额脱敏、波形画布、分页、标签、页头
│   ├── data/db.js             # 演示数据层（部门/沙盘单位/数据流/客户/报告）
│   ├── lib/
│   │   ├── util.js            # 波形绘制、星空、格式化、时钟
│   │   ├── city.js            # 首页全息城市绘制
│   │   └── sandbox-map.js     # 沙盘世界坐标、六边形平台、建筑、数据流、小地图
│   ├── pages/                 # 7 个页面组件（懒加载）
│   └── styles/                # base / pages / sandbox 三层样式
└── .github/workflows/deploy.yml  # GitHub Pages 自动部署
```

## 本地运行

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # 构建到 dist/
npm run preview    # 预览构建产物
```

## 部署

- **GitHub Pages**：推送到 `main` 分支后，`.github/workflows/deploy.yml` 会自动构建并发布；访问 `https://<用户名>.github.io/<仓库名>/`。
- **任意静态托管**：`npm run build` 后将 `dist/` 目录整体上传即可（已使用相对基址与 Hash 路由，无需服务端重写规则）。

## 数据接入

所有演示数据集中在 `src/data/db.js`。接入真实后端时，将该文件替换为接口请求层即可，页面组件无需改动。
