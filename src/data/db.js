// ============================================================
// 演示数据层 —— 原创构造的示例经营数据（结构与参考系统对齐）
// ============================================================

// 部门色相映射（RGB 字符串，用于发光轨道与状态色）
export function deptHue(name) {
  const table = [
    [/销售/, "197,162,39"],
    [/私域/, "202,96,155"],
    [/客户成功|客户交付|客服/, "63,185,199"],
    [/客户经理|公域/, "126,99,188"],
    [/技术|研发/, "74,125,224"],
    [/交付/, "196,78,92"],
    [/市场|增长/, "76,158,110"],
    [/财务/, "27,61,228"],
    [/数据/, "122,147,181"],
    [/人力/, "208,131,64"],
    [/总经办/, "196,78,92"],
    [/法务/, "139,149,165"],
  ]
  const hit = table.find(([re]) => re.test(name))
  return hit ? hit[1] : "122,147,181"
}

export const departments = [
  {
    departmentId: 200,
    name: "客户成功部",
    codeName: "CUSTOMER SUCCESS",
    dom: "#2E8B6E",
    tagline: "五线体系：A 客户账本 · B 客户主理 · T 技术任务 · C 交付治理 · D 作战资产",
    brief: "C 线 15 分钟看清全盘：今日红灯 2、黄灯 5，1 个 BT 协作阻塞需拍板。",
    online: true,
    mcp: true,
    members: 14,
    kpis: [
      { label: "红灯客户", value: "2", unit: "个", tone: "red" },
      { label: "黄灯客户", value: "5", unit: "个", tone: "amber" },
      { label: "重点客户", value: "8", unit: "个" },
      { label: "新成交启动", value: "3", unit: "个", tone: "green" },
      { label: "T 线异常", value: "1", unit: "个", tone: "red" },
      { label: "BT 协作阻塞", value: "1", unit: "个" },
      { label: "续费 / 升单金额", value: "待接入", tone: "pending" },
    ],
    attentions: [
      { id: "gid0001", code: "GID-2026-0001", text: "CID-000018 客户预期偏差：客户以为的交付节奏与 B 线承诺不一致", level: "red", label: "需介入" },
      { id: "tid0001", code: "TID-2026-0001", text: "企微聊天辅助任务阻塞：等待客户提供企微管理员权限", level: "amber", label: "需关注" },
    ],
    battleOrder: {
      head: ["线别", "成员", "负责客户", "今日处理", "T 线移交", "风险客户", "收入机会"],
      rows: [
        { cells: ["B 线", "张三 B001", "12", "9", "2", "1", "1"] },
        { cells: ["B 线", "小林 B002", "10", "8", "1", "0", "2"], tone: "green", toneCol: 6 },
        { cells: ["T 线", "T 线工程师", "TID 池 6", "在办 3", "回执 2", "异常 1", "—"] },
        { cells: ["C 线", "C 线负责人", "全盘 22", "审核 5", "—", "红灯 2", "—"], tone: "red", toneCol: 5 },
      ],
    },
    nightReport: {
      title: "昨夜黑灯输出 · 四线结算",
      lines: [
        "A 线黑灯：扫描 22 个客户日表，生成 9 份 A 线待入账草稿，标记 1 个风险客户",
        "T 线黑灯：TID 池对账完成，1 个任务超期未回执已升级 C 线",
        "C 线黑灯：红黄灯重排完成，GID-2026-0001 升级为红灯待老板判断",
        "D 线黑灯：从 B 线现场经验中整理 1 份资产草稿（预期管理话术 V2）待审核",
      ],
    },
    assets: {
      head: ["资产", "状态", "调用次数", "命中率", "客户采纳率"],
      rows: [
        { name: "客户双循环预期管理话术", code: "ASSET-2026-0001", status: "待审核 review", calls: 14, hit: "71%", adopt: "64%", tone: "amber" },
        { name: "企微交付 SOP", code: "ASSET-2026-0002", status: "已启用 active", calls: 32, hit: "88%", adopt: "81%", tone: "green" },
        { name: "旧版报价模板", code: "ASSET-2026-0003", status: "已冻结 frozen", calls: 3, hit: "33%", adopt: "—" },
      ],
    },
    drilldowns: [
      { id: "gid0001", tag: "GID-2026-0001", name: "CID-000018 客户预期偏差治理" },
      { id: "tid0001", tag: "TID-2026-0001", name: "企微聊天辅助技术任务" },
      { id: "b001", tag: "B-LINE / B001", name: "张三 B001 · 客户主理日表" },
      { id: "asset0001", tag: "ASSET-2026-0001", name: "客户双循环预期管理话术" },
    ],
  },
  {
    departmentId: 300,
    name: "公域部门",
    codeName: "PUBLIC DOMAIN",
    dom: "#6B5B9E",
    tagline: "多项目制内容研发发行组织：飞书知识库 · 文案账本 · 角色 Codex · 黑灯结算",
    brief: "3 个项目并行：PROJECT-A 日常生产中，PROJECT-B 灵山初始化，1 个阻塞待处理。",
    online: true,
    mcp: true,
    members: 9,
    kpis: [
      { label: "活跃项目", value: "3", unit: "个" },
      { label: "待审核产物", value: "2", unit: "份", tone: "amber" },
      { label: "反馈回流率", value: "76", unit: "%" },
      { label: "投放 ROI", value: "1.8", tone: "green" },
      { label: "线索转交数", value: "12", unit: "条" },
    ],
    attentions: [
      { id: "projectc", code: "PROJECT-C", text: "素材分发阻塞：账号运营等待平台审核超 48 小时，黑灯已标记", level: "red", label: "需介入" },
      { id: "projectb", code: "PROJECT-B", text: "灵山初始化待审核：METH 方法论文档 1 份等待部门负责人确认", level: "amber", label: "需关注" },
    ],
    battleOrder: {
      head: ["项目", "定位", "阶段", "健康", "阻塞", "待审核", "变现"],
      rows: [
        { cells: ["PROJECT-A", "女性创业者内容", "日常生产", "绿", "0", "1", "¥86K"] },
        { cells: ["PROJECT-B", "教培高客单", "灵山初始化", "黄", "1", "1", "—"], tone: "amber", toneCol: 3 },
        { cells: ["PROJECT-C", "签约 IP 孵化", "分发阻塞", "红", "2", "0", "¥32K"], tone: "red", toneCol: 3 },
      ],
    },
    nightReport: {
      title: "昨夜黑灯输出 · 三层结算",
      lines: [
        "项目黑灯：PROJECT-A 昨日 5 条内容全部入账，反馈回流 4 条",
        "文案黑灯：23 次提交对账完成，2 份产物退回补充素材说明",
        "部门监管黑灯：PROJECT-C 分发阻塞升级；METH-001 专业价值翻译法调用 11 次表现稳定",
      ],
    },
    assets: {
      head: ["方法论", "状态", "调用次数", "命中率", "回流率"],
      rows: [
        { name: "专业价值翻译法", code: "METH-001", status: "已启用 active", calls: 11, hit: "82%", adopt: "74%", tone: "green" },
        { name: "爆款选题拆解表", code: "METH-002", status: "待审核 review", calls: 5, hit: "60%", adopt: "—" },
      ],
    },
    drilldowns: [
      { id: "projecta", tag: "PROJECT-A", name: "日常内容生产项目" },
      { id: "projectb", tag: "PROJECT-B", name: "教培行业获客项目" },
      { id: "ipzhangsan", tag: "IP / 张三", name: "签约 IP 日更训练" },
    ],
  },
  {
    departmentId: 400,
    name: "私域部门",
    codeName: "PRIVATE DOMAIN",
    dom: "#B08A2E",
    tagline: "标签池双主线：日常内容线持续滋养 · 激活簇精准唤醒，转销窗口 24 小时",
    brief: "发售周期 D-6 证据证明阶段：今日触达 1,420，转销候选 9，重复投喂率 0%。",
    online: true,
    mcp: true,
    members: 12,
    kpis: [
      { label: "今日触达", value: "1,420", unit: "人" },
      { label: "有效回复", value: "210", unit: "条", tone: "green" },
      { label: "标签新增", value: "86", unit: "个" },
      { label: "转销候选", value: "9", unit: "人", tone: "amber" },
      { label: "重复投喂率", value: "0", unit: "%" },
      { label: "转销成交金额", value: "¥52K" },
    ],
    attentions: [
      { id: "cluster0512", code: "CLUSTER-0512", text: "激活簇发送完成：320 触达 / 41 回复，回复承接进入处理中", level: "amber", label: "需关注" },
    ],
    battleOrder: {
      head: ["产线", "今日目标", "达标", "越界通过", "负责人", "执行员", "备注"],
      rows: [
        { cells: ["朋友圈", "5 条", "5", "0", "负责人 A", "执行员 B", "达标"], tone: "green", toneCol: 2 },
        { cells: ["公众号", "1 篇", "1", "0", "负责人 A", "执行员 C", "达标"], tone: "green", toneCol: 2 },
        { cells: ["激活簇", "执行率 90%", "86%", "0", "负责人 A", "执行员 D", "低于 90% 线"], tone: "amber", toneCol: 2 },
      ],
    },
    nightReport: {
      title: "昨夜黑灯输出 · 三线复盘",
      lines: [
        "中心复盘：昨日触达 1,380，回复率 14.8%，证据证明内容表现优于方法教育期 22%",
        "边缘复盘：标签簇回复率最高（19%），建议今日加投",
        "复合复盘：30 日禁发栈检查通过 100%，重复投喂 0 例，越界通过 0 例",
      ],
    },
    assets: {
      head: ["激活簇", "标签组合", "圈选人数", "回复数", "成交金额"],
      rows: [
        { name: "CLUSTER-0512 精准唤醒簇", code: "线索质量差 + 高粘性", status: "今日发送 320", calls: 320, hit: "41", adopt: "¥18K", tone: "green" },
        { name: "CLUSTER-0498 教培唤醒簇", code: "教培 + 决策人", status: "发送 260", calls: 260, hit: "49", adopt: "¥34K", tone: "green" },
      ],
    },
    drilldowns: [
      { id: "cluster0512", tag: "CLUSTER-0512", name: "精准唤醒簇 · 链路与表现" },
      { id: "handoff", tag: "HANDOFF", name: "转销候选清单（9 人待交接）" },
    ],
  },
  {
    departmentId: 500,
    name: "人力资源部",
    codeName: "HR AI OS",
    dom: "#4C6FA8",
    tagline: "三舱：P1 战略预警 · P2 招聘作战 · P3 员工生命周期，顶层 Harness 治理",
    brief: "1 个红色预警待拆解；在招 4 岗，本周 6 场面试；2 个试用期节点待反馈。",
    online: true,
    mcp: false,
    members: 6,
    kpis: [
      { label: "红色预警", value: "1", unit: "条", tone: "red" },
      { label: "黄预警", value: "2", unit: "条", tone: "amber" },
      { label: "在招岗位", value: "4", unit: "个" },
      { label: "本周面试", value: "6", unit: "场" },
      { label: "待审批", value: "1", unit: "项" },
      { label: "人均产值", value: "—" },
    ],
    attentions: [
      { id: "req0003", code: "REQ-2026-0001", text: "红色预警：关键岗位空缺影响 Q3 交付，Offer 审批需今日完成", level: "red", label: "需介入" },
      { id: "eid0042", code: "EVT-087", text: "试用期 T-7 反馈待主管填写，逾期将自动升级", level: "amber", label: "需关注" },
    ],
    battleOrder: {
      head: ["岗位", "候选人池", "本周面试", "渠道", "筛选评分", "状态", "负责人"],
      rows: [
        { cells: ["交付工程师", "23 人", "4 场", "猎头 + 内推", "82 分", "面试安排", "HR BP"], tone: "amber", toneCol: 5 },
        { cells: ["销售顾问", "11 人", "1 场", "主动邀约", "76 分", "邀约响应", "HR BP"] },
        { cells: ["内容编导", "8 人", "1 场", "内推", "—", "材料评审", "—"] },
      ],
    },
    nightReport: {
      title: "昨夜黑灯对账 · 次日行动地图",
      lines: [
        "黑灯对账：23 名候选人材料评分刷新，2 名新候选进入邀约队列",
        "次日行动地图：4 场面试已排；Offer 审批 1 项待处理；试用期反馈催办 2 条",
        "自检：预警规则 12 条全部生效，无漂移信号",
      ],
    },
    assets: {
      head: ["预警信号", "等级", "影响", "行动拆解", "状态"],
      rows: [
        { name: "关键岗位空缺影响 Q3 交付", code: "SIG-01", status: "红色", calls: "—", hit: "B 线负责人缺位", adopt: "已入行动队列", tone: "red" },
        { name: "销售部 1 人离职风险信号", code: "SIG-02", status: "黄色", calls: "—", hit: "客户交接风险", adopt: "干预任务进行中", tone: "amber" },
        { name: "新员工培训完成率 82%", code: "SIG-03", status: "黄色", calls: "—", hit: "低于 90% 目标", adopt: "排期补训", tone: "amber" },
      ],
    },
    drilldowns: [
      { id: "req0003", tag: "REQ-2026-0001", name: "交付工程师招聘任务" },
      { id: "eid0042", tag: "EVT-087", name: "试用期 T-7 反馈事件" },
      { id: "alert-red", tag: "SIG-01", name: "红色预警处置链" },
    ],
  },
  {
    departmentId: 600,
    name: "总经办",
    codeName: "GM OFFICE",
    dom: "#8A2E3B",
    tagline: "治理总账单表运行：只有老板判断层，事事有选项、有后果、有最晚判断时间",
    brief: "老板第一屏 Top7 待判断，首位现金事项影响 480 万，最晚判断时间今日 18:00。",
    online: true,
    mcp: true,
    members: 3,
    kpis: [
      { label: "生效事项", value: "7", unit: "项" },
      { label: "待复核", value: "2", unit: "项", tone: "amber" },
      { label: "关闭候选", value: "3", unit: "项" },
      { label: "今日证据验收", value: "1", unit: "项", tone: "red" },
    ],
    attentions: [
      { id: "item0001", code: "事项-20260514-0001", text: "客户A 480 万回款延期：影响 480 万，18:00 前必须取得正式书面付款计划", level: "red", label: "需判断" },
    ],
    battleOrder: {
      head: ["事项", "类别", "影响", "最晚判断", "当前状态", "证据", "负责人"],
      rows: [
        { cells: ["客户A 回款延期", "现金", "480 万", "今日 18:00", "待老板判断", "待验收", "老板"], tone: "red", toneCol: 3 },
        { cells: ["大客户B 续约条款让步", "客户", "320 万", "明日 12:00", "选项比对", "齐备", "老板"] },
        { cells: ["新业务合规资质缺口", "合规", "—", "本周五", "扫描建档", "缺资质", "法务"], tone: "amber", toneCol: 3 },
        { cells: ["B 线负责人 Offer 授权", "授权", "—", "今日 18:00", "待审批", "齐备", "人力"], tone: "amber", toneCol: 3 },
      ],
    },
    nightReport: {
      title: "晚间黑灯结算 · 机制资产候选",
      lines: [
        "晚间黑灯：全账单对账完成，3 项阻塞原因已标注（2 项等待外部证据）",
        "机制资产候选：《回款延期证据标准》建议升级为公司级机制（不接受微信截图、口头承诺）",
        "自检：单表结构校验通过，状态机无非法流转",
      ],
    },
    assets: {
      head: ["运行时刻", "节点", "产出", "状态", "说明"],
      rows: [
        { name: "早间复核", code: "07:30", status: "老板第一屏", calls: "—", hit: "Top7 待判断", adopt: "生效" },
        { name: "下午异常扫描", code: "15:00", status: "入口扫描", calls: "—", hit: "异常 2 项", adopt: "生效" },
        { name: "晚间黑灯", code: "23:00", status: "证据验收", calls: "—", hit: "机制候选 1 项", adopt: "生效" },
      ],
    },
    drilldowns: [
      { id: "item0001", tag: "事项-20260514-0001", name: "客户A 480 万回款延期治理" },
    ],
  },
  // 离线部门（首页置灰展示）
  { departmentId: 700, name: "技术研发部", codeName: "R&D", dom: "#4A7DE0", tagline: "研发中台与工具链建设", brief: "未接入 MCP · 待点亮", online: false, mcp: false, members: 8 },
  { departmentId: 800, name: "财务部", codeName: "FINANCE", dom: "#1B3DE4", tagline: "资金与核算中枢", brief: "未接入 MCP · 待点亮", online: false, mcp: false, members: 4 },
]

export const deptById = (id) => departments.find((d) => String(d.departmentId) === String(id))

// 沙盘单位（建筑）
export const sandboxUnits = [
  { unitId: "res-cust", name: "客户成功部 · 客户矿区", dept: "客户成功部", x: 0.18, y: 0.42, scale: 1, online: true, mcp: true, kind: "mine", stats: [["跟进客户", "1034"], ["今日新增", "6"], ["风险信号", "2"]] },
  { unitId: "res-core", name: "资源核心", dept: "经营中枢", x: 0.5, y: 0.55, scale: 1.35, online: true, mcp: true, kind: "core", stats: [["入账", "¥15,960.00"], ["回款合计", "¥775,963"], ["月度完成率", "86%"]] },
  { unitId: "res-deliv", name: "客户交付部 · 交付工坊", dept: "客户交付部", x: 0.72, y: 0.4, scale: 1, online: true, mcp: true, kind: "forge", stats: [["在办任务", "3"], ["回执率", "92%"], ["异常", "1"]] },
  { unitId: "res-tech", name: "技术交付部 · 交付工坊", dept: "技术交付部", x: 0.86, y: 0.62, scale: 0.9, online: true, mcp: true, kind: "forge", stats: [["TID 池", "6"], ["在办", "3"], ["超期", "1"]] },
  { unitId: "res-pub", name: "公域部门 · 线索牧场", dept: "公域部门", x: 0.62, y: 0.18, scale: 0.95, online: true, mcp: true, kind: "farm", stats: [["活跃项目", "3"], ["今日入账内容", "5"], ["阻塞", "1"]] },
  { unitId: "res-other", name: "其他（待设部门）· 线索牧场", dept: "筹备中", x: 0.3, y: 0.16, scale: 0.8, online: false, mcp: false, kind: "farm", stats: [["人数", "7"], ["状态", "未接入 MCP"]] },
  { unitId: "res-priv", name: "私域部门 · 弹药库", dept: "私域部门", x: 0.4, y: 0.74, scale: 0.9, online: true, mcp: true, kind: "ammo", stats: [["今日触达", "1420"], ["转销候选", "9"], ["簇活跃", "6"]] },
  { unitId: "res-hr", name: "人力资源部 · 人才营地", dept: "人力资源部", x: 0.14, y: 0.68, scale: 0.85, online: true, mcp: true, kind: "camp", stats: [["在招", "4"], ["本周面试", "6"], ["预警", "1"]] },
  { unitId: "res-gm", name: "总经办 · 指挥塔", dept: "总经办", x: 0.56, y: 0.32, scale: 1.1, online: true, mcp: true, kind: "tower", stats: [["待判断", "7"], ["今日验收", "1"], ["生效", "7"]] },
]

export const idleUnits = [
  { unitId: "idle-1", name: "复盘 AI", sub: "离线 · 今日暂无客户跟进" },
  { unitId: "idle-2", name: "监测 AI", sub: "待命 · 信号监听中" },
  { unitId: "idle-3", name: "线索挖掘 AI", sub: "待命 · 池未启用" },
  { unitId: "idle-4", name: "数据同步 AI", sub: "离线 · 待接入" },
]

// 沙盘数据流
export const flows = [
  { id: "f-lead", kind: "lead", label: "线索流", from: "res-pub", to: "res-cust", tip: "公域线索经清洗打标后流入客户矿区，当日新增 6 条。" },
  { id: "f-contract", kind: "contract", label: "合同流", from: "res-cust", to: "res-deliv", tip: "成交客户由 B 线移交交付工坊启动实施，今日移交 2 单。" },
  { id: "f-cash", kind: "cash", label: "回款流", from: "res-deliv", to: "res-core", tip: "交付回执触发回款核销，入账为实际收款口径。" },
  { id: "f-ammo", kind: "ammo", label: "弹药流", from: "res-priv", to: "res-cust", tip: "激活簇话术资产作为弹药支援 B 线客户跟进。" },
]

// 首页智能体
export const agents = [
  { unitId: "n7", code: "UNIT-N7 / REPLAY", name: "复盘 AI", desc: "昨夜生成 0 份画像更新" },
  { unitId: "n9", code: "UNIT-N9 / MONITOR", name: "监测 AI", desc: "发现 153 个风险信号" },
  { unitId: "n10", code: "UNIT-N10 / PROSPECT", name: "线索挖掘 AI", desc: "今日新增 12 个客户" },
]

// 客户列表
const STAGES = ["已成交", "方案展示", "需求确认", "初步接洽", "商务谈判"]
const TAGS = ["已安排跟进", "需介入", "风险"]
const OWNERS = ["李婷", "张三", "小林", "王磊"]
const NAMES = ["林薇", "徐海燕", "李冉", "李青", "周成", "冯佳", "蒋一鸣", "沈悦", "韩雪", "曹阳", "潘越", "梁晨"]
export const customers = Array.from({ length: 26 }, (_, i) => ({
  customerId: `C${26090 + i}`,
  code: ["Z", "X", "L"][i % 3] + "260" + (820 + i) + "00" + ((i % 9) + 1),
  name: NAMES[i % NAMES.length] + (i >= NAMES.length ? String(i) : ""),
  owner: OWNERS[i % OWNERS.length],
  stage: STAGES[i % STAGES.length],
  tags: i % 4 === 0 ? TAGS : i % 3 === 0 ? ["已安排跟进", "风险"] : ["已安排跟进"],
  nextFollow: `2026/10/${11 + (i % 9)} 09:${20 + (i % 30)}:00`,
  profileAt: `2026/10/13 0${8 + (i % 3)}:${40 + i}:00`,
  red: i % 7 === 0,
}))

// 主管报告
export const reports = [
  { id: "r1", kind: "日报", title: "10 月 13 日 · 全公司经营日报", at: "2026-10-13 07:30", md: "## 概览\n\n- 实际收款 ¥775,963.00，月度完成率 86.22%\n- 红灯客户 2 个，黄灯客户 5 个，需介入 1 项\n- 昨夜黑灯产出：入账草稿 9 份，风险标记 1 条\n\n## 部门要点\n\n- 客户成功部：GID-2026-0001 升级红灯，需主管今日介入对齐\n- 公域部门：PROJECT-C 分发阻塞升级\n- 私域部门：激活簇回复率 12.8%，建议加投\n\n## 今日建议\n\n1. 18:00 前完成客户A 回款计划书面确认\n2. 审批交付工程师 Offer" },
  { id: "r2", kind: "日报", title: "10 月 12 日 · 全公司经营日报", at: "2026-10-12 07:30", md: "## 概览\n\n- 实际收款 ¥712,400.00，月度完成率 79.2%\n- 新成交启动 3 个，T 线异常 1 个\n\n## 部门要点\n\n- 私域部门：转销候选 9 人待交接销售部承接\n- 人力资源部：预警规则 12 条全部生效" },
  { id: "r3", kind: "周报", title: "第 41 周 · 经营周报", at: "2026-10-12 18:00", md: "## 本周结算\n\n- 周回款 ¥1,488,363，环比 +6.4%\n- 新增客户 58 个，画像更新 214 次\n- 交付工坊回执率 92%，超期任务 1 个\n\n## 风险与预警\n\n- 关键岗位空缺影响 Q3 交付（红色）\n- 大客户续约条款让步申请待判断" },
]

// 单位详情（治理链示例）
export const governanceCases = {
  gid0001: {
    code: "GID-2026-0001",
    title: "CID-000018 客户预期偏差治理",
    kicker: "C 线交付治理事项",
    brief: "客户（企微聊天辅助项目）对交付节奏预期与 B 线实际承诺出现偏差，红灯，需主管今日介入对齐。",
    chain: [
      { t: "黑灯发现", s: "昨夜 C 线扫描", state: "done" },
      { t: "定级红灯", s: "今晨 C 线复核", state: "done" },
      { t: "主管介入", s: "待今日执行", state: "current" },
      { t: "预期对齐", s: "书面确认", state: "" },
      { t: "关闭复盘", s: "沉淀 D 线资产", state: "" },
    ],
    facts: [
      { k: "关联客户", v: "CID-000018（企微聊天辅助）" },
      { k: "关联任务", v: "TID-2026-0001" },
      { k: "风险等级", v: "红灯", tone: "red" },
      { k: "建议动作", v: "主管今日与客户关键联系人电话对齐交付节奏，并取得书面确认" },
      { k: "可调用资产", v: "ASSET-2026-0001 客户双循环预期管理话术" },
      { k: "预计续费影响", v: "待接入" },
    ],
    note: "昨夜黑灯已生成预期对齐话术草稿，等待主管确认后发出。",
    back: "客户成功部",
  },
  tid0001: {
    code: "TID-2026-0001",
    title: "企微聊天辅助技术任务",
    kicker: "T 线技术任务",
    brief: "为 CID-000018 部署企微聊天辅助能力，当前阻塞在客户侧管理员权限，B 线协作待推进。",
    chain: [
      { t: "任务创建", s: "B 线移交", state: "done" },
      { t: "分配接收", s: "T 线接单", state: "done" },
      { t: "开发进行", s: "完成 60%", state: "current" },
      { t: "阻塞", s: "等待客户权限", state: "current" },
      { t: "交付回执", s: "待完成", state: "" },
    ],
    facts: [
      { k: "来源", v: "B 线 张三 B001 移交" },
      { k: "阻塞原因", v: "客户企微管理员权限未开通", tone: "red" },
      { k: "下一步", v: "B 线今日提醒客户 IT 负责人开通权限" },
      { k: "结项产物", v: "技术产物包 + T 线回归建议（结项时提交）" },
    ],
    note: "黑灯已生成权限开通引导话术，B 线确认后可直接发送客户 IT 负责人。",
    back: "客户成功部",
  },
}
