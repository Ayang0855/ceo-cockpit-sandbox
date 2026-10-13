import { useState } from "react"
import { useOutletContext } from "react-router-dom"
import { api } from "../../lib/api.js"
import { ConsoleHead, Panel, Drawer, Tag, Empty, Loading, ErrorNote, useToast } from "./ConsoleLayout.jsx"
import { useFetch, Field, fmtTime } from "./common.jsx"

const GROUP_LABEL = {
  site: "站点信息", business: "业务指标", security: "安全策略",
  observability: "可观测性", integration: "外部集成", release: "发布开关", general: "通用",
}
const MASK = "••••••••"

export default function ConfigsPage() {
  const { perms } = useOutletContext()
  const { push } = useToast()
  const can = (p) => perms.has(p)

  const [keyword, setKeyword] = useState("")
  const [group, setGroup] = useState("")
  const [reveal, setReveal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({})   // 内联编辑暂存 {key: value}
  const [busyKey, setBusyKey] = useState("")

  const cfg = useFetch(() => api.configs({ keyword, group, reveal: reveal ? "true" : "" }), [keyword, group, reveal])

  const groups = cfg.data?.groups || []

  const setVal = (k, v) => setDraft((s) => ({ ...s, [k]: v }))
  const dirtyKeys = Object.keys(draft).filter((k) => {
    const item = cfg.data?.list?.find((c) => c.key === k)
    if (!item) return false
    return String(draft[k]) !== String(normalize(item.value))
  })

  const saveOne = async (item) => {
    setBusyKey(item.key)
    try {
      await api.saveConfig(item.key, castValue(draft[item.key], item.type))
      push(`配置项 ${item.key} 已保存`, "ok")
      setDraft((s) => { const n = { ...s }; delete n[item.key]; return n })
      cfg.reload()
    } catch (e) { push(e.message, "err", e.traceId) } finally { setBusyKey("") }
  }

  const saveBatch = async () => {
    if (!dirtyKeys.length) return
    try {
      const items = dirtyKeys.map((k) => {
        const item = cfg.data.list.find((c) => c.key === k)
        return { key: k, value: castValue(draft[k], item.type) }
      })
      const d = await api.saveConfigsBatch(items)
      push(`已更新 ${d.updated} 项${d.failed ? `，${d.failed} 项失败` : ""}`, d.failed ? "warn" : "ok")
      if (d.errors?.length) d.errors.forEach((e) => push(`${e.key}：${e.message}`, "err"))
      setDraft({})
      cfg.reload()
    } catch (e) { push(e.message, "err", e.traceId) }
  }

  const onDelete = async (item) => {
    if (!window.confirm(`确认删除配置项 ${item.key}？`)) return
    try { await api.deleteConfig(item.key); push(`已删除 ${item.key}`, "ok"); cfg.reload() }
    catch (e) { push(e.message, "err", e.traceId) }
  }

  const visible = (cfg.data?.list || []).filter((c) => !group || c.group === group)

  return (
    <>
      <ConsoleHead kicker="OPS · CONFIG" title="配置维护"
        sub="运行参数集中管理：按分组浏览、类型校验、密钥脱敏展示，支持单条保存与批量提交。">
        {can("config:update") && (
          <button className="c-btn" onClick={() => setReveal((v) => !v)}>
            {reveal ? "隐藏密钥明文" : "显示密钥明文"}
          </button>
        )}
        {can("config:update") && <button className="c-btn primary" onClick={() => setCreating(true)}>新增配置项</button>}
        <button className="c-btn" onClick={cfg.reload}>刷新</button>
      </ConsoleHead>

      <ErrorNote error={cfg.error} onRetry={cfg.reload} />

      {cfg.data?.masked === false && (
        <div className="c-hint-bar">当前处于明文模式，密钥类配置将以原文展示，请在受信环境下操作。</div>
      )}

      <Panel>
        <div className="c-filters">
          <input className="c-input" placeholder="搜索配置键 / 名称 / 说明" style={{ width: 260 }}
            value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <select className="c-select" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">全部分组</option>
            {groups.map((g) => <option key={g.group} value={g.group}>{GROUP_LABEL[g.group] || g.group}（{g.count}）</option>)}
          </select>
          {(keyword || group) && <button className="c-btn sm" onClick={() => { setKeyword(""); setGroup("") }}>重置</button>}
          <span className="c-sub" style={{ marginLeft: "auto" }}>共 {cfg.data?.total ?? "—"} 项</span>
        </div>
      </Panel>

      {cfg.loading && !cfg.data ? <Loading /> : (
        <>
          {/* 按分组渲染：视图分组优先，否则用数据里的分组 */}
          {(group ? [{ group, count: visible.length, items: visible }] : groups).map((g) => (
            <Panel key={g.group} title={`${GROUP_LABEL[g.group] || g.group} · ${g.group}`}
              extra={<span className="c-sub">{g.count} 项</span>}>
              <div className="cfg-list">
                {g.items.map((c) => {
                  const val = draft[c.key] ?? normalize(c.value)
                  const changed = dirtyKeys.includes(c.key)
                  const isSecret = c.isSecret
                  return (
                    <div className={`cfg-row ${changed ? "dirty" : ""}`} key={c.key}>
                      <div className="cfg-meta">
                        <div className="cfg-key mono">{c.key}
                          {isSecret && <Tag tone="amber" text="密钥" />}
                          {!c.editable && <Tag tone="gray" text="只读" />}
                          <Tag tone="blue" text={c.type} />
                        </div>
                        <div className="cfg-label">{c.label || "—"}{c.description ? ` · ${c.description}` : ""}</div>
                        <div className="cfg-upd">更新于 {fmtTime(c.updatedAt)} · {c.updatedBy || "system"}</div>
                      </div>
                      <div className="cfg-input">
                        {c.type === "boolean" ? (
                          <select className="c-select" disabled={!c.editable || !can("config:update")}
                            value={String(val)} onChange={(e) => setVal(c.key, e.target.value === "true")}>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : c.type === "json" ? (
                          <textarea className="c-input c-textarea" rows={2} disabled={!c.editable || !can("config:update")}
                            value={typeof val === "string" ? val : JSON.stringify(val)}
                            onChange={(e) => setVal(c.key, e.target.value)} />
                        ) : (
                          <input className="c-input" disabled={!c.editable || !can("config:update")}
                            type={c.type === "number" ? "number" : "text"}
                            value={isSecret && val === MASK && !reveal ? MASK : val}
                            onChange={(e) => setVal(c.key, e.target.value)} />
                        )}
                      </div>
                      <div className="cfg-acts">
                        {can("config:update") && c.editable && (
                          <button className="c-btn sm" disabled={busyKey === c.key || !changed} onClick={() => saveOne(c)}>
                            {busyKey === c.key ? "保存中…" : "保存"}
                          </button>
                        )}
                        {can("config:update") && c.editable && !c.isSecret && (
                          <button className="c-btn sm danger" onClick={() => onDelete(c)}>删除</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          ))}
          {!visible.length && <Panel><Empty text="没有匹配的配置项" /></Panel>}
        </>
      )}

      {!!dirtyKeys.length && (
        <div className="c-savebar">
          <span>有 <b>{dirtyKeys.length}</b> 项未保存的改动</span>
          <button className="c-btn sm" onClick={() => setDraft({})}>放弃</button>
          <button className="c-btn sm primary" onClick={saveBatch}>批量保存</button>
        </div>
      )}

      {creating && <CreateConfigDrawer onClose={() => setCreating(false)} onDone={() => { setCreating(false); cfg.reload() }} />}
    </>
  )
}

function normalize(v) {
  if (v === null || v === undefined) return ""
  if (typeof v === "boolean") return String(v)
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

function castValue(v, type) {
  if (type === "number") return Number(v)
  if (type === "boolean") return v === true || v === "true" || v === 1 || v === "1"
  return v
}

function CreateConfigDrawer({ onClose, onDone }) {
  const { push } = useToast()
  const [form, setForm] = useState({ key: "", value: "", type: "string", group: "general", label: "", description: "", isSecret: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const upd = (k, v) => setForm((s) => ({ ...s, [k]: v }))

  const submit = async () => {
    setErr(""); setBusy(true)
    try {
      await api.createConfig({ ...form, value: castValue(form.value, form.type) })
      push(`配置项 ${form.key} 已创建`, "ok")
      onDone()
    } catch (e) { setErr(e.message); push(e.message, "err", e.traceId) } finally { setBusy(false) }
  }

  return (
    <Drawer title="新增配置项" sub="仅支持字母开头的键名；密钥类配置保存后默认脱敏展示"
      onClose={onClose}
      footer={<>
        <button className="c-btn" onClick={onClose}>取消</button>
        <button className="c-btn primary" disabled={busy} onClick={submit}>{busy ? "创建中…" : "创建"}</button>
      </>}>
      <Field label="配置键" required hint="例如 feature.newConsole">
        <input className="c-input" value={form.key} onChange={(e) => upd("key", e.target.value)} />
      </Field>
      <div className="c-row2">
        <Field label="数据类型" required>
          <select className="c-select" value={form.type} onChange={(e) => upd("type", e.target.value)}>
            {["string", "number", "boolean", "enum", "json"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="分组">
          <select className="c-select" value={form.group} onChange={(e) => upd("group", e.target.value)}>
            {Object.entries(GROUP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="配置值" required>
        <input className="c-input" value={form.value} onChange={(e) => upd("value", e.target.value)} />
      </Field>
      <Field label="显示名称"><input className="c-input" value={form.label} onChange={(e) => upd("label", e.target.value)} /></Field>
      <Field label="说明"><input className="c-input" value={form.description} onChange={(e) => upd("description", e.target.value)} /></Field>
      <label className="c-check">
        <input type="checkbox" checked={form.isSecret} onChange={(e) => upd("isSecret", e.target.checked)} />
        标记为密钥（列表与接口默认脱敏）
      </label>
      {err && <div className="c-hint-bar err">{err}</div>}
    </Drawer>
  )
}
