// ============================================================
// SQLite 数据层（node:sqlite 内置模块）+ 建表 + 种子数据
// ============================================================
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdirSync } from "node:fs"
import { hashPassword } from "./lib/security.js"

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.CEO_DATA_DIR || join(__dir, "data")
mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(process.env.CEO_DB_FILE || join(DATA_DIR, "cockpit.db"))
db.exec("PRAGMA journal_mode = WAL;")
db.exec("PRAGMA foreign_keys = ON;")

// ------------------------------------------------------------
// 表结构
//   users / roles / permissions / role_permissions
//   departments / sandbox_units / customers / reports        —— 业务数据
//   audit_logs / login_logs                                  —— 日志
//   configs / metrics_snapshots                              —— 配置与监控
// ------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS permissions (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  module      TEXT NOT NULL,
  description TEXT,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  is_builtin  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id         TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  dept_id       INTEGER,
  role_id       TEXT NOT NULL REFERENCES roles(id),
  status        TEXT NOT NULL DEFAULT 'active',
  must_change   INTEGER NOT NULL DEFAULT 0,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  last_login_ip TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  created_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS departments (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  code_name  TEXT,
  color      TEXT,
  tagline    TEXT,
  brief      TEXT,
  status     TEXT NOT NULL DEFAULT 'online',
  mcp        INTEGER NOT NULL DEFAULT 0,
  members    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sandbox_units (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  dept_name  TEXT,
  kind       TEXT,
  pos_x      REAL NOT NULL DEFAULT 0.5,
  pos_y      REAL NOT NULL DEFAULT 0.5,
  scale      REAL NOT NULL DEFAULT 1,
  status     TEXT NOT NULL DEFAULT 'online',
  mcp        INTEGER NOT NULL DEFAULT 0,
  metrics    TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  owner       TEXT,
  stage       TEXT,
  tags        TEXT,
  next_follow TEXT,
  profiled_at TEXT,
  level       TEXT NOT NULL DEFAULT 'normal',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_stage ON customers(stage);
CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner);

CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  generated  TEXT,
  body       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id    TEXT,
  actor_id    TEXT,
  actor_name  TEXT,
  module      TEXT,
  action      TEXT,
  method      TEXT,
  path        TEXT,
  target_type TEXT,
  target_id   TEXT,
  ip          TEXT,
  ua          TEXT,
  status      INTEGER NOT NULL DEFAULT 0,
  error_code  INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  detail      TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module);

CREATE TABLE IF NOT EXISTS login_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT,
  user_id    TEXT,
  ip         TEXT,
  ua         TEXT,
  result     TEXT NOT NULL,
  reason     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_created ON login_logs(created_at);

CREATE TABLE IF NOT EXISTS configs (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  type        TEXT NOT NULL DEFAULT 'string',
  group_name  TEXT NOT NULL DEFAULT 'general',
  label       TEXT,
  description TEXT,
  is_secret   INTEGER NOT NULL DEFAULT 0,
  editable    INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  cpu_pct    REAL,
  mem_rss    INTEGER,
  heap_used  INTEGER,
  req_count  INTEGER NOT NULL DEFAULT 0,
  err_count  INTEGER NOT NULL DEFAULT 0,
  avg_ms     REAL NOT NULL DEFAULT 0,
  p95_ms     REAL NOT NULL DEFAULT 0
);
`)

// ------------------------------------------------------------
// 权限点与内置角色
// ------------------------------------------------------------
const PERMISSIONS = [
  ["user:read", "查看用户", "用户管理"],
  ["user:create", "新建用户", "用户管理"],
  ["user:update", "编辑用户", "用户管理"],
  ["user:delete", "删除用户", "用户管理"],
  ["user:reset_password", "重置密码", "用户管理"],
  ["role:read", "查看角色权限", "角色权限"],
  ["role:update", "调整角色权限", "角色权限"],
  ["data:read", "查看业务数据", "数据管理"],
  ["data:create", "新增业务数据", "数据管理"],
  ["data:update", "编辑业务数据", "数据管理"],
  ["data:delete", "删除业务数据", "数据管理"],
  ["log:read", "查看日志", "日志审计"],
  ["monitor:read", "查看监控", "监控中心"],
  ["config:read", "查看配置", "配置维护"],
  ["config:update", "修改配置", "配置维护"],
]

const ROLES = [
  {
    code: "super_admin", name: "超级管理员", builtin: 1,
    description: "拥有全部权限，可管理用户、角色、配置与全部业务数据",
    perms: PERMISSIONS.map((p) => p[0]),
  },
  {
    code: "dept_admin", name: "部门管理员", builtin: 1,
    description: "管理本部门业务数据，可查看用户、日志与监控，无系统配置写权限",
    perms: ["user:read", "role:read", "data:read", "data:create", "data:update", "log:read", "monitor:read", "config:read"],
  },
  {
    code: "operator", name: "运营人员", builtin: 1,
    description: "业务数据读写，可查看监控与日志，不可管理用户与配置",
    perms: ["data:read", "data:create", "data:update", "log:read", "monitor:read"],
  },
  {
    code: "viewer", name: "只读访客", builtin: 1,
    description: "仅可查看业务数据与监控，不能进行任何写操作",
    perms: ["data:read", "monitor:read"],
  },
]

const nowISO = () => new Date().toISOString().replace("T", " ").slice(0, 19)

export function seedIfEmpty() {
  const permCount = db.prepare("SELECT COUNT(*) AS c FROM permissions").get().c
  if (permCount === 0) {
    const stmt = db.prepare("INSERT OR REPLACE INTO permissions(code,name,module,description,sort) VALUES(?,?,?,?,?)")
    PERMISSIONS.forEach(([code, name, module], i) => stmt.run(code, name, module, `${module} · ${name}`, i))
  }

  const roleCount = db.prepare("SELECT COUNT(*) AS c FROM roles").get().c
  if (roleCount === 0) {
    const insRole = db.prepare("INSERT INTO roles(id,code,name,description,is_builtin,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    const insRP = db.prepare("INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)")
    ROLES.forEach((r) => {
      const id = `role_${r.code}`
      insRole.run(id, r.code, r.name, r.description, r.builtin, nowISO(), nowISO())
      r.perms.forEach((p) => insRP.run(id, p))
    })
  }

  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c
  if (userCount === 0) {
    const ins = db.prepare(`INSERT INTO users
      (id,username,display_name,email,phone,password_hash,salt,dept_id,role_id,status,must_change,created_at,updated_at,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const seedUsers = [
      ["u_admin", "admin", "系统管理员", "admin@cockpit.local", "13800000013", "admin123456", 600, "role_super_admin", "active", 1],
      ["u_cs", "cs_lead", "客户成功部主管", "cs@cockpit.local", "13800000021", "cs12345678", 200, "role_dept_admin", "active", 0],
      ["u_ops", "ops", "运营专员", "ops@cockpit.local", "13800000022", "ops12345678", 400, "role_operator", "active", 0],
      ["u_view", "viewer", "观察账号", "viewer@cockpit.local", "13800000023", "view12345678", null, "role_viewer", "active", 0],
      ["u_off", "disabled_user", "已停用账号", "off@cockpit.local", "13800000024", "off12345678", 300, "role_viewer", "disabled", 0],
    ]
    seedUsers.forEach(([id, username, display, email, phone, pwd, dept, role, status, mustChange]) => {
      const { salt, hash } = hashPassword(pwd)
      ins.run(id, username, display, email, phone, hash, salt, dept, role, status, mustChange, nowISO(), nowISO(), "system")
    })
  }

  // 业务数据：部门 / 沙盘单位 / 客户 / 报告
  if (db.prepare("SELECT COUNT(*) AS c FROM departments").get().c === 0) {
    const ins = db.prepare(`INSERT INTO departments(id,name,code_name,color,tagline,brief,status,mcp,members,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    const rows = [
      [200, "客户成功部", "CUSTOMER SUCCESS", "#2E8B6E", "五线体系：A 客户账本 · B 客户主理 · T 技术任务 · C 交付治理 · D 作战资产", "C 线 15 分钟看清全盘：今日红灯 2、黄灯 5，1 个 BT 协作阻塞需拍板。", "online", 1, 14],
      [300, "公域部门", "PUBLIC DOMAIN", "#6B5B9E", "多项目制内容研发发行组织：知识库 · 文案账本 · 角色 Codex", "3 个项目并行：日常生产中、初始化中，1 个阻塞待处理。", "online", 1, 9],
      [400, "私域部门", "PRIVATE DOMAIN", "#B08A2E", "标签池双主线：日常内容线持续滋养 · 激活簇精准唤醒", "发售周期 D-6 证据证明阶段：转销候选 9，重复投喂率 0%。", "online", 1, 12],
      [500, "人力资源部", "HR AI OS", "#4C6FA8", "三舱：P1 战略预警 · P2 招聘作战 · P3 员工生命周期", "1 个红色预警待拆解；在招 4 岗，本周 6 场面试。", "online", 0, 6],
      [600, "总经办", "GM OFFICE", "#8A2E3B", "治理总账单表运行：事事有选项、有后果、有最晚判断时间", "老板第一屏 Top7 待判断，首位现金事项影响 480 万。", "online", 1, 3],
      [700, "技术研发部", "R&D", "#4A7DE0", "研发中台与工具链建设", "未接入 MCP · 待点亮", "offline", 0, 8],
      [800, "财务部", "FINANCE", "#1B3DE4", "资金与核算中枢", "未接入 MCP · 待点亮", "offline", 0, 4],
    ]
    rows.forEach((r) => ins.run(...r, nowISO(), nowISO()))
  }

  if (db.prepare("SELECT COUNT(*) AS c FROM sandbox_units").get().c === 0) {
    const ins = db.prepare(`INSERT INTO sandbox_units(id,name,dept_name,kind,pos_x,pos_y,scale,status,mcp,metrics,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    const units = [
      ["res-cust", "客户成功部 · 客户矿区", "客户成功部", "mine", 0.18, 0.42, 1, "online", 1, '{"跟进客户":1034,"今日新增":6,"风险信号":2}'],
      ["res-core", "资源核心", "经营中枢", "core", 0.5, 0.55, 1.35, "online", 1, '{"入账":"¥15,960.00","回款合计":"¥775,963","月度完成率":"86%"}'],
      ["res-deliv", "客户交付部 · 交付工坊", "客户交付部", "forge", 0.72, 0.4, 1, "online", 1, '{"在办任务":3,"回执率":"92%","异常":1}'],
      ["res-tech", "技术交付部 · 交付工坊", "技术交付部", "forge", 0.86, 0.62, 0.9, "online", 1, '{"TID池":6,"在办":3,"超期":1}'],
      ["res-pub", "公域部门 · 线索牧场", "公域部门", "farm", 0.62, 0.18, 0.95, "online", 1, '{"活跃项目":3,"今日入账内容":5,"阻塞":1}'],
      ["res-other", "其他（待设部门）· 线索牧场", "筹备中", "farm", 0.3, 0.16, 0.8, "offline", 0, '{"人数":7}'],
      ["res-priv", "私域部门 · 弹药库", "私域部门", "ammo", 0.4, 0.74, 0.9, "online", 1, '{"今日触达":1420,"转销候选":9,"簇活跃":6}'],
      ["res-hr", "人力资源部 · 人才营地", "人力资源部", "camp", 0.14, 0.68, 0.85, "online", 1, '{"在招":4,"本周面试":6,"预警":1}'],
      ["res-gm", "总经办 · 指挥塔", "总经办", "tower", 0.56, 0.32, 1.1, "online", 1, '{"待判断":7,"今日验收":1,"生效":7}'],
    ]
    units.forEach((u) => ins.run(...u, nowISO(), nowISO()))
  }

  if (db.prepare("SELECT COUNT(*) AS c FROM customers").get().c === 0) {
    const ins = db.prepare(`INSERT INTO customers(id,code,name,owner,stage,tags,next_follow,profiled_at,level,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    const names = ["林薇", "徐海燕", "李冉", "李青", "周成", "冯佳", "蒋一鸣", "沈悦", "韩雪", "曹阳", "潘越", "梁晨"]
    const stages = ["已成交", "方案展示", "需求确认", "初步接洽", "商务谈判"]
    const owners = ["李婷", "张三", "小林", "王磊"]
    for (let i = 0; i < 30; i++) {
      const id = `C${26090 + i}`
      const code = ["Z", "X", "L"][i % 3] + "260" + (820 + i) + "00" + ((i % 9) + 1)
      const tags = i % 7 === 0 ? "需介入,风险" : i % 3 === 0 ? "已安排跟进,风险" : "已安排跟进"
      ins.run(id, code, names[i % names.length] + (i >= names.length ? String(i) : ""), owners[i % owners.length],
        stages[i % stages.length], tags,
        `2026/10/${11 + (i % 9)} 09:${20 + (i % 30)}:00`,
        `2026/10/13 0${8 + (i % 3)}:${40 + i}:00`,
        i % 7 === 0 ? "high" : "normal", nowISO(), nowISO())
    }
  }

  if (db.prepare("SELECT COUNT(*) AS c FROM reports").get().c === 0) {
    const ins = db.prepare(`INSERT INTO reports(id,kind,title,generated,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
    ins.run("r1", "日志", "10 月 13 日 · 全公司经营日报", "2026-10-13 07:30",
      "## 概览\n- 实际收款 ¥775,963.00，月度完成率 86.22%\n- 红灯客户 2 个，黄灯客户 5 个\n\n## 今日建议\n1. 18:00 前完成回款计划书面确认\n2. 审批交付工程师 Offer", nowISO(), nowISO())
    ins.run("r2", "任务", "10 月 13 日 · 交付工坊结算", "2026-10-13 07:30",
      "## 结算\n- 在办任务 3，回执率 92%\n- 超期任务 1 个已升级", nowISO(), nowISO())
  }

  if (db.prepare("SELECT COUNT(*) AS c FROM configs").get().c === 0) {
    const ins = db.prepare(`INSERT INTO configs(key,value,type,group_name,label,description,is_secret,editable,updated_at,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
    const cfgs = [
      ["site.name", "星澜智驭 · CEO 驾驶舱", "string", "site", "系统名称", "展示在浏览器标题与登录页", 0, 1],
      ["site.filing", "演示复刻 · 仅作技术验证", "string", "site", "底部标识", "页脚展示的备案/标识文案", 0, 1],
      ["metrics.cashTarget", "900000", "number", "business", "月度回款目标", "用于计算缺口与完成率", 0, 1],
      ["metrics.cashActual", "775963", "number", "business", "当月实际收款", "口径：实际收款", 0, 1],
      ["metrics.interventionThreshold", "150", "number", "business", "需介入人数阈值", "超过阈值时首页高亮提示", 0, 1],
      ["security.sessionTtl", "7200", "number", "security", "登录令牌有效期", "单位秒，默认 7200", 0, 1],
      ["security.maxLoginFail", "5", "number", "security", "登录失败锁定阈值", "连续失败达到该值后锁定账号", 0, 1],
      ["security.lockMinutes", "10", "number", "security", "锁定时长（分钟）", "账号被锁定后的禁用时长", 0, 1],
      ["security.rateLimitPerMin", "600", "number", "security", "接口限流（次/分钟）", "单 IP 每分钟最大请求数，修改后 5 秒内生效", 0, 1],
      ["observability.logRetentionDays", "30", "number", "observability", "日志保留天数", "超出后由清理任务归档删除", 0, 1],
      ["observability.auditWriteOnly", "true", "boolean", "observability", "写操作强制留痕", "所有写接口是否强制写审计日志", 0, 1],
      ["integration.webhookUrl", "https://hooks.example.com/cockpit", "string", "integration", "告警回调地址", "监控告警推送地址", 0, 1],
      ["integration.webhookSecret", "whsec_6f2a91c4d7", "string", "integration", "回调签名密钥", "用于回调请求签名校验", 1, 1],
      ["integration.dingtalkToken", "dtk_live_8c1f0e5a", "string", "integration", "钉钉机器人令牌", "告警群机器人 access_token", 1, 1],
      ["release.channel", "stable", "enum", "release", "发布通道", "stable / beta", 0, 1],
      ["release.featureConsole", "true", "boolean", "release", "控制台开关", "是否启用后端控制台入口", 0, 1],
    ]
    cfgs.forEach(([key, value, type, group, label, desc, secret, editable]) =>
      ins.run(key, value, type, group, label, desc, secret, editable, nowISO(), "system"))
  }
}

seedIfEmpty()

export const now = () => new Date().toISOString().replace("T", " ").slice(0, 19)

export function audit({ traceId, actor, module, action, method, path, targetType, targetId, ip, ua, status = 0, errorCode = null, durationMs = 0, detail = null }) {
  db.prepare(`INSERT INTO audit_logs
    (trace_id,actor_id,actor_name,module,action,method,path,target_type,target_id,ip,ua,status,error_code,duration_ms,detail,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(traceId, actor?.id ?? null, actor?.name ?? null, module, action, method, path,
      targetType ?? null, targetId ?? null, ip ?? null, ua ?? null, status, errorCode, durationMs,
      detail ? JSON.stringify(detail) : null, now())
}

export function logLogin({ username, userId, ip, ua, result, reason }) {
  db.prepare("INSERT INTO login_logs(username,user_id,ip,ua,result,reason,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(username ?? null, userId ?? null, ip ?? null, ua ?? null, result, reason ?? null, now())
}
