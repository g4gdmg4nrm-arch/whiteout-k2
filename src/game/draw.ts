import {
  GOAL_Y,
  LINK_REACH,
  START_Y,
  corridorsAt,
  glowNear,
  inCone,
  lampHalf,
  lampRange,
  type World,
} from "@/game/logic";

export type ArtKit = {
  peaks: HTMLImageElement | null;
  rock: HTMLImageElement | null;
  ice: HTMLImageElement | null;
  snow: HTMLImageElement | null;
  climber: (HTMLImageElement | undefined)[];
  stranded: (HTMLImageElement | undefined)[];
};

type Cam = {
  x: number;
  top: number;
  viewH: number;
  scale: number;
  shakeX: number;
  shakeY: number;
};

type Flake = { x: number; y: number; z: number };

const flakes: Flake[] = Array.from({ length: 78 }, () => ({
  x: Math.random() * 30 - 15,
  y: START_Y + Math.random() * 40,
  z: 0.35 + Math.random() * 0.75,
}));

let litCanvas: HTMLCanvasElement | null = null;

function toScreen(x: number, y: number, cam: Cam, width: number) {
  return {
    sx: (x - cam.x) * cam.scale + width / 2 + cam.shakeX,
    sy: (cam.top - y) * cam.scale + cam.shakeY,
  };
}

function plateFor(art: ArtKit, y: number, kind: "ice" | "rock"): HTMLImageElement | null {
  if (kind === "rock") return art.rock ?? art.ice ?? art.snow;
  if (y > 8420) return art.snow ?? art.ice;
  if (y > 8088) return art.ice ?? art.rock;
  return art.rock ?? art.ice;
}

function traceStrip(
  ctx: CanvasRenderingContext2D,
  which: 0 | 1,
  cam: Cam,
  width: number,
  height: number,
) {
  const left: { sx: number; sy: number }[] = [];
  const right: { sx: number; sy: number }[] = [];
  const top = cam.top + 1;
  const bot = cam.top - cam.viewH - 1;
  for (let y = top; y >= bot; y -= 0.38) {
    const cs = corridorsAt(y);
    if (which === 1 && cs.length < 2) continue;
    const c = cs[Math.min(which, cs.length - 1)];
    const pad = 1.25;
    left.push(toScreen(c.cx - c.half - pad, y, cam, width));
    right.push(toScreen(c.cx + c.half + pad, y, cam, width));
  }
  if (left.length < 2) return false;
  ctx.beginPath();
  ctx.moveTo(left[0].sx, left[0].sy);
  for (const p of left) ctx.lineTo(p.sx, p.sy);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].sx, right[i].sy);
  ctx.closePath();
  return true;
}

function paintStrip(
  ctx: CanvasRenderingContext2D,
  which: 0 | 1,
  art: ArtKit,
  cam: Cam,
  width: number,
  height: number,
) {
  ctx.save();
  if (!traceStrip(ctx, which, cam, width, height)) {
    ctx.restore();
    return;
  }
  ctx.clip();
  const tileH = 6.2;
  const y0 = Math.floor((cam.top - cam.viewH - 8) / tileH) * tileH;
  const y1 = cam.top + tileH;
  for (let wy = y0; wy < y1; wy += tileH) {
    const mid = wy + tileH * 0.5;
    const cs = corridorsAt(mid);
    if (which === 1 && cs.length < 2) continue;
    const c = cs[Math.min(which, cs.length - 1)];
    const img = plateFor(art, mid, c.kind);
    const xL = c.cx - c.half - 2;
    const xR = c.cx + c.half + 2;
    if (!img) {
      ctx.fillStyle = c.kind === "ice" ? "#6f93a8" : "#4e5966";
      const a = toScreen(xL, wy + tileH, cam, width);
      const b = toScreen(xR, wy, cam, width);
      ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
      continue;
    }
    const tileW = tileH * (img.width / img.height);
    const startX = Math.floor((xL - 2) / tileW) * tileW;
    for (let wx = startX; wx < xR + tileW; wx += tileW) {
      const a = toScreen(wx, wy + tileH, cam, width);
      ctx.drawImage(img, a.sx, a.sy, tileW * cam.scale, tileH * cam.scale);
    }
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(159,208,232,0.34)";
  ctx.stroke();
  ctx.restore();
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  art: ArtKit,
  cam: Cam,
  width: number,
  height: number,
) {
  paintStrip(ctx, 0, art, cam, width, height);
  paintStrip(ctx, 1, art, cam, width, height);
}

function lampMask(
  ctx: CanvasRenderingContext2D,
  w: World,
  light: { x: number; y: number; angle: number; bracing: boolean },
  cam: Cam,
  width: number,
  height: number,
) {
  const range = lampRange(w.phase === "play" ? w.storm : 0.2, light.bracing);
  const half = lampHalf(light.bracing);
  const p = toScreen(light.x, light.y, cam, width);
  const radius = range * cam.scale;
  const ang = light.angle - Math.PI / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p.sx, p.sy);
  ctx.arc(p.sx, p.sy, radius, ang - half, ang + half);
  ctx.closePath();
  ctx.clip();
  const g = ctx.createRadialGradient(p.sx, p.sy, radius * 0.04, p.sx, p.sy, radius);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.92)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const boot = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, cam.scale * 1.15);
  boot.addColorStop(0, "rgba(255,255,255,0.55)");
  boot.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = boot;
  ctx.beginPath();
  ctx.arc(p.sx, p.sy, cam.scale * 1.15, 0, Math.PI * 2);
  ctx.fill();

  for (const glow of w.glows) {
    const age = w.time - glow.t;
    const fade = 0.7;
    if (age > fade) continue;
    const s = toScreen(glow.x, glow.y, cam, width);
    const rr = cam.scale * 0.85;
    const a = (1 - age / fade) * 0.55;
    const gg = ctx.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, rr);
    gg.addColorStop(0, `rgba(255,255,255,${a})`);
    gg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(s.sx, s.sy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  cam: Cam,
  width: number,
  flip: number,
  alpha: number,
) {
  if (!img) return;
  const p = toScreen(x, y, cam, width);
  const dh = 2.35 * cam.scale;
  const dw = dh * (img.width / img.height);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.sx, p.sy);
  ctx.scale(flip, 1);
  ctx.drawImage(img, -dw / 2, -dh + cam.scale * 0.08, dw, dh);
  ctx.restore();
}

function heroIndex(w: World, moving: boolean): number {
  if (w.player.falling) return 0;
  if (w.plantLatch && !w.player.falling) return 3;
  if (!moving) return 3;
  return Math.floor(w.time * 7) % 3;
}

export function render(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  w: World,
  art: ArtKit,
  dt: number,
  reduce: boolean,
) {
  const viewH = 12.6;
  const scale = height / viewH;
  const demo = w.phase === "title";
  const demoY = START_Y + 14 + Math.sin(w.previewT * 0.45) * 7;
  const light = demo
    ? {
        x: corridorsAt(demoY)[0].cx,
        y: demoY,
        angle: Math.sin(w.previewT * 0.7) * 0.9,
        bracing: false,
      }
    : {
        x: w.player.x,
        y: w.player.y,
        angle: w.player.lamp + (w.player.ams > 40 ? Math.sin(w.time * 2.2) * 0.18 * (w.player.ams / 100) : 0),
        bracing: w.plantLatch && !w.player.falling,
      };
  const focusY = demo ? demoY : w.player.y;
  const focusX = demo ? light.x : w.player.x;
  const shake = reduce ? 0 : w.shake;
  const cam: Cam = {
    x: focusX,
    top: focusY + viewH * 0.6,
    viewH,
    scale,
    shakeX: Math.sin(w.time * 46) * shake * 7,
    shakeY: Math.cos(w.time * 37) * shake * 4,
  };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#101820");
  sky.addColorStop(1, "#070b10");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  if (art.peaks) {
    const parallax = (focusY - START_Y) * scale * 0.04;
    const pw = width * 1.35;
    const ph = pw * (art.peaks.height / art.peaks.width);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(art.peaks, (width - pw) / 2 - cam.x * scale * 0.15, height * 0.08 - parallax, pw, ph);
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.globalAlpha = 0.2;
  drawWalls(ctx, art, cam, width, height);
  ctx.restore();

  const bw = Math.floor(width * dpr);
  const bh = Math.floor(height * dpr);
  if (!litCanvas || litCanvas.width !== bw || litCanvas.height !== bh) {
    litCanvas = document.createElement("canvas");
    litCanvas.width = bw;
    litCanvas.height = bh;
  }
  const lctx = litCanvas.getContext("2d");
  if (lctx) {
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, width, height);
    lctx.imageSmoothingEnabled = true;
    drawWalls(lctx, art, cam, width, height);
    lctx.globalCompositeOperation = "destination-in";
    lampMask(lctx, w, light, cam, width, height);
    lctx.globalCompositeOperation = "source-over";
    ctx.drawImage(litCanvas, 0, 0, width, height);
  }

  const top = cam.top;
  const bot = cam.top - viewH;
  ctx.lineWidth = 2;
  for (let y = Math.ceil(bot); y < top; y += 7) {
    if (Math.abs(y - focusY) > 10 && !demo) continue;
    const cs = corridorsAt(y);
    for (const c of cs) {
      const lit = inCone(light.x, light.y, light.angle, c.cx, y, lampRange(w.storm, light.bracing), lampHalf(light.bracing));
      const p = toScreen(c.cx, y, cam, width);
      ctx.fillStyle = lit ? "rgba(246,196,83,0.85)" : "rgba(231,238,242,0.12)";
      ctx.fillRect(p.sx - 1, p.sy, 2, lit ? 11 : 7);
    }
  }

  if (!demo) {
    const saved = w.victims.filter((v) => v.state === "saved");
    const knots: { x: number; y: number }[] = [{ x: w.player.anchorX, y: w.player.anchorY }];
    saved.forEach((_, i) => {
      const t = (i + 1) / (saved.length + 1);
      knots.push({
        x: w.player.anchorX + (w.player.x - w.player.anchorX) * t,
        y: w.player.anchorY + (w.player.y - w.player.anchorY) * t - 0.15,
      });
    });
    knots.push({ x: w.player.x, y: w.player.y });
    ctx.strokeStyle = "rgba(231,238,242,0.7)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const first = toScreen(knots[0].x, knots[0].y, cam, width);
    ctx.moveTo(first.sx, first.sy);
    for (let i = 1; i < knots.length; i++) {
      const prev = toScreen(knots[i - 1].x, knots[i - 1].y, cam, width);
      const cur = toScreen(knots[i].x, knots[i].y, cam, width);
      ctx.quadraticCurveTo((prev.sx + cur.sx) / 2 + 8, (prev.sy + cur.sy) / 2, cur.sx, cur.sy);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(246,196,83,0.95)";
    ctx.beginPath();
    ctx.arc(first.sx, first.sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    const near = w.victims.find((v) => v.id === w.nearId && v.state === "waiting");
    if (near) {
      const n = toScreen(near.x, near.y, cam, width);
      const you = toScreen(w.player.x, w.player.y, cam, width);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(228,87,46,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(you.sx, you.sy);
      ctx.lineTo(n.sx, n.sy);
      ctx.stroke();
      ctx.restore();
    }
  }

  const range = lampRange(w.phase === "play" ? w.storm : 0.25, false);
  const half = lampHalf(false);
  for (const v of w.victims) {
    if (v.y < bot - 2 || v.y > top + 2) continue;
    if (v.state === "lost") {
      const p = toScreen(v.x, v.y, cam, width);
      ctx.strokeStyle = "rgba(142,160,173,0.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.sx - 5, p.sy - 5);
      ctx.lineTo(p.sx + 5, p.sy + 5);
      ctx.moveTo(p.sx + 5, p.sy - 5);
      ctx.lineTo(p.sx - 5, p.sy + 5);
      ctx.stroke();
      continue;
    }
    if (v.state === "saved") continue;
    const lit =
      inCone(light.x, light.y, light.angle, v.x, v.y, range + 0.3, half + 0.1) ||
      glowNear(w, v.x, v.y, 0.45, 1.1);
    const close = !demo && Math.hypot(v.x - w.player.x, v.y - w.player.y) < LINK_REACH;
    const frame = v.timer < 12 ? 1 : lit || close ? 2 : 0;
    drawSprite(ctx, art.stranded[frame], v.x, v.y, cam, width, 1, lit || close ? 1 : 0.28);
    const p = toScreen(v.x, v.y + 1.7, cam, width);
    ctx.fillStyle = v.timer < 15 ? "rgba(228,87,46,0.95)" : "rgba(246,196,83,0.95)";
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, lit ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (lit || close) {
      ctx.fillStyle = "#e7eef2";
      ctx.font = "600 13px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(v.name.split(" ")[0], p.sx, p.sy - 10);
      ctx.fillStyle = close ? "#e4572e" : "#f6c453";
      ctx.font = "500 11px Outfit, sans-serif";
      ctx.fillText(close ? `LINK · ${Math.ceil(v.timer)}s` : `${Math.ceil(v.timer)}s`, p.sx, p.sy - 24);
    }
  }

  if (!demo) {
    const saved = w.victims.filter((v) => v.state === "saved");
    saved.forEach((v, i) => {
      const y = w.player.y - (i + 1) * 1.28;
      const x = w.player.x * 0.82 + w.player.anchorX * 0.18;
      drawSprite(ctx, art.stranded[3], x, y, cam, width, w.player.facing, 1);
    });
    const moving = Math.hypot(w.player.vx, w.player.vy) > 0.3;
    if (!w.player.falling) {
      const boot = toScreen(w.player.x, w.player.y, cam, width);
      const g = w.player.grip;
      ctx.fillStyle = g > 0.55 ? "rgba(246,196,83,0.8)" : "rgba(228,87,46,0.9)";
      ctx.beginPath();
      ctx.ellipse(boot.sx, boot.sy + 3, 8 + (1 - g) * 6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawSprite(
      ctx,
      art.climber[heroIndex(w, moving)],
      w.player.x,
      w.player.y,
      cam,
      width,
      w.player.facing,
      1,
    );
  } else {
    const fi = Math.floor(w.previewT * 3) % 3;
    drawSprite(ctx, art.climber[fi], light.x, light.y, cam, width, light.angle > 0.25 ? 1 : -1, 1);
  }

  for (const c of w.chips) {
    const p = toScreen(c.x, c.y, cam, width);
    ctx.globalAlpha = Math.max(0, c.life * 2);
    ctx.fillStyle = "#e7eef2";
    ctx.fillRect(p.sx, p.sy, 2, 2);
    ctx.globalAlpha = 1;
  }

  const wind = Math.sin((w.time + w.previewT) * 0.8) * (0.4 + w.storm);
  if (!reduce) {
    for (const f of flakes) {
      f.y -= (1.4 + f.z * 2.4) * dt;
      f.x += wind * f.z * 2.2 * dt;
      if (f.y < bot - 1) {
        f.y = top + 1;
        f.x = cam.x + (Math.random() - 0.5) * (width / scale);
      }
      const p = toScreen(f.x, f.y, cam, width);
      ctx.globalAlpha = 0.25 + f.z * 0.55;
      ctx.fillStyle = "#e7eef2";
      ctx.fillRect(p.sx, p.sy, f.z > 0.7 ? 2.5 : 1.5, f.z > 0.7 ? 2.5 : 1.5);
    }
    ctx.globalAlpha = 1;
  }

  const lp = toScreen(light.x, light.y, cam, width);
  const beamRange = lampRange(w.phase === "play" ? w.storm : 0.25, light.bracing);
  const beamHalf = lampHalf(light.bracing);
  const beamAng = light.angle - Math.PI / 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  ctx.moveTo(lp.sx, lp.sy);
  ctx.arc(lp.sx, lp.sy, beamRange * scale, beamAng - beamHalf, beamAng + beamHalf);
  ctx.closePath();
  const warm = ctx.createRadialGradient(lp.sx, lp.sy, 0, lp.sx, lp.sy, beamRange * scale);
  warm.addColorStop(0, "rgba(246,196,83,0.30)");
  warm.addColorStop(0.42, "rgba(246,196,83,0.10)");
  warm.addColorStop(1, "rgba(246,196,83,0)");
  ctx.fillStyle = warm;
  ctx.fill();
  ctx.restore();

  const fogA = demo ? 0.28 : 0.22 + w.storm * 0.62;
  const fog = ctx.createRadialGradient(lp.sx, lp.sy, scale * 1.2, width / 2, height / 2, Math.max(width, height) * 0.68);
  fog.addColorStop(0, "rgba(198,208,214,0)");
  fog.addColorStop(1, `rgba(176,188,196,${fogA})`);
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, width, height);

  if (focusY < GOAL_Y && focusY > GOAL_Y - viewH) {
    const cave = toScreen(corridorsAt(GOAL_Y)[0].cx, GOAL_Y, cam, width);
    ctx.fillStyle = "rgba(12,20,28,0.78)";
    ctx.beginPath();
    ctx.ellipse(cave.sx, cave.sy, scale * 1.4, scale * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f6c453";
    ctx.font = "600 12px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CAVE", cave.sx, cave.sy - scale * 0.85);
  }

  if (!demo && w.player.o2Left > 0) {
    const you = toScreen(w.player.x, w.player.y, cam, width);
    ctx.strokeStyle = "rgba(159,208,232,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(you.sx, you.sy - scale * 0.9, scale * 1.15, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (!demo && w.player.ams > 18) {
    const sick = (w.player.ams - 18) / 82;
    const vig = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, height * 0.72);
    vig.addColorStop(0, "rgba(228,87,46,0)");
    vig.addColorStop(1, `rgba(120,28,18,${0.15 + sick * 0.45})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
  }
}
