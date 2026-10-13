#!/usr/bin/env node
// ============================================================
// 一键上架 GitHub（本机无凭据时，用 PAT 一条命令完成）
//
// 用法：
//   GITHUB_TOKEN=ghp_xxx npm run push:github
//   npm run push:github -- --token ghp_xxx --repo ceo-cockpit-sandbox --public
//
// 行为：
//   1. 用令牌调用 GitHub API 校验身份；
//   2. 远端仓库不存在则自动创建（默认公开）；已存在则直接复用；
//   3. 把当前分支推送到远端同名分支。
//   令牌只用于本次推送，不会写入 .git/config / 凭据文件。
// ============================================================
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, "../..")

const argv = process.argv.slice(2)
const argOf = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || argOf("token")
if (!token) {
  console.error("缺少令牌。用法：GITHUB_TOKEN=ghp_xxx npm run push:github")
  console.error("（令牌需勾选 repo 权限；仅本次推送使用，不会写入本地配置）")
  process.exit(2)
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

// ---------- 1. 校验身份 ----------
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
console.log(`[push:github] 令牌有效，账号：${owner}`)

// ---------- 2. 解析目标仓库 ----------
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
  console.log(`[push:github] 远端仓库已存在，直接推送：${existing.body.html_url}`)
} else {
  console.error(`[push:github] 查询仓库失败（HTTP ${existing.status}）：${existing.body?.message || ""}`)
  process.exit(5)
}

// ---------- 3. 推送（令牌只出现在本次命令中，不落盘） ----------
const pushUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
console.log(`[push:github] 推送 ${branch} → ${owner}/${repo} …`)
execFileSync("git", ["push", pushUrl, `${branch}:${branch}`], {
  cwd: ROOT, stdio: "inherit",
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/usr/bin/true" },
})

// ---------- 4. 确保 origin 指向该仓库（不含令牌） ----------
const cleanUrl = `https://github.com/${owner}/${repo}.git`
if (remoteUrl !== cleanUrl) {
  try { git(["remote", "set-url", "origin", cleanUrl]) } catch { git(["remote", "add", "origin", cleanUrl]) }
  console.log(`[push:github] origin 已指向 ${cleanUrl}`)
}

console.log(`\n[push:github] 推送完成：https://github.com/${owner}/${repo}`)
console.log("[push:github] 若仓库为公开，GitHub Actions 会按 .github/workflows/deploy.yml 自动构建并发布 dist-site 到 Pages")
