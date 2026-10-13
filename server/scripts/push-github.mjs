#!/usr/bin/env node
// ============================================================
// 一键上架 GitHub
//
// 两种认证方式（自动选择）：
//   A. 已有令牌：GITHUB_TOKEN=ghp_xxx npm run push:github
//   B. 无令牌（默认）：走 GitHub 官方 OAuth 设备授权流程
//      —— 脚本输出 8 位设备码与授权网址，浏览器确认一次即可，
//         无需创建/复制任何令牌。
//
// 可选参数：
//   --repo <name>   指定仓库名（默认取 origin，回退 ceo-cockpit-sandbox）
//   --private       创建为私有仓库（默认公开）
//   --token <t>     等价于 GITHUB_TOKEN
//   --device        强制使用设备授权流程
//
// 网络说明：统一用 curl 发 HTTPS 请求（自动继承 HTTP(S)_PROXY），
//          并对瞬时网络错误做重试，避免授权等待期间被抖动打断。
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

// ---------- HTTP（curl，自动走系统代理） ----------
function curl(url, { method = "GET", form = null, json = null, headers = [], timeout = 30 } = {}) {
  const args = ["-s", "-m", String(timeout), "-X", method, "-H", "Accept: application/json", "-H", "User-Agent: ceo-cockpit-push"]
  if (form) { args.push("-d", new URLSearchParams(form).toString()) }
  if (json) { args.push("-H", "Content-Type: application/json", "-d", JSON.stringify(json)) }
  for (const h of headers) args.push("-H", h)
  args.push(url)
  try {
    const out = execFileSync("curl", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
    try { return { ok: true, body: JSON.parse(out) } } catch { return { ok: true, body: { _raw: out } } }
  } catch (e) {
    return { ok: false, error: (e.stderr || e.message || "").toString().trim().slice(0, 200) }
  }
}

// 带重试的 api 调用
function apiCall(url, { method = "GET", json = null, headers = [], timeout = 30 } = {}, tries = 3) {
  let last = null
  for (let i = 0; i < tries; i++) {
    const r = curl(url, { method, json, headers, timeout })
    if (r.ok) return r.body
    last = r.error
    if (i < tries - 1) execFileSync("sleep", ["2"])
  }
  console.error(`[push:github] 网络请求失败（已重试 ${tries} 次）：${last}`)
  process.exit(6)
}

// ---------- 1. 取得令牌 ----------
async function deviceFlow() {
  const start = apiCall("https://github.com/login/device/code", {
    method: "POST", form: { client_id: CLIENT_ID, scope: SCOPE },
  })
  if (!start.device_code) {
    console.error("[push:github] 申请设备码失败：", JSON.stringify(start))
    process.exit(4)
  }

  console.log("")
  console.log("══════════════════════════════════════════════")
  console.log("  请在浏览器完成一次授权（约 10 秒）：")
  console.log(`  1) 打开   ${start.verification_uri}`)
  console.log(`  2) 输入码 ${start.user_code}`)
  console.log("  3) 点击 Continue → Authorize 同意授权")
  console.log("══════════════════════════════════════════════")
  console.log(`[push:github] 等待授权中（设备码约 ${Math.round(start.expires_in / 60)} 分钟内有效）…`)
  console.log("")

  const interval = Math.max(5, Number(start.interval) || 5)
  const deadline = Date.now() + Number(start.expires_in || 900) * 1000
  let networkFails = 0

  while (Date.now() < deadline) {
    execFileSync("sleep", [String(interval)])
    const r = curl("https://github.com/login/oauth/access_token", {
      method: "POST",
      form: { client_id: CLIENT_ID, device_code: start.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" },
    })
    if (!r.ok) {
      networkFails++
      console.log(`[push:github] 轮询网络抖动（第 ${networkFails} 次），继续等待…`)
      if (networkFails > 40) { console.error("[push:github] 网络持续不可用，已退出"); process.exit(6) }
      continue
    }
    networkFails = 0
    const out = r.body
    if (out.access_token) {
      console.log("[push:github] 授权成功，已取得临时访问令牌（仅本次使用，不落盘）")
      return out.access_token
    }
    if (out.error === "authorization_pending") continue
    if (out.error === "slow_down") { execFileSync("sleep", ["5"]); continue }
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
const authHeaders = [`Authorization: Bearer ${token}`, "X-GitHub-Api-Version: 2022-11-28"]
const me = apiCall("https://api.github.com/user", { headers: authHeaders })
if (!me?.login) {
  console.error(`[push:github] 令牌校验失败：${me?.message || "未知错误"}`)
  console.error("[push:github] 请确认令牌有效且具备 repo 权限")
  process.exit(4)
}
const owner = me.login
console.log(`[push:github] 身份校验通过，账号：${owner}`)

// ---------- 3. 解析并确保目标仓库存在 ----------
let repo = argOf("repo")
if (!repo && remoteUrl) {
  const m = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/)
  if (m) repo = m[2]
}
repo = repo || "ceo-cockpit-sandbox"

const existing = apiCall(`https://api.github.com/repos/${owner}/${repo}`, { headers: authHeaders })
if (existing?.id) {
  console.log(`[push:github] 远端仓库已存在（${existing.private ? "私有" : "公开"}），直接推送：${existing.html_url}`)
} else if (existing?.message === "Not Found") {
  console.log(`[push:github] 远端仓库 ${owner}/${repo} 不存在，正在创建（${isPrivate ? "私有" : "公开"}）…`)
  const created = apiCall("https://api.github.com/user/repos", {
    method: "POST", headers: authHeaders,
    json: {
      name: repo, private: isPrivate,
      description: "CEO 经营驾驶舱 + 公司沙盘 + 后端控制台（React + Express/node:sqlite 同仓一体化）",
      has_issues: true, has_wiki: false, auto_init: false,
    },
  })
  if (!created?.id) {
    console.error(`[push:github] 创建仓库失败：${created?.message || JSON.stringify(created)}`)
    if (created?.errors) console.error(JSON.stringify(created.errors))
    process.exit(5)
  }
  console.log(`[push:github] 仓库已创建：${created.html_url}`)
} else {
  console.error(`[push:github] 查询仓库失败：${existing?.message || JSON.stringify(existing)}`)
  process.exit(5)
}

// ---------- 4. 推送（令牌只出现在本次命令中，不落盘） ----------
const pushUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
console.log(`[push:github] 推送 ${branch} → ${owner}/${repo} …`)
const pushEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/usr/bin/true" }
try {
  execFileSync("git", ["push", pushUrl, `${branch}:${branch}`], { cwd: ROOT, stdio: "inherit", env: pushEnv })
} catch {
  console.log("[push:github] 常规推送失败（远端已有不同历史），改用 --force-with-lease 覆盖 …")
  execFileSync("git", ["push", "--force-with-lease", pushUrl, `${branch}:${branch}`], { cwd: ROOT, stdio: "inherit", env: pushEnv })
}

// ---------- 5. 确保 origin 指向干净地址（不含令牌） ----------
const cleanUrl = `https://github.com/${owner}/${repo}.git`
if (remoteUrl !== cleanUrl) {
  try { git(["remote", "set-url", "origin", cleanUrl]) } catch { git(["remote", "add", "origin", cleanUrl]) }
  console.log(`[push:github] origin 已指向 ${cleanUrl}`)
}

console.log(`\n[push:github] 推送完成：https://github.com/${owner}/${repo}`)
