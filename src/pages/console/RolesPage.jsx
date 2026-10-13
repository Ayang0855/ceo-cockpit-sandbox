import { useState } from "react"
import { useOutletContext } from "react-router-dom"
import { api } from "../../lib/api.js"
import { ConsoleHead, Panel, Drawer, Tag, Loading, ErrorNote, useToast } from "./ConsoleLayout.jsx"
import { useFetch, Field } from "./common.jsx"

export default function RolesPage() {
  const { perms } = useOutletContext()
  const { push } = useToast()
  const can = (p) => perms.has(p)

  const roles = useFetch(() => api.roles(), [])
  const permCatalog = useFetch(() => api.permissions(), [])
  const [editing, setEditing] = useState(null)  // 角色对象
  const [creating, setCreating] = useState(false)

  const roleList = roles.data?.list || []
  const groups = permCatalog.data?.groups || []

  const onDelete = async (r) => {
    if (!window.confirm(`确认删除角色「${r.name}」？该操作不可撤销。`)) return
    try { await api.deleteRole(r.id); push(`已删除角色 ${r.name}`, "ok"); roles.reload() }
    catch (e) { push(e.message, "err", e.traceId) }
  }

  return (
    <>
      <ConsoleHead kicker="ORG · RBAC" title="角色与权限"
        sub="权限点共 15 项、按 6 个模块分组；角色的权限矩阵采用覆盖式更新，未提交的权限点视为移除。">
        {can("role:update") && <button className="c-btn primary" onClick={() => setCreating(true)}>新建角色</button>}
        <button className="c-btn" onClick={() => { roles.reload(); permCatalog.reload() }}>刷新</button>
      </ConsoleHead>

      <ErrorNote error={roles.error || permCatalog.error} onRetry={() => { roles.reload(); permCatalog.reload() }} />

      <Panel title={`角色列表${roles.data ? ` · 共 ${roles.data.total} 个` : ""}`}
        extra={permCatalog.data ? <span className="c-sub">权限点 {permCatalog.data.total} 项</span> : null}>
        {roles.loading && !roles.data ? <Loading /> : (
          <div className="c-table-wrap">
            <table className="c-table">
              <thead>
                <tr><th>角色</th><th>编码</th><th>类型</th><th>说明</th><th className="num">权限点</th><th className="num">用户数</th><th className="num">操作</th></tr>
              </thead>
              <tbody>
                {roleList.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.name}</td>
                    <td className="mono">{r.code}</td>
                    <td>{r.isBuiltin ? <Tag tone="purple" text="内置" /> : <Tag tone="gray" text="自定义" />}</td>
                    <td className="c-desc">{r.description || "—"}</td>
                    <td className="num">{r.permissionCodes.length} / {permCatalog.data?.total ?? 15}</td>
                    <td className="num">{r.userCount}</td>
                    <td>
                      <div className="acts">
                        <button className="c-btn sm" onClick={() => setEditing(r)}>
                          {can("role:update") ? "配置权限" : "查看权限"}
                        </button>
                        {can("role:update") && !r.isBuiltin && (
                          <button className="c-btn sm danger" onClick={() => onDelete(r)}>删除</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="权限点总览">
        {permCatalog.loading && !permCatalog.data ? <Loading /> : (
          <div className="perm-grid">
            {groups.map((g) => (
              <div className="perm-group" key={g.module}>
                <div className="gt">{g.module}<em>{g.items.length} 项</em></div>
                {g.items.map((p) => (
                  <div className="perm-item" key={p.code} style={{ cursor: "default" }}>
                    {p.name}<span className="code">{p.code}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {editing && (
        <RoleDrawer role={editing} groups={groups} allTotal={permCatalog.data?.total ?? 15}
          readOnly={!can("role:update")}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); roles.reload() }} />
      )}
      {creating && (
        <CreateRoleDrawer onClose={() => setCreating(false)}
          onDone={() => { setCreating(false); roles.reload() }} />
      )}
    </>
  )
}

function RoleDrawer({ role, groups, allTotal, readOnly, onClose, onDone }) {
  const { push } = useToast()
  const [checked, setChecked] = useState(() => new Set(role.permissionCodes))
  const [name, setName] = useState(role.name)
  const [desc, setDesc] = useState(role.description || "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const isSuper = role.code === "super_admin"

  const toggle = (code) => setChecked((s) => {
    const n = new Set(s)
    n.has(code) ? n.delete(code) : n.add(code)
    return n
  })

  const toggleGroup = (items, on) => setChecked((s) => {
    const n = new Set(s)
    items.forEach((p) => on ? n.add(p.code) : n.delete(p.code))
    return n
  })

  const save = async () => {
    setErr(""); setBusy(true)
    try {
      if (!role.isBuiltin && (name !== role.name || desc !== (role.description || ""))) {
        await api.updateRole(role.id, { name, description: desc })
      }
      await api.setRolePermissions(role.id, [...checked])
      push(`角色「${name}」权限已更新（${checked.size} 项）`, "ok")
      onDone()
    } catch (e) { setErr(e.message); push(e.message, "err", e.traceId) } finally { setBusy(false) }
  }

  return (
    <Drawer title={`配置权限 · ${role.name}`}
      sub={`${role.code} · ${role.isBuiltin ? "内置角色" : "自定义角色"} · 当前 ${checked.size}/${allTotal} 项`}
      onClose={onClose}
      footer={readOnly ? <button className="c-btn" onClick={onClose}>关闭</button> : <>
        <button className="c-btn" onClick={onClose}>取消</button>
        <button className="c-btn primary" disabled={busy || !checked.size} onClick={save}>{busy ? "保存中…" : "保存权限"}</button>
      </>}>
      {isSuper && (
        <div className="c-hint-bar">超级管理员必须保留全部权限点，否则系统可能失去管理能力。</div>
      )}
      {!role.isBuiltin && !readOnly && (
        <>
          <Field label="角色名称"><input className="c-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="角色说明"><input className="c-input" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        </>
      )}
      <div className="perm-grid" style={{ marginTop: 6 }}>
        {groups.map((g) => {
          const allOn = g.items.every((p) => checked.has(p.code))
          return (
            <div className="perm-group" key={g.module}>
              <div className="gt">
                {g.module}
                <em>{g.items.filter((p) => checked.has(p.code)).length}/{g.items.length}</em>
                {!readOnly && (
                  <button className="c-btn sm" style={{ marginLeft: "auto" }}
                    onClick={() => toggleGroup(g.items, !allOn)}>{allOn ? "全不选" : "全选"}</button>
                )}
              </div>
              {g.items.map((p) => (
                <label className="perm-item" key={p.code} title={p.description}>
                  <input type="checkbox" disabled={readOnly || isSuper} checked={checked.has(p.code)}
                    onChange={() => toggle(p.code)} />
                  {p.name}
                  <span className="code">{p.code}</span>
                </label>
              ))}
            </div>
          )
        })}
      </div>
      {err && <div className="c-hint-bar err">{err}</div>}
    </Drawer>
  )
}

function CreateRoleDrawer({ onClose, onDone }) {
  const { push } = useToast()
  const [form, setForm] = useState({ code: "", name: "", description: "" })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const upd = (k, v) => setForm((s) => ({ ...s, [k]: v }))

  const submit = async () => {
    setErr(""); setBusy(true)
    try {
      await api.createRole(form)
      push(`角色 ${form.name} 已创建，请记得配置权限`, "ok")
      onDone()
    } catch (e) { setErr(e.message); push(e.message, "err", e.traceId) } finally { setBusy(false) }
  }

  return (
    <Drawer title="新建角色" sub="创建后需在权限矩阵中勾选权限点"
      onClose={onClose}
      footer={<>
        <button className="c-btn" onClick={onClose}>取消</button>
        <button className="c-btn primary" disabled={busy} onClick={submit}>{busy ? "创建中…" : "创建"}</button>
      </>}>
      <Field label="角色编码" required hint="小写字母开头，可含数字与下划线；创建后不可修改">
        <input className="c-input" value={form.code} onChange={(e) => upd("code", e.target.value)} placeholder="例如 auditor" />
      </Field>
      <Field label="角色名称" required>
        <input className="c-input" value={form.name} onChange={(e) => upd("name", e.target.value)} placeholder="例如 审计员" />
      </Field>
      <Field label="角色说明">
        <input className="c-input" value={form.description} onChange={(e) => upd("description", e.target.value)} />
      </Field>
      {err && <div className="c-hint-bar err">{err}</div>}
    </Drawer>
  )
}
