#!/usr/bin/env node
// ============================================================
// 一键上架 GitHub
//
// 两种认证方式（自动选择）：
//   A. 已有令牌：GITHUB_TOKEN=ghp_xxx npm run push:github
//   B. 无令牌（默认）：走 GitHub 官方 OAuth 设备授权流程
//      —— 脚本会输出一个 8 位设备码与授权网址，
//         在浏览器确认一次即可，无需创建/复制任何令牌。
//
// 可选参数：
//   --repo <name>   指定仓库名（默认取 origin，回退 ceo-cockpit-sandbox）
//   --private       创建为私有仓库（默认公开）
//   --token <t>     等价于 GITHUB_TOKEN
//   --device        强制使用设备授权流程
//
// 行为：
//   1. 校验身份（GET /user）；
//   2. 远端仓库不存在则自动创建；
//   3. 推送当前分支到远端同名分支（令牌只出现在本次命令中，不落盘）；
//   4. 把 origin 重置为不含令牌的干净地址。
// ============================================================
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, "../..")

// GitHub CLI 的公开 client_id（OAuth Device Flow 需要，非机密）
const CLIENT_ID = "178c6fc778ccc68e1d6a"
const SCOPE = "repo workflow" // repo=建仓/推送；workflow=允许推送 .github/workflows 下的文件

const argv = process.argv.slice(2)
const argOf = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const isPrivate = argv.includes("--private")
const git = (args, opts = {}) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", ...opts }).trim()

// ---------- 0. 基本环境检查 ----------
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"])
const dirty = git(["status", "--porcelain"])
if (dirty) {
  console.error("[push:github] 工作区有未提交改动，请先提交后再推送：")
  console.error(dirty.split("\n").slice(0, 10).join("\n"))
  process.exit(3)
}

let remoteUrl = ""
try { remoteUrl = git(["remote", "get-url", "origin"]) } catch { remoteUrl = "" }

// ---------- 1. 取得令牌 ----------
async function deviceFlow() {
  const startRes = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "ceo-cockpit-push" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
  })
  const start = await startRes.json()
  if (!start.device_code) {
    console.error("[push:github] 申请设备码失败：", JSON.stringify(start))
    process.exit(4)
  }

  console.log("")
  console.log("──────────────────────────────────────────────")
  console.log("  请在浏览器完成一次授权（约 10 秒）：")
  console.log(`  1) 打开   ${start.verification_uri}`)
  console.log(`  2) 输入码 ${start.user_code}`)
  console.log("  3) 点击 Continue / Authorize 同意授权")
  console.log("──────────────────────────────────────────────")
  console.log(`[push:github] 等待授权中（设备码 ${Math.round(start.expires_in / 60)} 分钟内有效）…`)
  console.log("")

  const interval = Math.max(5, Number(start.interval) || 5)
  const deadline = Date.now() + Number(start.expires_in || 900) * 1000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000))
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "ceo-cockpit-push" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: start.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    })
    const out = await res.json()
    if (out.access_token) {
      console.log("[push:github] 授权成功，已取得临时访问令牌（仅本次使用）")
      return out.access_token
    }
    if (out.error === "authorization_pending") continue
    if (out.error === "slow_down") { await new Promise((r) => setTimeout(r, 5000)); continue }
    if (out.error === "expired_token") { console.error("[push:github] 设备码已过期，请重新运行本命令"); process.exit(4) }
    if (out.error === "access_denied") { console.error("[push:github] 授权被拒绝"); process.exit(4) }
    console.error(`[push:github] 轮询异常：${out.error || "未知"} ${out.error_description || ""}`)
    process.exit(4)
  }
  console.error("[push:github] 等待授权超时，请重新运行本命令")
  process.exit(4)
}

let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || argOf("token")
if (!token) token = await deviceFlow()

// ---------- 2. 校验身份 ----------
const api = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ceo-cockpit-push",
      ...(init.headers || {}),
    },
  })
  let body = null
  try { body = await res.json() } catch { /* 无响应体 */ }
  return { status: res.status, body }
}

const me = await api("/user")
if (me.status !== 200) {
  console.error(`[push:github] 令牌校验失败（HTTP ${me.status}）：${me.body?.message || "未知错误"}`)
  console.error("[push:github] 请确认令牌有效且具备 repo 权限（细粒度令牌需要 Contents: Read and write + Administration: Read and write）")
  process.exit(4)
}
const owner = me.body.login
console.log(`[push:github] 身份校验通过，账号：${owner}`)

// ---------- 3. 解析并确保目标仓库存在 ----------
let repo = argOf("repo")
if (!repo && remoteUrl) {
  const m = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/)
  if (m) repo = m[2]
}
repo = repo || "ceo-cockpit-sandbox"

const existing = await api(`/repos/${owner}/${repo}`)
if (existing.status === 404) {
  console.log(`[push:github] 远端仓库 ${owner}/${repo} 不存在，正在创建（${isPrivate ? "私有" : "公开"}）…`)
  const created = await api("/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: repo,
      private: isPrivate,
      description: "CEO 经营驾驶舱 + 公司沙盘 + 后端控制台（React + Express/node:sqlite 同仓一体化）",
      has_issues: true, has_wiki: false, auto_init: false,
    }),
  })
  if (created.status !== 201) {
    console.error(`[push:github] 创建仓库失败（HTTP ${created.status}）：${created.body?.message || ""}`)
    if (created.body?.errors) console.error(JSON.stringify(created.body.errors))
    process.exit(5)
  }
  console.log(`[push:github] 仓库已创建：${created.body.html_url}`)
} else if (existing.status === 200) {
  console.log(`[push:github] 远端仓库已存在（${existing.body.private ? "私有" : "公开"}），直接推送：${existing.body.html_url}`)
} else {
  console.error(`[push:github] 查询仓库失败（HTTP ${existing.status}）：${existing.body?.message || ""}`)
  process.exit(5)
}

// ---------- 4. 推送（令牌只出现在本次命令中，不落盘） ----------
const pushUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
console.log(`[push:github] 推送 ${branch} → ${owner}/${repo} …`)
const pushEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/usr/bin/true" }
try {
  execFileSync("git", ["push", pushUrl, `${branch}:${branch}`], { cwd: ROOT, stdio: "inherit", env: pushEnv })
} catch {
  console.log(`[push:github] 常规推送失败（远端已有不同历史），改用 --force-with-lease 覆盖 …`)
  execFileSync("git", ["push", "--force-with-lease", pushUrl, `${branch}:${branch}`], { cwd: ROOT, stdio: "inherit", env: pushEnv })
}

// ---------- 5. 确保 origin 指向干净地址（不含令牌） ----------
const cleanUrl = `https://github.com/${owner}/${repo}.git`
if (remoteUrl !== cleanUrl) {
  try { git(["remote", "set-url", "origin", cleanUrl]) } catch { git(["remote", "add", "origin", cleanUrl]) }
  console.log(`[push:github] origin 已指向 ${cleanUrl}`)
}

console.log(`\n[push:github] 推送完成：https://github.com/${owner}/${repo}`)
console.log("[push:github] 可在 GitHub 仓库页面直接查看前后端同仓源码与 README 部署说明")
