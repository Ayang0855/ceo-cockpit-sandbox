import { useEffect, useMemo, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { api } from "../../lib/api.js"
import { ConsoleHead, Panel, Drawer, Tag, Empty, Loading, ErrorNote, useToast } from "./ConsoleLayout.jsx"
import { useFetch, Pager, Field, fmtTime } from "./common.jsx"

// ---------- 各资源的展示配置（列顺序、中文表头、展示形态） ----------
const VIEWS = {
  departments: {
    title: "部门", pk: "id",
    columns: [
      { k: "id", label: "ID", cls: "mono", w: 60 },
      { k: "name", label: "部门名称", cls: "strong" },
      { k: "code_name", label: "英文标识", cls: "mono" },
      { k: "color", label: "主题色", render: (v) => <span className="c-swatch"><i style={{ background: v || "#999" }} />{v || "—"}</span> },
      { k: "status", label: "状态", render: (v) => <Tag tone={v === "online" ? "green" : "gray"} text={v === "online" ? "在线" : "离线"} /> },
      { k: "mcp", label: "MCP", render: (v) => <Tag tone={v ? "blue" : "gray"} text={v ? "已接入" : "未接入"} /> },
      { k: "members", label: "成员", cls: "num" },
      { k: "updated_at", label: "更新时间", cls: "mono", render: (v) => fmtTime(v) },
    ],
    filters: ["status", "mcp"],
    enums: { status: [["online", "在线"], ["offline", "离线"]], mcp: [["true", "已接入"], ["false", "未接入"]] },
  },
  units: {
    title: "沙盘单位", pk: "id",
    columns: [
      { k: "id", label: "ID", cls: "mono" },
      { k: "name", label: "单位名称", cls: "strong" },
      { k: "dept_name", label: "归属" },
      { k: "kind", label: "类型", cls: "mono" },
      { k: "pos_x", label: "X", cls: "num", render: (v) => Number(v).toFixed(2) },
      { k: "pos_y", label: "Y", cls: "num", render: (v) => Number(v).toFixed(2) },
      { k: "scale", label: "缩放", cls: "num" },
      { k: "status", label: "状态", render: (v) => <Tag tone={v === "online" ? "green" : "gray"} text={v === "online" ? "在线" : "离线"} /> },
      { k: "mcp", label: "MCP", render: (v) => <Tag tone={v ? "blue" : "gray"} text={v ? "已接入" : "未接入"} /> },
    ],
    filters: ["status", "kind", "mcp"],
    enums: {
      status: [["online", "在线"], ["offline", "离线"]],
      kind: [["core", "资源核心"], ["mine", "矿区"], ["forge", "工坊"], ["farm", "牧场"], ["ammo", "弹药库"], ["camp", "营地"], ["tower", "指挥塔"], ["other", "其他"]],
      mcp: [["true", "已接入"], ["false", "未接入"]],
    },
  },
  customers: {
    title: "客户", pk: "id",
    columns: [
      { k: "id", label: "客户 ID", cls: "mono strong" },
      { k: "code", label: "编码", cls: "mono" },
      { k: "name", label: "客户姓名", cls: "strong" },
      { k: "owner", label: "负责人" },
      { k: "stage", label: "阶段", render: (v) => <Tag tone={v === "已成交" ? "green" : v === "商务谈判" ? "amber" : "blue"} text={v || "—"} /> },
      { k: "tags", label: "标签", render: (v) => (v ? String(v).split(",").map((t, i) => <Tag key={i} tone={t.includes("风险") || t.includes("介入") ? "red" : "gray"} text={t} />) : "—") },
      { k: "level", label: "等级", render: (v) => <Tag tone={v === "high" ? "red" : v === "vip" ? "purple" : "gray"} text={v || "normal"} /> },
      { k: "next_follow", label: "下次跟进", cls: "mono" },
      { k: "profiled_at", label: "画像时间", cls: "mono" },
    ],
    filters: ["stage", "owner", "level"],
    enums: {
      stage: [["已成交", "已成交"], ["方案展示", "方案展示"], ["需求确认", "需求确认"], ["初步接洽", "初步接洽"], ["商务谈判", "商务谈判"]],
      level: [["normal", "普通"], ["high", "高风险"], ["vip", "VIP"]],
    },
  },
  reports: {
    title: "报告", pk: "id",
    columns: [
      { k: "id", label: "ID", cls: "mono" },
      { k: "kind", label: "类型", render: (v) => <Tag tone="blue" text={v || "—"} /> },
      { k: "title", label: "标题", cls: "strong" },
      { k: "generated", label: "生成时间", cls: "mono" },
      { k: "body", label: "摘要", render: (v) => <span className="ellip" title={v}>{String(v || "").replace(/[#*\n]/g, " ").slice(0, 60) || "—"}</span> },
      { k: "updated_at", label: "更新时间", cls: "mono", render: (v) => fmtTime(v) },
    ],
    filters: ["kind"],
    enums: { kind: [["日志", "日志"], ["任务", "任务"], ["周报", "周报"], ["日报", "日报"]] },
  },
}

export default function DataPage() {
  const { perms } = useOutletContext()
  const { push } = useToast()
  const can = (p) => perms.has(p)

  const catalog = useFetch(() => api.resources(), [])
  const [res, setRes] = useState("departments")
  const [q, setQ] = useState({ keyword: "", sort: "", order: "asc", page: 1, pageSize: 10 })
  const [filterVals, setFilterVals] = useState({})
  const [drawer, setDrawer] = useState(null)

  const list = useFetch(
    () => api.list(res, { ...q, ...filterVals }),
    [res, q.page, q.keyword, q.sort, q.order, JSON.stringify(filterVals)],
  )

  const schema = useMemo(() => catalog.data?.list?.find((r) => r.resource === res), [catalog.data, res])
  const view = VIEWS[res] || { title: res, pk: "id", columns: [] }

  // 切换资源时重置筛选
  useEffect(() => {
    setQ({ keyword: "", sort: "", order: "asc", page: 1, pageSize: 10 })
    setFilterVals({})
  }, [res])

  const onDelete = async (row) => {
    if (!window.confirm(`确认删除该${view.title}？操作不可撤销。`)) return
    try {
      await api.remove(res, row[view.pk])
      push(`已删除 ${view.title} ${row[view.pk]}`, "ok")
      list.reload()
      catalog.reload()
    } catch (e) { push(e.message, "err", e.traceId) }
  }

  const rows = list.data?.list || []

  return (
    <>
      <ConsoleHead kicker="DATA · RESOURCES" title="数据管理"
        sub="统一资源接口：分页、关键字检索、字段筛选、白名单排序与增删改，字段校验在服务端执行。">
        {can("data:create") && schema && (
          <button className="c-btn primary" onClick={() => setDrawer({ mode: "create", schema, row: null })}>新增{view.title}</button>
        )}
        <button className="c-btn" onClick={() => { list.reload(); catalog.reload() }}>刷新</button>
      </ConsoleHead>

      <div className="c-tabs">
        {(catalog.data?.list || []).map((r) => (
          <button key={r.resource} className={`c-tab ${r.resource === res ? "on" : ""}`} onClick={() => setRes(r.resource)}>
            {VIEWS[r.resource]?.title || r.label}
            <span className="cnt">{r.count}</span>
          </button>
        ))}
      </div>

      <Panel>
        <div className="c-filters">
          <input className="c-input" placeholder={`搜索${view.title}…`} style={{ width: 220 }}
            value={q.keyword} onChange={(e) => setQ((s) => ({ ...s, keyword: e.target.value, page: 1 }))} />
          {(view.filters || []).map((f) => (
            view.enums?.[f] ? (
              <select key={f} className="c-select" value={filterVals[f] || ""}
                onChange={(e) => { setFilterVals((s) => ({ ...s, [f]: e.target.value })); setQ((s) => ({ ...s, page: 1 })) }}>
                <option value="">全部{fieldLabel(schema, f, VIEWS[res])}</option>
                {view.enums[f].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            ) : (
              <input key={f} className="c-input" style={{ width: 150 }} placeholder={fieldLabel(schema, f, VIEWS[res])}
                value={filterVals[f] || ""}
                onChange={(e) => { setFilterVals((s) => ({ ...s, [f]: e.target.value })); setQ((s) => ({ ...s, page: 1 })) }} />
            )
          ))}
          <select className="c-select" value={q.sort} onChange={(e) => setQ((s) => ({ ...s, sort: e.target.value, page: 1 }))}>
            <option value="">默认排序</option>
            {(schema?.sorts || []).map((s) => <option key={s} value={s}>按 {fieldLabel(schema, s, view)}</option>)}
          </select>
          <select className="c-select" value={q.order} onChange={(e) => setQ((s) => ({ ...s, order: e.target.value }))}>
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select>
          <button className="c-btn sm" onClick={() => { setQ({ keyword: "", sort: "", order: "asc", page: 1, pageSize: 10 }); setFilterVals({}) }}>重置</button>
          <span className="c-sub" style={{ marginLeft: "auto" }}>共 {list.data?.total ?? "—"} 条</span>
        </div>
      </Panel>

      <Panel>
        <ErrorNote error={list.error || catalog.error} onRetry={() => { list.reload(); catalog.reload() }} />
        {list.loading && !list.data ? <Loading /> : (
          <>
            <div className="c-table-wrap">
              <table className="c-table">
                <thead>
                  <tr>
                    {view.columns.map((c) => <th key={c.k} className={c.cls === "num" ? "num" : ""}>{c.label}</th>)}
                    <th className="num">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row[view.pk]}>
                      {view.columns.map((c) => (
                        <td key={c.k} className={c.cls || ""}>
                          {c.render ? c.render(row[c.k], row) : (row[c.k] === null || row[c.k] === undefined || row[c.k] === "" ? "—" : String(row[c.k]))}
                        </td>
                      ))}
                      <td>
                        <div className="acts">
                          {can("data:update") && (
                            <button className="c-btn sm" onClick={() => setDrawer({ mode: "edit", schema, row })}>编辑</button>
                          )}
                          {can("data:delete") && (
                            <button className="c-btn sm danger" onClick={() => onDelete(row)}>删除</button>
                          )}
                          {!can("data:update") && !can("data:delete") && <span className="c-sub">只读</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && <Empty text="没有匹配的数据" />}
            <Pager page={list.data?.page} pageSize={list.data?.pageSize} total={list.data?.total}
              onChange={(p) => setQ((s) => ({ ...s, page: p }))} />
          </>
        )}
      </Panel>

      {drawer && (
        <DataDrawer
          {...drawer}
          resource={res}
          view={view}
          onClose={() => setDrawer(null)}
          onDone={() => { setDrawer(null); list.reload(); catalog.reload() }}
        />
      )}
    </>
  )
}

function fieldLabel(schema, field, view) {
  const col = view?.columns?.find((c) => c.k === field)
  if (col) return col.label
  const f = schema?.fields?.find((x) => x.name === field)
  return f?.name || field
}

const LABELS = {
  id: "主键 ID", name: "名称", code_name: "英文标识", color: "主题色", tagline: "标语",
  brief: "简介", status: "状态", mcp: "MCP 接入", members: "成员数",
  dept_name: "归属部门", kind: "类型", pos_x: "坐标 X（0–1）", pos_y: "坐标 Y（0–1）",
  scale: "缩放比例", metrics: "指标 JSON",
  code: "客户编码", owner: "负责人", stage: "阶段", tags: "标签（逗号分隔）",
  next_follow: "下次跟进", profiled_at: "画像时间", level: "等级",
  title: "标题", generated: "生成时间", body: "正文（Markdown）",
}

function DataDrawer({ mode, schema, row, resource, view, onClose, onDone }) {
  const { push } = useToast()
  const isEdit = mode === "edit"
  const fields = schema?.fields || []
  const [form, setForm] = useState(() => {
    const init = {}
    fields.forEach((f) => {
      const v = row?.[f.name]
      init[f.name] = v === null || v === undefined ? "" : (f.type === "boolean" ? !!v : String(v))
    })
    return init
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [fieldErrs, setFieldErrs] = useState([])
  const upd = (k, v) => setForm((s) => ({ ...s, [k]: v }))

  const submit = async () => {
    setErr(""); setFieldErrs([]); setBusy(true)
    try {
      const body = {}
      fields.forEach((f) => {
        const v = form[f.name]
        if (v === "" || v === null || v === undefined) {
          if (!isEdit) return
          // 编辑态：仅当原值非空时才提交清空
          if (row?.[f.name] === null || row?.[f.name] === undefined || row?.[f.name] === "") return
          body[f.name] = f.type === "number" ? 0 : ""
          return
        }
        body[f.name] = f.type === "number" ? Number(v) : (f.type === "boolean" ? !!v : v)
      })
      if (isEdit) await api.update(resource, row[view.pk], body)
      else await api.create(resource, body)
      push(isEdit ? `${view.title}已更新` : `${view.title}已创建`, "ok")
      onDone()
    } catch (e) {
      setErr(e.message); setFieldErrs(e.details || []); push(e.message, "err", e.traceId)
    } finally { setBusy(false) }
  }

  return (
    <Drawer title={isEdit ? `编辑${view.title} · ${row[view.pk]}` : `新增${view.title}`}
      sub={isEdit ? "仅提交发生变化的字段由服务端合并" : "字段校验在服务端按资源 Schema 执行"}
      onClose={onClose}
      footer={<>
        <button className="c-btn" onClick={onClose}>取消</button>
        <button className="c-btn primary" disabled={busy} onClick={submit}>{busy ? "提交中…" : "保存"}</button>
      </>}>
      {fields.map((f) => {
        const enums = view?.enums?.[f.name] || (f.enum ? f.enum.map((v) => [v, v]) : null)
        const readOnly = isEdit && f.name === schema.pk
        return (
          <Field key={f.name} label={LABELS[f.name] || f.name} required={f.required && !isEdit}
            hint={`${f.name} · ${f.type}${f.enum ? ` · 可选值：${f.enum.join(" / ")}` : ""}`}>
            {f.type === "boolean" ? (
              <select className="c-select" value={form[f.name] ? "true" : "false"} disabled={readOnly}
                onChange={(e) => upd(f.name, e.target.value === "true")}>
                <option value="true">是 / 已启用</option>
                <option value="false">否 / 未启用</option>
              </select>
            ) : enums ? (
              <select className="c-select" value={form[f.name]} disabled={readOnly} onChange={(e) => upd(f.name, e.target.value)}>
                <option value="">请选择</option>
                {enums.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            ) : f.name === "body" ? (
              <textarea className="c-input c-textarea" rows={8} value={form[f.name]} onChange={(e) => upd(f.name, e.target.value)} />
            ) : (
              <input className="c-input" type={f.type === "number" ? "number" : "text"} value={form[f.name]}
                disabled={readOnly} step="any"
                onChange={(e) => upd(f.name, e.target.value)} />
            )}
          </Field>
        )
      })}
      {err && <div className="c-hint-bar err">{err}</div>}
      {!!fieldErrs.length && (
        <ul className="c-errlist">{fieldErrs.map((x, i) => <li key={i}>{typeof x === "string" ? x : x.message}</li>)}</ul>
      )}
    </Drawer>
  )
}
