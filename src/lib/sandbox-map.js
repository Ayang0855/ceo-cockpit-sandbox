// ============================================================
// 公司沙盘 · 程序化地图渲染（原创绘制）
// 世界坐标：1000 x 700，相机支持平移缩放
// ============================================================

export const WORLD = { w: 1000, h: 700 }

export function w2s(wx, wy, cam, vw, vh) {
  return [
    (wx - cam.cx) * cam.scale + vw / 2,
    (wy - cam.cy) * cam.scale + vh / 2,
  ]
}

function hexTile(ctx, x, y, r, depth = 10, top = "rgba(235,241,248,0.75)", side = "rgba(150,165,190,0.55)", line = "rgba(120,140,170,0.5)") {
  // 等距六边形平台
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r * 0.5
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = top
  ctx.fill()
  ctx.strokeStyle = line
  ctx.lineWidth = 1
  ctx.stroke()

  // 侧壁
  ctx.beginPath()
  const a0 = (Math.PI / 3) * 1 + Math.PI / 6
  const a1 = (Math.PI / 3) * 2 + Math.PI / 6
  const a2 = (Math.PI / 3) * 3 + Math.PI / 6
  const a3 = (Math.PI / 3) * 4 + Math.PI / 6
  ctx.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r * 0.5)
  ctx.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r * 0.5)
  ctx.lineTo(x + Math.cos(a2) * r, y + Math.sin(a2) * r * 0.5)
  ctx.lineTo(x + Math.cos(a3) * r, y + Math.sin(a3) * r * 0.5)
  for (let i = 3; i >= 0; i--) {
    const a = (Math.PI / 3) * i + Math.PI / 6
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5 + depth)
  }
  ctx.closePath()
  ctx.fillStyle = side
  ctx.fill()
}

// 各类建筑
function drawBuilding(ctx, kind, x, y, r, t, glow) {
  ctx.save()
  ctx.shadowColor = glow
  ctx.shadowBlur = 14
  const P = (dx, dy) => [x + dx, y + dy]
  if (kind === "core") {
    // 能量环阵
    for (let i = 3; i >= 1; i--) {
      ctx.beginPath()
      ctx.ellipse(x, y - 6, r * 0.34 * i, r * 0.17 * i, 0, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(70,120,240,${0.24 * i})`
      ctx.lineWidth = 2.2 - i * 0.5
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.ellipse(x, y - 26 - Math.sin(t / 600) * 3, r * 0.12, r * 0.12, 0, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(90,140,255,0.85)"
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x, y - 22)
    ctx.lineTo(x, y - 6)
    ctx.strokeStyle = "rgba(90,140,255,0.6)"
    ctx.lineWidth = 2
    ctx.stroke()
  } else if (kind === "tower") {
    ctx.fillStyle = "rgba(96,116,150,0.9)"
    ctx.fillRect(x - r * 0.12, y - r * 0.95, r * 0.24, r * 0.95)
    ctx.beginPath()
    ctx.moveTo(x - r * 0.2, y - r * 0.95)
    ctx.lineTo(x, y - r * 1.3)
    ctx.lineTo(x + r * 0.2, y - r * 0.95)
    ctx.closePath()
    ctx.fillStyle = "rgba(130,150,185,0.9)"
    ctx.fill()
  } else if (kind === "mine") {
    for (let i = 0; i < 4; i++) {
      const ox = (i - 1.5) * r * 0.34
      const h = r * (0.4 + (i % 2) * 0.22)
      ctx.fillStyle = i % 2 ? "rgba(150,130,70,0.85)" : "rgba(170,150,90,0.8)"
      ctx.fillRect(x + ox - r * 0.11, y - h, r * 0.22, h)
    }
  } else if (kind === "forge") {
    ctx.fillStyle = "rgba(90,110,145,0.88)"
    ctx.fillRect(x - r * 0.4, y - r * 0.42, r * 0.8, r * 0.42)
    ctx.fillStyle = "rgba(60,80,115,0.9)"
    ctx.fillRect(x - r * 0.24, y - r * 0.75, r * 0.48, r * 0.36)
    // 烟囱光点
    ctx.beginPath()
    ctx.arc(x + r * 0.3, y - r * 0.8 + Math.sin(t / 300) * 2, 2.4, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(217,110,72,0.9)"
    ctx.fill()
  } else if (kind === "farm") {
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * r * 0.36
      ctx.beginPath()
      ctx.ellipse(x + ox, y - 4, r * 0.22, r * 0.1, 0, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(120,170,130,0.7)"
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(x + ox, y - 6)
      ctx.lineTo(x + ox, y - r * 0.5)
      ctx.strokeStyle = "rgba(110,150,120,0.85)"
      ctx.lineWidth = 1.6
      ctx.stroke()
    }
  } else if (kind === "ammo") {
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * r * 0.3
      ctx.fillStyle = "rgba(150,120,60,0.85)"
      ctx.beginPath()
      ctx.moveTo(x + ox - r * 0.12, y)
      ctx.lineTo(x + ox - r * 0.12, y - r * 0.5)
      ctx.arc(x + ox, y - r * 0.5, r * 0.12, Math.PI, 0)
      ctx.lineTo(x + ox + r * 0.12, y)
      ctx.closePath()
      ctx.fill()
    }
  } else if (kind === "camp") {
    ctx.beginPath()
    ctx.moveTo(x - r * 0.45, y)
    ctx.lineTo(x, y - r * 0.6)
    ctx.lineTo(x + r * 0.45, y)
    ctx.closePath()
    ctx.fillStyle = "rgba(110,140,170,0.85)"
    ctx.fill()
    ctx.fillStyle = "rgba(220,232,245,0.7)"
    ctx.fillRect(x - r * 0.07, y - r * 0.3, r * 0.14, r * 0.3)
  } else {
    ctx.fillStyle = "rgba(130,145,170,0.85)"
    ctx.fillRect(x - r * 0.3, y - r * 0.4, r * 0.6, r * 0.4)
  }
  ctx.restore()
}

const FLOW_COLORS = {
  lead: { c: "rgba(126,99,188,0.85)", glow: "rgba(126,99,188,0.5)" },
  contract: { c: "rgba(63,185,199,0.85)", glow: "rgba(63,185,199,0.5)" },
  cash: { c: "rgba(197,162,39,0.9)", glow: "rgba(197,162,39,0.5)" },
  ammo: { c: "rgba(196,78,92,0.85)", glow: "rgba(196,78,92,0.5)" },
}

export function drawSandbox(ctx, vw, vh, cam, units, flows, t, selectedId, hoverId) {
  ctx.clearRect(0, 0, vw, vh)

  // 地表柔光斑
  const patches = [
    [0.2, 0.42, 0.34, "rgba(196,164,96,0.22)"],
    [0.5, 0.55, 0.4, "rgba(110,150,215,0.22)"],
    [0.75, 0.45, 0.3, "rgba(96,180,192,0.18)"],
    [0.6, 0.2, 0.26, "rgba(130,112,185,0.18)"],
    [0.35, 0.78, 0.26, "rgba(175,145,80,0.18)"],
  ]
  patches.forEach(([px, py, pr, col]) => {
    const [sx, sy] = w2s(px * WORLD.w, py * WORLD.h, cam, vw, vh)
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr * WORLD.w * cam.scale)
    g.addColorStop(0, col)
    g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, vw, vh)
  })

  // 地面网格
  ctx.strokeStyle = "rgba(110,130,160,0.1)"
  ctx.lineWidth = 1
  const step = 60
  const tl = w2s(0, 0, cam, vw, vh)
  const br = w2s(WORLD.w, WORLD.h, cam, vw, vh)
  for (let gx = Math.floor(tl[0] / step) * step; gx < br[0]; gx += step) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, vh); ctx.stroke()
  }
  for (let gy = Math.floor(tl[1] / step) * step; gy < br[1]; gy += step) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(vw, gy); ctx.stroke()
  }

  // 世界边界
  ctx.strokeStyle = "rgba(27,61,228,0.14)"
  ctx.setLineDash([6, 6])
  ctx.strokeRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1])
  ctx.setLineDash([])

  const unitById = Object.fromEntries(units.map((u) => [u.unitId, u]))

  // 数据流（贝塞尔 + 流动虚线）
  flows.forEach((f, fi) => {
    const a = unitById[f.from]
    const b = unitById[f.to]
    if (!a || !b) return
    const [ax, ay] = w2s(a.x * WORLD.w, a.y * WORLD.h, cam, vw, vh)
    const [bx, by] = w2s(b.x * WORLD.w, b.y * WORLD.h, cam, vw, vh)
    const mx = (ax + bx) / 2
    const my = (ay + by) / 2 - 60
    const { c, glow } = FLOW_COLORS[f.kind]
    ctx.save()
    ctx.shadowColor = glow
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.quadraticCurveTo(mx, my, bx, by)
    ctx.strokeStyle = c
    ctx.lineWidth = 1.6
    ctx.setLineDash([10, 8])
    ctx.lineDashOffset = -((t / 26 + fi * 20) % 300)
    ctx.stroke()
    ctx.setLineDash([])
    // 流向箭头点
    const tt = ((t / 1600 + fi * 0.27) % 1)
    const qx = (1 - tt) * (1 - tt) * ax + 2 * (1 - tt) * tt * mx + tt * tt * bx
    const qy = (1 - tt) * (1 - tt) * ay + 2 * (1 - tt) * tt * my + tt * tt * by
    ctx.beginPath()
    ctx.arc(qx, qy, 3.2, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
    ctx.restore()
  })

  // 单位：六边形平台 + 建筑
  units.forEach((u) => {
    const [sx, sy] = w2s(u.x * WORLD.w, u.y * WORLD.h, cam, vw, vh)
    const r = 46 * u.scale * cam.scale
    if (sx < -r * 2 || sx > vw + r * 2 || sy < -r * 2 || sy > vh + r * 2) return

    const hue = u.kind === "core" ? "rgba(70,120,240," : u.kind === "mine" ? "rgba(190,160,80," : u.kind === "farm" ? "rgba(120,170,140," : u.kind === "ammo" ? "rgba(190,110,100," : "rgba(110,135,170,"
    hexTile(ctx, sx, sy, r * 1.35, Math.max(6, 12 * cam.scale),
      u.online ? `${hue}0.88)` : "rgba(196,203,214,0.85)",
      u.online ? `${hue}0.6)` : "rgba(158,166,178,0.7)",
      u.online ? `${hue}0.95)` : "rgba(140,148,160,0.85)")

    if (u.online) drawBuilding(ctx, u.kind, sx, sy, r, t, `${hue}0.5)`)
    else {
      ctx.fillStyle = "rgba(140,148,160,0.7)"
      ctx.beginPath()
      ctx.arc(sx, sy - r * 0.2, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    // 选中/悬停光环
    if (u.unitId === selectedId || u.unitId === hoverId) {
      ctx.beginPath()
      ctx.ellipse(sx, sy, r * 1.5, r * 0.75, 0, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(27,61,228,0.7)"
      ctx.lineWidth = 1.6
      ctx.setLineDash([7, 5])
      ctx.lineDashOffset = -(t / 40) % 200
      ctx.stroke()
      ctx.setLineDash([])
    }
  })
}

// 小地图
export function drawMinimap(canvas, units, cam, vw, vh) {
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || 150
  const h = canvas.clientHeight || 92
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext("2d")
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = "rgba(235,240,247,0.65)"
  ctx.fillRect(0, 0, w, h)
  const k = Math.min(w / WORLD.w, h / WORLD.h)
  const ox = (w - WORLD.w * k) / 2
  const oy = (h - WORLD.h * k) / 2
  units.forEach((u) => {
    ctx.beginPath()
    ctx.arc(ox + u.x * WORLD.w * k, oy + u.y * WORLD.h * k, u.kind === "core" ? 3.4 : 2.2, 0, Math.PI * 2)
    ctx.fillStyle = u.online ? "rgba(27,61,228,0.8)" : "rgba(140,148,160,0.7)"
    ctx.fill()
  })
  // 视口框
  const halfW = vw / 2 / cam.scale, halfH = vh / 2 / cam.scale
  ctx.strokeStyle = "rgba(27,61,228,0.75)"
  ctx.lineWidth = 1.2
  ctx.strokeRect(ox + (cam.cx - halfW) * k, oy + (cam.cy - halfH) * k, halfW * 2 * k, halfH * 2 * k)
}
