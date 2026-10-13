import { useState } from "react"
import { useOutletContext } from "react-router-dom"
import { api } from "../../lib/api.js"
import { ConsoleHead, Panel, Drawer, Tag, Empty, Loading, ErrorNote, useToast } from "./ConsoleLayout.jsx"
import { useFetch, Pager, Field, fmtTime, statusTone, statusText } from "./common.jsx"
import { departments } from "../../data/db.js"

const EMPTY_FORM = {
  username: "", displayName: "", password: "", email: "", phone: "",
  roleId: "", deptId: "", status: "active", mustChangePassword: true,
}

export default function UsersPage() {
  const { perms, me } = useOutletContext()
  const { push } = useToast()
  const [q, setQ] = useState({ keyword: "", roleId: "", status: "", page: 1, pageSize: 10 })
  const [drawer, setDrawer] = useState(null) // {mode, user}
  const [pwdTarget, setPwdTarget] = useState(null)

  const can = (p) => perms.has(p)
  const users = useFetch(() => api.users(q), [q.page, q.roleId, q.status, q.keyword, q.pageSize])
  const roles = useFetch(() => api.roles(), [])

  const roleOpts = roles.data?.list || []

  const set = (patch) => setQ((s) => ({ ...s, ...patch, page: patch.page ?? 1 }))

  const onDelete = async (u) => {
    if (!window.confirm(`确认删除用户「${u.displayName}（${u.username}）」？该操作不可撤销。`)) return
    try {
      await api.deleteUser(u.id)
      push(`已删除用户 ${u.username}`, "ok")
      users.reload()
    } catch (e) { push(e.message, "err", e.traceId) }
  }

  const onUnlock = async (u) => {
    try {
      await api.unlockUser(u.id)
      push(`已解除 ${u.username} 的登录锁定`, "ok")
      users.reload()
    } catch (e) { push(e.message, "err", e.traceId) }
  }

  return (
    <>
      <ConsoleHead kicker="ORG · USERS" title="用户管理"
        sub="账号的创建、角色分配、状态控制与密码重置；内置安全约束会阻止越权的自我降级与唯一管理员失效。">
        {can("user:create") && (
          <button className="c-btn primary" onClick={() => setDrawer({ mode: "create" })}>新建用户</button>
        )}
        <button className="c-btn" onClick={users.reload}>刷新</button>
      </ConsoleHead>

      <Panel title={`账号列表${users.data ? ` · 共 ${users.data.total} 个` : ""}`}>
        <div className="c-filters">
          <input className="c-input" placeholder="搜索账号 / 姓名 / 邮箱 / 手机" style={{ width: 260 }}
            value={q.keyword} onChange={(e) => setQ((s) => ({ ...s, keyword: e.target.value, page: 1 }))} />
          <select className="c-select" value={q.roleId} onChange={(e) => set(s({ roleId: e.target.value }))}>
            <option value="">全部角色</option>
            {roleOpts.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="c-select" value={q.status} onChange={(e) => set(s({ status: e.target.value }))}>
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
          <button className="c-btn sm" onClick={() => setQ({ keyword: "", roleId: "", status: "", page: 1, pageSize: 10 })}>重置</button>
        </div>
      </Panel>

      <Panel>
        <ErrorNote error={users.error} onRetry={users.reload} />
        {users.loading && !users.data ? <Loading /> : (
          <>
            <div className="c-table-wrap">
              <table className="c-table">
                <thead>
                  <tr>
                    <th>账号</th><th>显示名称</th><th>角色</th><th>部门</th><th>联系方式</th>
                    <th>状态</th><th>最近登录</th><th className="num">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(users.data?.list || []).map((u) => (
                    <tr key={u.id}>
                      <td className="mono strong">{u.username}{u.id === me?.user?.id && <span className="self">我</span>}</td>
                      <td>{u.displayName}</td>
                      <td><Tag tone={u.roleCode === "super_admin" ? "purple" : "blue"} text={u.roleName} /></td>
                      <td>{u.deptName || "—"}</td>
                      <td className="mono">{u.email || "—"}<br /><small>{u.phone || "—"}</small></td>
                      <td>
                        <Tag tone={statusTone(u.status)} text={statusText(u.status)} />
                        {u.lockedUntil > Date.now() && <Tag tone="red" text="已锁定" />}
                        {u.mustChangePassword && <Tag tone="amber" text="待改密" />}
                      </td>
                      <td className="mono">{fmtTime(u.lastLoginAt)}</td>
                      <td>
                        <div className="acts">
                          {can("user:update") && <button className="c-btn sm" onClick={() => setDrawer({ mode: "edit", user: u })}>编辑</button>}
                          {can("user:reset_password") && <button className="c-btn sm" onClick={() => setPwdTarget(u)}>重置密码</button>}
                          {can("user:update") && u.failCount > 0 && <button className="c-btn sm" onClick={() => onUnlock(u)}>解锁</button>}
                          {can("user:delete") && <button className="c-btn sm danger" onClick={() => onDelete(u)}>删除</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!users.data?.list?.length && <Empty text="没有匹配的用户" />}
            <Pager page={users.data?.page} pageSize={users.data?.pageSize} total={users.data?.total}
              onChange={(p) => setQ((s) => ({ ...s, page: p }))} />
          </>
        )}
      </Panel>

      {drawer && (
        <UserDrawer
          mode={drawer.mode}
          user={drawer.user}
          roles={roleOpts}
          onClose={() => setDrawer(null)}
          onDone={() => { setDrawer(null); users.reload() }}
        />
      )}
      {pwdTarget && (
        <ResetPwdDrawer user={pwdTarget} onClose={() => setPwdTarget(null)} onDone={() => setPwdTarget(null)} />
      )}
    </>
  )
}

const DEPT_OPTIONS = departments.map((d) => ({ id: d.departmentId, name: d.name }))

function UserDrawer({ mode, user, roles, onClose, onDone }) {
  const { push } = useToast()
  const isEdit = mode === "edit"
  const [form, setForm] = useState(() => isEdit
    ? {
      displayName: user.displayName, email: user.email || "", phone: user.phone || "",
      roleId: user.roleId, deptId: user.deptId ? String(user.deptId) : "", status: user.status,
    }
    : { ...EMPTY_FORM })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [fieldErrs, setFieldErrs] = useState([])
  const upd = (k, v) => setForm((s) => ({ ...s, [k]: v }))

  const submit = async () => {
    setErr(""); setFieldErrs([]); setBusy(true)
    try {
      if (isEdit) {
        const body = {
          displayName: form.displayName,
          email: form.email,
          phone: form.phone,
          roleId: form.roleId,
          deptId: form.deptId ? Number(form.deptId) : null,
          status: form.status,
        }
        await api.updateUser(user.id, body)
        push(`用户 ${user.username} 已更新`, "ok")
      } else {
        await api.createUser({
          username: form.username, displayName: form.displayName, password: form.password,
          email: form.email, phone: form.phone, roleId: form.roleId,
          deptId: form.deptId ? Number(form.deptId) : undefined,
          status: form.status, mustChangePassword: !!form.mustChangePassword,
        })
        push(`用户 ${form.username} 已创建`, "ok")
      }
      onDone()
    } catch (e) {
      setErr(e.message)
      setFieldErrs(e.details || [])
      push(e.message, "err", e.traceId)
    } finally { setBusy(false) }
  }

  return (
    <Drawer title={isEdit ? `编辑用户 · ${user.username}` : "新建用户"}
      sub={isEdit ? `创建于 ${fmtTime(user.createdAt)} · ID ${user.id}` : "用户名创建后不可修改"}
      onClose={onClose}
      footer={<>
        <button className="c-btn" onClick={onClose}>取消</button>
        <button className="c-btn primary" disabled={busy} onClick={submit}>{busy ? "提交中…" : (isEdit ? "保存修改" : "创建用户")}</button>
      </>}>
      {!isEdit && (
        <Field label="登录账号" required hint="3–32 位，仅支持字母、数字、下划线、点与短横线">
          <input className="c-input" value={form.username} onChange={(e) => upd("username", e.target.value)} placeholder="例如 zhangsan" />
        </Field>
      )}
      <Field label="显示名称" required>
        <input className="c-input" value={form.displayName} onChange={(e) => upd("displayName", e.target.value)} />
      </Field>
      {!isEdit && (
        <Field label="初始密码" required hint="至少 8 位；勾选下方「首次登录需改密」后该密码仅作临时凭证">
          <input className="c-input" type="password" value={form.password} onChange={(e) => upd("password", e.target.value)} />
        </Field>
      )}
      <div className="c-row2">
        <Field label="所属角色" required>
          <select className="c-select" value={form.roleId} onChange={(e) => upd("roleId", e.target.value)}>
            <option value="">请选择角色</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="所属部门">
          <select className="c-select" value={form.deptId} onChange={(e) => upd("deptId", e.target.value)}>
            <option value="">不指定</option>
            {DEPT_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="c-row2">
        <Field label="邮箱">
          <input className="c-input" value={form.email} onChange={(e) => upd("email", e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="手机号">
          <input className="c-input" value={form.phone} onChange={(e) => upd("phone", e.target.value)} placeholder="13800000000" />
        </Field>
      </div>
      <Field label="账号状态">
        <select className="c-select" value={form.status} onChange={(e) => upd("status", e.target.value)}>
          <option value="active">启用</option>
          <option value="disabled">停用</option>
        </select>
      </Field>
      {!isEdit && (
        <label className="c-check">
          <input type="checkbox" checked={!!form.mustChangePassword}
            onChange={(e) => upd("mustChangePassword", e.target.checked)} />
          首次登录需修改密码
        </label>
      )}

      {err && <div className="c-hint-bar err">{err}</div>}
      {!!fieldErrs.length && (
        <ul className="c-errlist">{fieldErrs.map((x, i) => <li key={i}>{typeof x === "string" ? x : x.message}</li>)}</ul>
      )}
    </Drawer>
  )
}

function ResetPwdDrawer({ user, onClose, onDone }) {
  const { push } = useToast()
  const [pwd, setPwd] = useState("")
  const [must, setMust] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const submit = async () => {
    setErr(""); setBusy(true)
    try {
      await api.resetPassword(user.id, { newPassword: pwd, mustChangePassword: must })
      push(`已重置 ${user.username} 的密码`, "ok")
      onDone()
    } catch (e) { setErr(e.message); push(e.message, "err", e.traceId) } finally { setBusy(false) }
  }

  return (
    <Drawer title={`重置密码 · ${user.username}`} sub="重置会同时清除失败计数与登录锁定"
      onClose={onClose}
      footer={<>
        <button className="c-btn" onClick={onClose}>取消</button>
        <button className="c-btn primary" disabled={busy || pwd.length < 8} onClick={submit}>{busy ? "提交中…" : "确认重置"}</button>
      </>}>
      <Field label="新密码" required hint="至少 8 位">
        <input className="c-input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
      </Field>
      <label className="c-check">
        <input type="checkbox" checked={must} onChange={(e) => setMust(e.target.checked)} />
        要求该用户下次登录时修改密码
      </label>
      {err && <div className="c-hint-bar err">{err}</div>}
      <div className="c-note">
        安全约束：不允许删除或停用当前登录账号；系统至少保留一个启用状态的超级管理员。
      </div>
    </Drawer>
  )
}
