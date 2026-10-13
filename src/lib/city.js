// 程序化生成的全息城市（首页中央视觉，原创绘制）
export function paintCity(canvas) {
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const W = canvas.clientWidth || 560
  const H = canvas.clientHeight || 420
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext("2d")
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  const cx = W / 2
  const baseY = H * 0.78
  const rx = W * 0.4
  const ry = W * 0.075

  let s = 42
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }

  // 底座圆盘（多层椭圆）
  for (let i = 4; i >= 0; i--) {
    ctx.beginPath()
    ctx.ellipse(cx, baseY + i * 7, rx * (1 + i * 0.055), ry * (1 + i * 0.055), 0, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(120,170,255,${0.75 - i * 0.12})`
    ctx.lineWidth = 1.2
    ctx.stroke()
  }
  // 发光台面
  const disc = ctx.createRadialGradient(cx, baseY, 4, cx, baseY, rx)
  disc.addColorStop(0, "rgba(140,195,255,0.55)")
  disc.addColorStop(0.7, "rgba(80,130,245,0.22)")
  disc.addColorStop(1, "rgba(60,110,230,0)")
  ctx.beginPath()
  ctx.ellipse(cx, baseY, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = disc
  ctx.fill()

  // 建筑群（同心环分布）
  const rings = [0.16, 0.36, 0.58, 0.8]
  const glow = ctx.createRadialGradient(cx, baseY - H * 0.25, 10, cx, baseY - H * 0.25, H * 0.5)
  glow.addColorStop(0, "rgba(160,205,255,0.2)")
  glow.addColorStop(1, "rgba(150,200,255,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  rings.forEach((rr, ri) => {
    const count = 6 + ri * 5
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.5
      const dist = rx * rr * (0.75 + rnd() * 0.5)
      const bx = cx + Math.cos(a) * dist
      const by = baseY + Math.sin(a) * dist * (ry / rx) * 0.9
      const bh = (0.12 + rnd() * 0.5) * (1 - rr * 0.55) * H * 0.62
      const bw = 4 + rnd() * 7
      const alpha = 0.85 - rr * 0.5
      const g = ctx.createLinearGradient(bx, by, bx, by - bh)
      g.addColorStop(0, `rgba(175,215,255,${alpha})`)
      g.addColorStop(1, `rgba(110,160,255,${alpha * 0.4})`)
      ctx.fillStyle = g
      ctx.fillRect(bx - bw / 2, by - bh, bw, bh)
      // 顶部亮点
      ctx.beginPath()
      ctx.arc(bx, by - bh, 1.3, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(190,225,255,${alpha})`
      ctx.fill()
      // 窗灯
      if (rnd() > 0.45) {
        ctx.fillStyle = `rgba(210,240,255,${alpha * 0.8})`
        for (let wy = by - bh + 5; wy < by - 4; wy += 6) {
          if (rnd() > 0.6) ctx.fillRect(bx - bw / 2 + 1, wy, bw - 2, 1.2)
        }
      }
    }
  })

  // 中心尖塔
  const th = H * 0.5
  const tg = ctx.createLinearGradient(cx, baseY, cx, baseY - th)
  tg.addColorStop(0, "rgba(190,225,255,0.95)")
  tg.addColorStop(1, "rgba(120,170,255,0.1)")
  ctx.fillStyle = tg
  ctx.beginPath()
  ctx.moveTo(cx - 5, baseY)
  ctx.lineTo(cx - 1.2, baseY - th)
  ctx.lineTo(cx + 1.2, baseY - th)
  ctx.lineTo(cx + 5, baseY)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, baseY - th, 3, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(220,240,255,0.95)"
  ctx.fill()

  // 环绕轨道粒子
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2
    const dist = rx * (0.85 + rnd() * 0.5)
    const px = cx + Math.cos(a) * dist
    const py = baseY + Math.sin(a) * dist * (ry / rx)
    ctx.beginPath()
    ctx.arc(px, py - rnd() * H * 0.12, rnd() * 1.6 + 0.4, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(170,215,255,${0.25 + rnd() * 0.5})`
    ctx.fill()
  }
}
