import {
  GOAL_Y,
  LINK_REACH,
  START_Y,
  angNorm,
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
  focusY: number;
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

type RGB = [number, number, number];
type Span = {
  x0: number;
  x1: number;
  cx: number;
  half: number;
  kind: "ice" | "rock";
  slot: number;
};
type Light = { x: number; y: number; angle: number; bracing: boolean };

function hash2(a: number, b: number) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function perspAt(y: number, cam: Cam) {
  return 1 / (1 + (y - cam.focusY) * 0.02);
}

function toScreen(x: number, y: number, cam: Cam, width: number) {
  return {
    sx: (x - cam.x) * cam.scale * perspAt(y, cam) + width / 2 + cam.shakeX,
    sy: (cam.top - y) * cam.scale + cam.shakeY,
  };
}

function project(x: number, y: number, cam: Cam, width: number, parallax: number) {
  return toScreen(cam.x + (x - cam.x) * parallax, y, cam, width);
}

function clamp8(n: number) {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

function mixRGB(base: RGB, lit: RGB, moon: number, lamp: number) {
  const L = lamp < 0 ? 0 : lamp > 1 ? 1 : lamp;
  return `rgb(${clamp8(base[0] * moon + (lit[0] - base[0] * moon) * L)},${clamp8(base[1] * moon + (lit[1] - base[1] * moon) * L)},${clamp8(base[2] * moon + (lit[2] - base[2] * moon) * L)})`;
}

function spansAt(y: number, mode: "front" | "back", viewW: number): Span[] {
  const cs = [...corridorsAt(y)].sort((a, b) => a.cx - b.cx);
  const left = cs[0];
  const right = cs[cs.length - 1];
  if (mode === "back") {
    const reach = Math.max(12, viewW * 0.62);
    return [
      {
        x0: left.cx - left.half - reach,
        x1: left.cx - left.half - 1.65,
        cx: left.cx - 8,
        half: 0.2,
        kind: "rock",
        slot: 8,
      },
      {
        x0: right.cx + right.half + 1.65,
        x1: right.cx + right.half + reach,
        cx: right.cx + 8,
        half: 0.2,
        kind: "rock",
        slot: 9,
      },
    ];
  }
  return cs.map((c, slot) => ({
    x0: c.cx - c.half - 0.7,
    x1: c.cx + c.half + 0.7,
    cx: c.cx,
    half: c.half,
    kind: c.kind,
    slot,
  }));
}

function colCount(nSpans: number) {
  return nSpans === 1 ? 6 : 5;
}

function boundaryIndex(y: number) {
  return Math.floor(y / 1.15);
}

function boundaryY(i: number) {
  return i * 1.15 + (hash2(i * 1.7, 6.4) - 0.5) * 0.48;
}

function boundaryX(y: number, span: Span, edge: number, cols: number) {
  const u = edge / cols;
  let x = span.x0 + (span.x1 - span.x0) * u;
  if (edge > 0 && edge < cols) {
    x += (hash2(edge * 5.1 + span.slot * 17, Math.round(y * 8) * 0.13) - 0.5) * 0.34;
  }
  return x;
}

function exposure(w: World, light: Light, x: number, y: number) {
  const dx = x - light.x;
  const dy = y - light.y;
  const dist = Math.hypot(dx, dy);
  const range = lampRange(w.phase === "play" ? w.storm : 0.2, light.bracing) * 1.25;
  const half = lampHalf(light.bracing) * 1.4;
  let cone = 0;
  if (dist < range) {
    const ang = Math.abs(angNorm(Math.atan2(dx, dy) - light.angle));
    const a = Math.max(0, 1 - ang / half);
    const d = Math.max(0, 1 - dist / range);
    cone = a * a * d;
  }
  const pool = Math.max(0, 1 - dist / 1.15) * 0.26;
  const glow = glowNear(w, x, y, 1.15, 1.1) ? 0.34 : 0;
  return Math.min(1, cone + pool + glow);
}

function facetTint(kind: "ice" | "rock", n: number, y: number): { base: RGB; lit: RGB } {
  const snow = y > 8360 ? Math.min(1, (y - 8360) / 150) : 0;
  const bases: RGB[] =
    kind === "ice"
      ? [
          [78, 118, 138],
          [64, 104, 126],
          [96, 134, 150],
          [70, 112, 132],
        ]
      : [
          [112, 102, 92],
          [128, 112, 98],
          [96, 104, 112],
          [138, 122, 108],
        ];
  const base = bases[n % 4];
  const lit: RGB = kind === "ice" ? [198, 228, 236] : [222, 184, 142];
  if (snow <= 0) return { base, lit };
  const dust: RGB = [186, 196, 204];
  return {
    base: [
      base[0] + (dust[0] - base[0]) * snow * 0.62,
      base[1] + (dust[1] - base[1]) * snow * 0.62,
      base[2] + (dust[2] - base[2]) * snow * 0.62,
    ],
    lit: kind === "ice" ? [232, 240, 244] : [236, 226, 214],
  };
}

function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number, storm: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#06090e");
  sky.addColorStop(0.45, "#121b24");
  sky.addColorStop(1, "#070b10");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const moon = ctx.createRadialGradient(width * 0.18, height * 0.1, 0, width * 0.18, height * 0.1, width * 0.55);
  moon.addColorStop(0, `rgba(176, 198, 214, ${0.2 - storm * 0.08})`);
  moon.addColorStop(1, "rgba(176, 198, 214, 0)");
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#d7e4ec";
  for (let i = 0; i < 32; i++) {
    const a = 0.2 + hash2(i, 3) * 0.55;
    ctx.globalAlpha = a * (1 - storm * 0.65);
    ctx.fillRect(hash2(i, 1) * width, hash2(i, 2) * height * 0.55, hash2(i, 4) > 0.8 ? 2 : 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
}

function drawPeaks(ctx: CanvasRenderingContext2D, cam: Cam, width: number, height: number) {
  const ridge = height * 0.34;
  ctx.beginPath();
  ctx.moveTo(0, ridge + 30);
  const spec: [number, number][] = [
    [0.02, 0.35],
    [0.16, 0.72],
    [0.28, 0.4],
    [0.4, 0.86],
    [0.52, 0.48],
    [0.66, 0.78],
    [0.8, 0.36],
    [0.93, 0.58],
    [1.05, 0.22],
  ];
  for (const [u, h] of spec) {
    const x = u * width * 1.15 - cam.x * cam.scale * 0.05 - width * 0.08;
    ctx.lineTo(x, ridge - h * height * 0.26);
  }
  ctx.lineTo(width + 40, height + 10);
  ctx.lineTo(-40, height + 10);
  ctx.closePath();
  ctx.fillStyle = "#243140";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, ridge + 8);
  for (const [u, h] of spec) {
    const x = u * width * 1.15 - cam.x * cam.scale * 0.09 - width * 0.02;
    ctx.lineTo(x, ridge - h * height * 0.16 + 18);
  }
  ctx.lineTo(width + 20, ridge + 70);
  ctx.lineTo(-20, ridge + 70);
  ctx.closePath();
  ctx.fillStyle = "#314252";
  ctx.fill();

  ctx.fillStyle = "#d5e0e8";
  for (const [u, h] of spec) {
    if (h < 0.6) continue;
    const x = u * width * 1.15 - cam.x * cam.scale * 0.05 - width * 0.08;
    const peak = ridge - h * height * 0.26;
    ctx.beginPath();
    ctx.moveTo(x - 18, peak + 28);
    ctx.lineTo(x, peak + 2);
    ctx.lineTo(x + 16, peak + 26);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCliff(
  ctx: CanvasRenderingContext2D,
  w: World,
  light: Light,
  cam: Cam,
  width: number,
) {
  const viewW = width / cam.scale;
  const storm = w.phase === "play" ? w.storm : 0.35;
  const yBot = cam.top - cam.viewH - 1.4;
  const yTop = cam.top + 1.2;
  const i0 = boundaryIndex(yBot);
  const i1 = boundaryIndex(yTop) + 1;

  const paintLayer = (mode: "front" | "back") => {
    const parallax = mode === "back" ? 0.92 : 1;
    for (let i = i0; i <= i1; i++) {
      const y0 = boundaryY(i);
      const y1 = boundaryY(i + 1);
      const a = spansAt(y0, mode, viewW);
      const b = spansAt(y1, mode, viewW);
      const bands: { y0: number; y1: number; lo: Span; hi: Span }[] = [];
      if (a.length === b.length) {
        for (let s = 0; s < a.length; s++) bands.push({ y0, y1, lo: a[s], hi: b[s] });
      } else {
        const mid = (y0 + y1) / 2;
        for (const span of a) bands.push({ y0, y1: mid, lo: span, hi: span });
        for (const span of b) bands.push({ y0: mid, y1, lo: span, hi: span });
      }
      const cols = colCount(Math.max(a.length, b.length));
      for (const band of bands) {
        const y0 = band.y0;
        const y1 = band.y1;
        const { lo, hi } = band;
        if (lo.x1 - lo.x0 < 0.4 || hi.x1 - hi.x0 < 0.4) continue;

        const edge = (yy: number, span: Span, e: number) => boundaryX(yy, span, e, cols);
        const front = mode === "front";

        if (front) {
          for (const side of [-1, 1] as const) {
            const x0 = side < 0 ? edge(y0, lo, 0) : edge(y0, lo, cols);
            const x1 = side < 0 ? edge(y1, hi, 0) : edge(y1, hi, cols);
            const p0 = project(x0, y0, cam, width, 1);
            const p1 = project(x1, y1, cam, width, 1);
            const shove = side * Math.max(26, cam.scale * 0.46);
            const drop = Math.max(30, cam.scale * 0.52);
            ctx.beginPath();
            ctx.moveTo(p1.sx, p1.sy);
            ctx.lineTo(p0.sx, p0.sy);
            ctx.lineTo(p0.sx + shove, p0.sy + drop);
            ctx.lineTo(p1.sx + shove, p1.sy + drop);
            ctx.closePath();
            const sideMoon = (side < 0 ? 0.42 : 0.16) * (1 - storm * 0.25);
            ctx.fillStyle = mixRGB(lo.kind === "ice" ? [40, 58, 70] : [36, 32, 30], [70, 78, 86], sideMoon, 0);
            ctx.fill();
          }
        }

        type Col = { e: number; n: number; proud: number; x: number };
        const columns: Col[] = [];
        for (let e = 0; e < cols; ) {
          let n = 1;
          if (e < cols - 1 && hash2(e + 0.4, i + lo.slot * 3) > (lo.kind === "ice" ? 0.42 : 0.62)) n = 2;
          const x =
            (edge(y0, lo, e) + edge(y0, lo, e + n) + edge(y1, hi, e) + edge(y1, hi, e + n)) / 4;
          const inside = Math.abs(x - lo.cx) <= lo.half + 0.08;
          const proud = inside ? 0.9 + hash2(e + 2, i + lo.slot) * 0.35 : 0.34 + hash2(e, i * 0.3) * 0.2;
          columns.push({ e, n, proud, x });
          e += n;
        }
        columns.sort((p, q) => p.proud - q.proud);

        for (const col of columns) {
          const e = col.e;
          const n = col.n;
          const x00 = edge(y0, lo, e);
          const x01 = edge(y0, lo, e + n);
          const x10 = edge(y1, hi, e);
          const x11 = edge(y1, hi, e + n);
          const p00 = project(x00, y0, cam, width, parallax);
          const p01 = project(x01, y0, cam, width, parallax);
          const p10 = project(x10, y1, cam, width, parallax);
          const p11 = project(x11, y1, cam, width, parallax);
          const nx = (e + 0.5) / cols - 0.5;
          const moon =
            (0.78 - nx * 0.28 + Math.sin((y0 + y1) * 0.21) * 0.04) *
            (0.72 + col.proud * 0.34) *
            (mode === "back" ? 0.46 : 1) *
            (1 - storm * 0.2);
          const lamp =
            mode === "back" ? exposure(w, light, col.x, (y0 + y1) / 2) * 0.22 : exposure(w, light, col.x, (y0 + y1) / 2);
          const tint = facetTint(lo.kind, (e * 3 + i + lo.slot * 5) | 0, (y0 + y1) / 2);
          const stick = 0.45 + col.proud * (lo.kind === "ice" ? 0.55 : 0.9);
          const depth = (16 + cam.scale * 0.34) * stick * (mode === "back" ? 0.45 : 1);
          const ox = depth * 0.82;
          const oy = depth;

          ctx.beginPath();
          ctx.moveTo(p10.sx + ox * 0.65, p10.sy + oy);
          ctx.lineTo(p11.sx + ox * 0.65, p11.sy + oy);
          ctx.lineTo(p01.sx + ox * 0.35, p01.sy + oy * 0.45);
          ctx.lineTo(p00.sx + ox * 0.35, p00.sy + oy * 0.45);
          ctx.closePath();
          ctx.fillStyle = mixRGB(
            lo.kind === "ice" ? [16, 24, 32] : [14, 12, 12],
            [40, 36, 32],
            0.9,
            lamp * 0.25,
          );
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(p10.sx, p10.sy);
          ctx.lineTo(p11.sx, p11.sy);
          ctx.lineTo(p01.sx, p01.sy);
          ctx.lineTo(p00.sx, p00.sy);
          ctx.closePath();
          ctx.fillStyle = mixRGB(tint.base, tint.lit, moon, lamp);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(p10.sx, p10.sy);
          ctx.lineTo(p00.sx, p00.sy);
          ctx.strokeStyle = `rgba(236, 244, 248, ${0.05 + lamp * 0.16 + (nx < 0 ? 0.05 : 0)})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(p00.sx, p00.sy);
          ctx.lineTo(p01.sx, p01.sy);
          ctx.strokeStyle = `rgba(0, 0, 0, ${0.35 + (1 - lamp) * 0.2})`;
          ctx.lineWidth = 1.25;
          ctx.stroke();

          if (front && lo.kind === "ice") {
            ctx.beginPath();
            ctx.moveTo((p10.sx + p11.sx) / 2, p10.sy);
            ctx.lineTo((p00.sx + p01.sx) / 2, p00.sy);
            ctx.strokeStyle = `rgba(232, 246, 252, ${0.05 + lamp * 0.22})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          if (front && hash2(e + 1.2, i + lo.slot) > 0.72) {
            const crack = hash2(e, i * 2) > 0.5 ? 0.35 : -0.22;
            ctx.beginPath();
            ctx.moveTo(p10.sx + (p11.sx - p10.sx) * (0.35 + crack), p10.sy + 2);
            ctx.lineTo(p00.sx + (p01.sx - p00.sx) * (0.55 + crack), p00.sy - 2);
            ctx.strokeStyle = `rgba(6, 8, 12, ${0.45 + lamp * 0.25})`;
            ctx.lineWidth = 1.15;
            ctx.stroke();
          }

          const inside = Math.abs(col.x - lo.cx) <= lo.half;
          if (front && inside && hash2(e + 8, i + 3) > 0.62) {
            const hx = (x00 + x01 + x10 + x11) / 4;
            const hy = (y0 + y1) / 2 + (hash2(e, i) - 0.5) * 0.2;
            const hp = project(hx, hy, cam, width, 1);
            const holdLamp = exposure(w, light, hx, hy);
            const rw = cam.scale * (0.26 + hash2(e, i + 1) * 0.18) * perspAt(hy, cam);
            const rh = rw * 0.32;
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.beginPath();
            ctx.ellipse(hp.sx + 2, hp.sy + rh * 0.8, rw, rh * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = mixRGB(
              lo.kind === "ice" ? [150, 176, 188] : [150, 132, 112],
              lo.kind === "ice" ? [236, 246, 250] : [236, 206, 164],
              0.85,
              holdLamp,
            );
            ctx.beginPath();
            ctx.ellipse(hp.sx, hp.sy, rw, rh, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        const shelf =
          front && Math.abs(y1 - Math.round(y1 / 5.6) * 5.6) < y1 - y0 && hash2(i, lo.slot + 11) > 0.28;
        if (shelf) {
          const lx0 = Math.max(lo.x0, lo.cx - lo.half - 0.2);
          const lx1 = Math.min(lo.x1, lo.cx + lo.half + 0.2);
          const q0 = project(lx0, y1, cam, width, 1);
          const q1 = project(lx1, y1, cam, width, 1);
          const deep = Math.max(16, cam.scale * 0.36);
          const midY = y1 - 0.05;
          const lampShelf = exposure(w, light, (lx0 + lx1) / 2, midY);
          ctx.beginPath();
          ctx.moveTo(q0.sx, q0.sy);
          ctx.lineTo(q1.sx, q1.sy);
          ctx.lineTo(q1.sx + 4, q1.sy + deep);
          ctx.lineTo(q0.sx + 4, q0.sy + deep);
          ctx.closePath();
          const snowy = lo.kind === "ice" || y1 > 8340;
          ctx.fillStyle = mixRGB(
            snowy ? [168, 180, 188] : [120, 108, 96],
            snowy ? [244, 248, 250] : [232, 196, 150],
            0.9,
            lampShelf,
          );
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(q0.sx + 4, q0.sy + deep);
          ctx.lineTo(q1.sx + 4, q1.sy + deep);
          ctx.lineTo(q1.sx + 6, q1.sy + deep + cam.scale * 0.12);
          ctx.lineTo(q0.sx + 6, q0.sy + deep + cam.scale * 0.12);
          ctx.closePath();
          ctx.fillStyle = "rgba(0,0,0,0.38)";
          ctx.fill();
        }
      }
    }
  };

  paintLayer("back");
  paintLayer("front");

  ctx.save();
  ctx.globalAlpha = 0.55;
  for (let i = i0; i <= i1; i++) {
    const y0 = boundaryY(i);
    const y1 = boundaryY(i + 1);
    for (const span of spansAt((y0 + y1) / 2, "front", viewW)) {
      for (const side of [-1, 1] as const) {
        const j0 = (hash2(side * 3, y0) - 0.5) * 0.12;
        const j1 = (hash2(side * 5, y1) - 0.5) * 0.12;
        const p0 = toScreen(span.cx + side * span.half + j0, y0, cam, width);
        const p1 = toScreen(span.cx + side * span.half + j1, y1, cam, width);
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        ctx.strokeStyle = "rgba(4, 6, 8, 0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
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
  const dh = 2.35 * cam.scale * perspAt(y, cam);
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
  const viewH = 18.4;
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
    focusY,
    viewH,
    scale,
    shakeX: Math.sin(w.time * 46) * shake * 7,
    shakeY: Math.cos(w.time * 37) * shake * 4,
  };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;

  drawSky(ctx, width, height, demo ? 0.35 : w.storm);
  drawPeaks(ctx, cam, width, height);
  drawCliff(ctx, w, light, cam, width);

  const top = cam.top;
  const bot = cam.top - viewH;

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
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.ellipse(boot.sx + 5, boot.sy + 7, 16, 5.5, 0.15, 0, Math.PI * 2);
      ctx.fill();
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
  warm.addColorStop(0, "rgba(246,196,83,0.16)");
  warm.addColorStop(0.45, "rgba(246,196,83,0.05)");
  warm.addColorStop(1, "rgba(246,196,83,0)");
  ctx.fillStyle = warm;
  ctx.fill();
  ctx.restore();

  const fogA = demo ? 0.16 : 0.08 + w.storm * 0.28;
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
