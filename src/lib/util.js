// 波形画布：绘制智能体/单位的近期动作波形
export function drawWave(canvas, seed = 1, color = "#9FE8EE", dark = true) {
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 120
  const h = canvas.clientHeight || 32
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext("2d")
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  // 基于种子的伪随机
  let s = seed * 9301 + 49297
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }

  const pts = []
  const n = 28
  let v = 0.5
  for (let i = 0; i < n; i++) {
    v = Math.min(0.95, Math.max(0.05, v + (rnd() - 0.5) * 0.42))
    pts.push(v)
  }

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  if (dark) {
    grad.addColorStop(0, "rgba(159,232,238,0.32)")
    grad.addColorStop(1, "rgba(159,232,238,0)")
  } else {
    grad.addColorStop(0, "rgba(27,61,228,0.2)")
    grad.addColorStop(1, "rgba(27,61,228,0)")
  }

  const x = (i) => (i / (n - 1)) * w
  const y = (p) => h - 4 - p * (h - 10)

  // 填充
  ctx.beginPath()
  ctx.moveTo(0, h)
  pts.forEach((p, i) => ctx.lineTo(x(i), y(p)))
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // 折线
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p)) : ctx.moveTo(x(i), y(p))))
  ctx.strokeStyle = dark ? "rgba(159,232,238,0.85)" : "rgba(27,61,228,0.7)"
  ctx.lineWidth = 1.4
  ctx.lineJoin = "round"
  ctx.stroke()

  // 末端点
  const last = pts[pts.length - 1]
  ctx.beginPath()
  ctx.arc(x(n - 1), y(last), 2.4, 0, Math.PI * 2)
  ctx.fillStyle = dark ? "#9FE8EE" : "#1B3DE4"
  ctx.fill()
}

// 星空背景
export function paintStars(canvas) {
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const resize = () => {
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    const ctx = canvas.getContext("2d")
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    let s = 7
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }
    const count = Math.round((window.innerWidth * window.innerHeight) / 9000)
    for (let i = 0; i < count; i++) {
      const px = rnd() * window.innerWidth
      const py = rnd() * window.innerHeight * 0.9
      const r = rnd() * 1.1 + 0.2
      const a = 0.15 + rnd() * 0.55
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(200,220,245,${a})`
      ctx.fill()
    }
  }
  resize()
  window.addEventListener("resize", resize)
  return () => window.removeEventListener("resize", resize)
}

// 数字格式化
export const fmtMoney = (n) =>
  "¥" + Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtInt = (n) => Number(n).toLocaleString("zh-CN")
export const clockNow = () => {
  const d = new Date()
  const p = (x) => String(x).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
