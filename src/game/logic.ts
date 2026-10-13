export type Phase = "title" | "play" | "paused" | "debrief";
export type EndReason = "cave" | "cold" | "fall" | "sick";
export type SurfKind = "ice" | "rock" | "void";
export type VictimState = "waiting" | "saved" | "lost";

export type Victim = {
  id: string;
  name: string;
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  state: VictimState;
  line: string;
};

export type Glow = { x: number; y: number; t: number };
export type Chip = { x: number; y: number; vx: number; vy: number; life: number };

export type Best = { saved: number; time: number; reached: boolean };

export type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grip: number;
  stamina: number;
  falling: boolean;
  lamp: number;
  anchorX: number;
  anchorY: number;
  facing: number;
  health: number;
  ams: number;
  o2: number;
  dex: number;
  o2Left: number;
};

export type World = {
  phase: Phase;
  time: number;
  previewT: number;
  storm: number;
  player: Player;
  victims: Victim[];
  glows: Glow[];
  chips: Chip[];
  shake: number;
  radio: string;
  radioT: number;
  banner: string;
  bannerT: number;
  zone: string;
  zoneSeen: string;
  reason: EndReason | null;
  plantLatch: boolean;
  best: Best | null;
  nearId: string | null;
  radioCd: number;
  radioLatch: boolean;
  o2Latch: boolean;
  dexLatch: boolean;
};

export type Input = { ax: number; ay: number; plant: boolean; radio: boolean; o2: boolean; dex: boolean };

export type SimEvent = "plant" | "clip" | "fall" | "catch" | "lost" | "cave" | "cold" | "sick" | "radio" | "o2" | "dex";

export const START_Y = 7900;
export const GOAL_Y = 8520;
export const LINK_REACH = 4.25;

const BEST_KEY = "whiteout-k2";

type Corridor = { cx: number; half: number; kind: "ice" | "rock" };

export function corridorsAt(y: number): Corridor[] {
  if (y >= 8156 && y < 8196) {
    return [{ cx: 0.35, half: 4.35, kind: "rock" }];
  }
  if (y >= 8196 && y < 8298) {
    return [
      { cx: -3.15, half: 1.38, kind: "ice" },
      { cx: 3.15, half: 2.05, kind: "rock" },
    ];
  }
  if (y >= 8298 && y < 8352) {
    return [{ cx: -0.4, half: 4.7, kind: "rock" }];
  }
  const t = y - START_Y;
  const cx = Math.sin(t * 0.028) * 1.55 + Math.sin(t * 0.011 + 0.7) * 0.85;
  const rock = (y >= 8048 && y < 8148) || (y >= 8388 && y < 8468);
  return [{ cx, half: 2.28, kind: rock ? "rock" : "ice" }];
}

export function surfaceAt(x: number, y: number): { on: boolean; kind: SurfKind; cx: number } {
  const cs = corridorsAt(y);
  let best = cs[0];
  let bestD = Infinity;
  for (const c of cs) {
    const d = Math.abs(x - c.cx);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (bestD <= best.half) return { on: true, kind: best.kind, cx: best.cx };
  return { on: false, kind: "void", cx: best.cx };
}

export function zoneName(y: number): string {
  if (y < 8028) return "The Flake";
  if (y < 8172) return "Ice Band";
  if (y < 8312) return "Whiteout Choice";
  if (y < 8455) return "The Shoulder";
  return "Cave Traverse";
}

export function angNorm(a: number): number {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

function approachAngle(from: number, to: number, maxStep: number): number {
  const d = angNorm(to - from);
  if (Math.abs(d) <= maxStep) return angNorm(to);
  return angNorm(from + Math.sign(d) * maxStep);
}

export function lampRange(storm: number, bracing: boolean): number {
  const r = 5.05 - storm * 2.15;
  return Math.max(2.55, bracing ? r * 0.75 : r);
}

export function lampHalf(bracing: boolean): number {
  return bracing ? 0.3 : 0.52;
}

export function inCone(
  px: number,
  py: number,
  angle: number,
  x: number,
  y: number,
  range: number,
  half: number,
): boolean {
  const dx = x - px;
  const dy = y - py;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.08 || dist > range) return false;
  return Math.abs(angNorm(Math.atan2(dx, dy) - angle)) <= half;
}

function loadBest(): Best | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Best>;
    if (typeof p.saved !== "number" || typeof p.time !== "number") return null;
    return { saved: p.saved, time: p.time, reached: Boolean(p.reached) };
  } catch {
    return null;
  }
}

function saveBest(b: Best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    /* private mode */
  }
}

const ROSTER: { id: string; name: string; y: number; timer: number; line: string; fork: "left" | "main" }[] = [
  { id: "anika", name: "Anika Voss", y: 7956, timer: 40, line: "Anika, low on the flake. She is still answering.", fork: "main" },
  { id: "leo", name: "Leo Park", y: 8096, timer: 98, line: "Leo is under the ice band. His lamp is a blink.", fork: "main" },
  { id: "sera", name: "Sera Qureshi", y: 8246, timer: 168, line: "Sera is on the left ice. The right rock forgives. She does not.", fork: "left" },
  { id: "jonah", name: "Jonah Hale", y: 8396, timer: 228, line: "Jonah, on the shoulder. His hands are done.", fork: "main" },
  { id: "mira", name: "Mira Okonkwo", y: 8488, timer: 278, line: "Mira is at the cave mouth. Last light on the ridge.", fork: "main" },
];

function makeVictims(): Victim[] {
  return ROSTER.map((s) => {
    const cs = corridorsAt(s.y);
    const c = s.fork === "left" ? (cs.find((k) => k.cx < 0) ?? cs[0]) : cs[0];
    const x = c.cx + (s.id === "leo" ? 0.45 : 0);
    return {
      id: s.id,
      name: s.name,
      x,
      y: s.y,
      timer: s.timer,
      maxTimer: s.timer,
      state: "waiting",
      line: s.line,
    };
  });
}

function paint(w: World, x: number, y: number) {
  const s = surfaceAt(x, y);
  if (!s.on) return;
  for (let i = w.glows.length - 1; i >= 0; i--) {
    const g = w.glows[i];
    if ((g.x - x) ** 2 + (g.y - y) ** 2 < 0.42 * 0.42) {
      g.t = w.time;
      g.x = x;
      g.y = y;
      return;
    }
  }
  w.glows.push({ x, y, t: w.time });
  if (w.glows.length > 72) w.glows.shift();
}

export function glowNear(w: World, x: number, y: number, fade: number, rad: number): boolean {
  const r2 = rad * rad;
  for (let i = w.glows.length - 1; i >= 0; i--) {
    const g = w.glows[i];
    if (w.time - g.t > fade) continue;
    if ((g.x - x) ** 2 + (g.y - y) ** 2 <= r2) return true;
  }
  return false;
}

function say(w: World, msg: string, seconds = 4.4) {
  w.radio = msg;
  w.radioT = seconds;
}

function burst(w: World, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.2 + Math.random() * 2.4;
    w.chips.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s + 0.6,
      life: 0.35 + Math.random() * 0.35,
    });
  }
  if (w.chips.length > 48) w.chips.splice(0, w.chips.length - 48);
}

export function createWorld(): World {
  const cs = corridorsAt(START_Y);
  const x = cs[0].cx;
  const w: World = {
    phase: "title",
    time: 0,
    previewT: 0,
    storm: 0.12,
    player: {
      x,
      y: START_Y,
      vx: 0,
      vy: 0,
      grip: 1,
      stamina: 100,
      falling: false,
      lamp: 0,
      anchorX: x,
      anchorY: START_Y,
      facing: 1,
      health: 100,
      ams: 0,
      o2: 3,
      dex: 2,
      o2Left: 0,
    },
    victims: makeVictims(),
    glows: [],
    chips: [],
    shake: 0,
    radio: "",
    radioT: 0,
    banner: "The Flake",
    bannerT: 0,
    zone: "The Flake",
    zoneSeen: "",
    reason: null,
    plantLatch: false,
    best: loadBest(),
    nearId: null,
    radioCd: 0,
    radioLatch: false,
    o2Latch: false,
    dexLatch: false,
  };
  for (let d = 0; d <= 3.2; d += 0.45) paint(w, x, START_Y + d);
  return w;
}

function endRun(w: World, reason: EndReason, events: SimEvent[]) {
  if (w.phase === "debrief") return;
  w.phase = "debrief";
  w.reason = reason;
  w.player.vx = 0;
  w.player.vy = 0;
  w.player.falling = false;
  const reached = reason === "cave";
  const saved = w.victims.filter((v) => v.state === "saved").length;
  const next: Best = { saved, time: w.time, reached };
  const prev = w.best;
  const better =
    !prev ||
    next.saved > prev.saved ||
    (next.saved === prev.saved && next.reached && !prev.reached) ||
    (next.saved === prev.saved && next.reached === prev.reached && next.time < prev.time);
  if (better) {
    w.best = next;
    saveBest(next);
  }
  events.push(reason === "cave" ? "cave" : reason === "sick" ? "sick" : reason === "cold" ? "cold" : "fall");
}

function feetFirm(w: World): boolean {
  const s = surfaceAt(w.player.x, w.player.y);
  if (!s.on) return false;
  const fade = s.kind === "rock" ? 1.2 : 0.6;
  return glowNear(w, w.player.x, w.player.y, fade, 0.9);
}

function baseReport(w: World): string {
  const storm = w.storm;
  const pct = Math.round(storm * 100);
  const wind =
    storm < 0.33
      ? "Wind is light."
      : storm < 0.66
        ? "Wind is stacking and the lamp is shortening."
        : "Whiteout. Only climb what you can see.";
  const waiting = w.victims.filter((v) => v.state === "waiting");
  const next = waiting
    .slice()
    .sort((a, b) => Math.abs(a.y - w.player.y) - Math.abs(b.y - w.player.y))[0];
  const side =
    next && Math.abs(next.x - w.player.x) > 1.15
      ? next.x > w.player.x
        ? " to your right"
        : " on the left"
      : "";
  const who = next
    ? ` ${next.name.split(" ")[0]} is ${Math.abs(Math.round(next.y - w.player.y))}m ${next.y >= w.player.y ? "above" : "below"}${side}.`
    : " Nobody is still waiting.";
  const body =
    w.player.ams > 48
      ? " You are altitude sick. Take Dex."
      : w.player.ams > 20
        ? " A headache is starting."
        : w.player.health < 55
          ? " Health is down. Use oxygen."
          : " You are holding.";
  return `Base. Storm ${pct}. ${wind}${who}${body}`;
}

function vitals(w: World, dt: number, bracing: boolean) {
  const p = w.player;
  if (p.o2Left > 0) {
    p.o2Left = Math.max(0, p.o2Left - dt);
    p.ams = Math.max(0, p.ams - dt * 0.45);
  }
  const alt = Math.min(1, Math.max(0, (p.y - START_Y) / (GOAL_Y - START_Y)));
  const shield = p.o2Left > 0 ? 0.28 : 1;
  const gain = (0.035 + alt * alt * 0.72 + w.storm * 0.16) * shield;
  p.ams = Math.min(100, p.ams + gain * dt);
  if (p.ams > 22) p.health -= dt * ((p.ams - 22) / 78) * 1.35 * shield;
  p.health -= dt * w.storm * 0.06 * shield;
  if (p.falling) p.health -= dt * 0.8;
  if (bracing && p.ams < 40) p.health += dt * 2.4;
  else if (!p.falling && p.grip > 0.8 && p.ams < 18) p.health += dt * 0.35;
  p.health = Math.max(0, Math.min(100, p.health));
  p.stamina = Math.max(0, Math.min(100, p.stamina));
}

export function step(w: World, dt: number, input: Input): SimEvent[] {
  const events: SimEvent[] = [];
  if (w.phase !== "play") return events;

  w.time += dt;
  w.storm = Math.min(1, 0.1 + w.time / 236 + ((w.player.y - START_Y) / (GOAL_Y - START_Y)) * 0.5);
  w.shake = Math.max(0, w.shake - dt * 1.8);
  w.radioT = Math.max(0, w.radioT - dt);
  w.bannerT = Math.max(0, w.bannerT - dt);

  const p = w.player;
  const edge = input.plant && !w.plantLatch;
  w.plantLatch = input.plant;
  const radioEdge = input.radio && !w.radioLatch;
  const o2Edge = input.o2 && !w.o2Latch;
  const dexEdge = input.dex && !w.dexLatch;
  w.radioLatch = input.radio;
  w.o2Latch = input.o2;
  w.dexLatch = input.dex;
  const bracing = input.plant && !p.falling;

  if (w.radioCd > 0) w.radioCd = Math.max(0, w.radioCd - dt);
  if (radioEdge) {
    if (p.falling) say(w, "Base, stand by. I am off the wall.", 2.2);
    else if (w.radioCd > 0) say(w, "Base is still on the last call.", 1.8);
    else {
      w.radioCd = 14;
      say(w, baseReport(w), 6);
      events.push("radio");
    }
  }
  if (o2Edge && !p.falling) {
    if (p.o2 <= 0) say(w, "No oxygen left in the pack.", 2.2);
    else if (p.health > 92 && p.ams < 12) say(w, "Save the bottle. Lungs are clear.", 2.2);
    else {
      p.o2 -= 1;
      p.health = Math.min(100, p.health + 38);
      p.o2Left = 16;
      say(w, "Oxygen on. Breathe. The burn eases.", 3);
      events.push("o2");
    }
  }
  if (dexEdge && !p.falling) {
    if (p.dex <= 0) say(w, "No Dex left.", 2);
    else if (p.ams < 16) say(w, "No altitude sickness yet. Keep the Dex.", 2.4);
    else {
      p.dex -= 1;
      p.ams = Math.max(0, p.ams - 68);
      p.health = Math.min(100, p.health + 24);
      say(w, "Dex in. The headache is breaking.", 3.2);
      events.push("dex");
    }
  }

  const mag = Math.hypot(input.ax, input.ay);
  const targetLamp = mag > 0.14 ? Math.atan2(input.ax, input.ay) : 0;
  p.lamp = approachAngle(p.lamp, targetLamp, dt * 4.2);

  const range = lampRange(w.storm, bracing);
  const half = lampHalf(bracing);
  const samples = bracing ? 5 : 7;
  for (let i = 0; i < samples; i++) {
    const d = 0.35 + (range - 0.35) * (i / (samples - 1));
    const x = p.x + Math.sin(p.lamp) * d;
    const y = p.y + Math.cos(p.lamp) * d;
    if (inCone(p.x, p.y, p.lamp, x, y, range + 0.05, half)) paint(w, x, y);
  }
  if (Math.abs(angNorm(p.lamp)) < 0.62) paint(w, p.x, p.y);
  if (bracing) paint(w, p.x, p.y);

  w.glows = w.glows.filter((g) => w.time - g.t < 1.35);

  for (const v of w.victims) {
    if (v.state !== "waiting") continue;
    v.timer -= dt;
    if (v.timer <= 0) {
      v.timer = 0;
      v.state = "lost";
      say(w, `Base. We lost ${v.name}.`);
      events.push("lost");
    }
  }

  let near: Victim | null = null;
  let nearD = LINK_REACH;
  for (const v of w.victims) {
    if (v.state !== "waiting") continue;
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < nearD && !p.falling) {
      near = v;
      nearD = d;
    }
  }
  w.nearId = near?.id ?? null;

  if (edge && near) {
    near.state = "saved";
    say(w, `${near.name.split(" ")[0]} is linked. They are on your rope.`);
    burst(w, near.x, near.y, 10);
    events.push("clip");
  }

  const wind = Math.sin(w.time * 0.81) * (0.15 + w.storm * 1.05) + Math.sin(w.time * 0.23) * w.storm * 0.35;

  if (p.falling) {
    p.vy = -15.5;
    p.vx = (p.anchorX - p.x) * 0.35;
    p.x += (p.vx + wind * 0.35) * dt;
    p.y += p.vy * dt;
    p.stamina -= dt * 7;
    const here = surfaceAt(p.x, p.y);
    if (edge && here.on) {
      p.falling = false;
      p.grip = here.kind === "rock" || Math.abs(p.lamp) < 0.7 ? 0.72 : 0.42;
      p.vx = 0;
      p.vy = 0;
      p.anchorX = p.x;
      p.anchorY = p.y;
      p.stamina -= here.kind === "ice" && Math.abs(p.lamp) > 0.8 ? 12 : 6;
      p.health = Math.max(0, p.health - 8);
      w.shake = 0.85;
      burst(w, p.x, p.y, 8);
      say(w, "Axe in. You are back on the face.", 2.4);
      events.push("catch");
    } else if (p.y <= p.anchorY) {
      p.x = p.anchorX;
      p.y = p.anchorY;
      p.falling = false;
      p.vx = 0;
      p.vy = 0;
      p.grip = 0.48;
      p.stamina -= 16;
      p.health = Math.max(0, p.health - 14);
      w.shake = 1;
      burst(w, p.x, p.y, 12);
      say(w, "The rope caught. Breathe. Then climb.", 2.6);
      events.push("catch");
    }
  } else if (edge && near) {
    /* clipped this frame */
  } else if (bracing) {
    p.vx = 0;
    p.vy = 0;
    const here = surfaceAt(p.x, p.y);
    p.grip = Math.min(1, p.grip + dt * 1.5);
    p.stamina = Math.min(100, p.stamina + dt * (here.on ? 6.5 : 1.4));
    if (p.y > p.anchorY + 14 && p.grip > 0.66 && here.on) {
      p.anchorX = p.x;
      p.anchorY = p.y;
      burst(w, p.x, p.y, 6);
      events.push("plant");
    }
  } else {
    const moving = mag >= 0.2;
    let mx = 0;
    let my = 0;
    if (moving) {
      mx = input.ax / mag;
      my = input.ay / mag;
      if (mx < -0.2) p.facing = -1;
      else if (mx > 0.2) p.facing = 1;
    }
    const aheadX = p.x + mx * 0.85;
    const aheadY = p.y + my * 0.85;
    const aheadSurf = surfaceAt(aheadX, aheadY);
    const here = surfaceAt(p.x, p.y);
    const aheadLit =
      inCone(p.x, p.y, p.lamp, aheadX, aheadY, range, half + 0.05) ||
      glowNear(w, aheadX, aheadY, aheadSurf.kind === "rock" ? 1.15 : 0.62, 0.9);
    const firm = feetFirm(w);
    const carry = 1 - w.victims.filter((v) => v.state === "saved").length * 0.05;
    const hands = 0.28 + 0.72 * (p.stamina / 100);
    const sick = 1 - Math.min(0.4, (p.ams / 100) * 0.4);
    const base = 3.15 * carry * hands * sick;

    if (!here.on) {
      p.grip = Math.max(0, p.grip - dt * 1.35);
    } else if (!firm) {
      p.grip = Math.max(0, p.grip - dt * (here.kind === "rock" ? 0.42 : 1.2));
    } else if (moving && (!aheadSurf.on || !aheadLit)) {
      p.grip = Math.max(0, p.grip - dt * (aheadSurf.kind === "rock" ? 0.22 : 0.55));
    } else {
      p.grip = Math.min(1, p.grip + dt * 1.7);
    }

    const speed =
      !moving ? 0 : firm && aheadSurf.on && aheadLit ? base * (0.45 + 0.55 * p.grip) : base * 0.28 * p.grip;

    p.vx = mx * speed;
    p.vy = my * speed;
    const windCut = 1 - p.grip * 0.72;
    p.x += (p.vx + wind * windCut) * dt;
    p.y += p.vy * dt;
    if (here.on && here.kind === "ice" && !firm) {
      p.y -= dt * (0.15 + (1 - p.grip) * 0.55);
    }

    if (moving && firm && aheadLit) p.stamina -= dt * 0.46;
    else if (moving) p.stamina -= dt * 1.35;
    else p.stamina -= dt * (firm ? 0.08 : 0.4);

    if (p.grip <= 0.04 && !firm) {
      p.falling = true;
      p.grip = 0;
      w.shake = 0.45;
      events.push("fall");
    }

    if (!p.falling && here.on && p.grip > 0.72 && p.y > p.anchorY + 15 && firm) {
      p.anchorX = p.x;
      p.anchorY = p.y;
      events.push("plant");
    }
  }

  if (p.y < START_Y - 12) {
    endRun(w, "fall", events);
    return events;
  }
  vitals(w, dt, bracing);
  if (p.health <= 0) {
    p.health = 0;
    endRun(w, p.ams > 30 ? "sick" : "cold", events);
    return events;
  }
  if (p.y >= GOAL_Y && !p.falling) {
    endRun(w, "cave", events);
    return events;
  }

  const zone = zoneName(p.y);
  if (zone !== w.zone) {
    w.zone = zone;
    w.banner = zone;
    w.bannerT = 2.6;
  }
  if (zone !== w.zoneSeen) {
    w.zoneSeen = zone;
    if (zone === "Ice Band") say(w, "Ice band. Sweep, then commit. Dark ice is air.");
    else if (zone === "Whiteout Choice")
      say(w, "Two lines. Left ice holds Sera. Right rock lets you search.");
    else if (zone === "The Shoulder") say(w, "Shoulder. The cave is the notch above you.");
    else if (zone === "Cave Traverse") say(w, "Cave mouth. Get whoever is on you inside.");
  }

  for (const c of w.chips) {
    c.life -= dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vy -= dt * 3;
  }
  w.chips = w.chips.filter((c) => c.life > 0);

  return events;
}

export function savedCount(w: World): number {
  return w.victims.filter((v) => v.state === "saved").length;
}

export function lostCount(w: World): number {
  return w.victims.filter((v) => v.state === "lost").length;
}
