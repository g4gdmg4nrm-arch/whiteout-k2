import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { render, type ArtKit } from "@/game/draw";
import {
  createWorld,
  lostCount,
  savedCount,
  step,
  type Input,
  type Phase,
  type World,
} from "@/game/logic";
import { createSound, type Sound } from "@/game/sound";

type Hud = {
  phase: Phase;
  y: number;
  stamina: number;
  health: number;
  ams: number;
  o2: number;
  dex: number;
  o2On: boolean;
  radioCd: number;
  storm: number;
  grip: number;
  saved: number;
  lost: number;
  zone: string;
  radio: string;
  radioOn: boolean;
  banner: string;
  bannerOn: boolean;
  falling: boolean;
  near: boolean;
  reason: World["reason"];
  time: number;
  best: World["best"];
  victims: { name: string; state: string; timer: number }[];
  next: { name: string; dy: number; dx: number } | null;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getX: () => number;
      getY: () => number;
      setKeys: (codes: string[]) => void;
    };
  }
}

function clock(t: number) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function snapshot(w: World): Hud {
  const waiting = w.victims.filter((v) => v.state === "waiting");
  const next = waiting
    .slice()
    .sort((a, b) => Math.abs(a.y - w.player.y) - Math.abs(b.y - w.player.y))[0];
  return {
    phase: w.phase,
    y: w.player.y,
    stamina: w.player.stamina,
    health: w.player.health,
    ams: w.player.ams,
    o2: w.player.o2,
    dex: w.player.dex,
    o2On: w.player.o2Left > 0,
    radioCd: w.radioCd,
    storm: w.storm,
    grip: w.player.grip,
    saved: savedCount(w),
    lost: lostCount(w),
    zone: w.zone,
    radio: w.radio,
    radioOn: w.radioT > 0,
    banner: w.banner,
    bannerOn: w.bannerT > 0,
    falling: w.player.falling,
    near: Boolean(w.nearId),
    reason: w.reason,
    time: w.time,
    best: w.best,
    victims: w.victims.map((v) => ({ name: v.name, state: v.state, timer: v.timer })),
    next: next
      ? { name: next.name, dy: next.y - w.player.y, dx: next.x - w.player.x }
      : null,
  };
}

function loadArt(): Promise<ArtKit> {
  const base = import.meta.env.BASE_URL;
  const files: Record<string, string> = {
    peaks: `${base}art/peaks.jpg`,
    rock: `${base}art/face-rock.jpg`,
    ice: `${base}art/face-ice.jpg`,
    snow: `${base}art/face-snow.jpg`,
    c1: `${base}art/climber-1.png`,
    c2: `${base}art/climber-2.png`,
    c3: `${base}art/climber-3.png`,
    c4: `${base}art/climber-4.png`,
    s1: `${base}art/stranded-1.png`,
    s2: `${base}art/stranded-2.png`,
    s3: `${base}art/stranded-3.png`,
    s4: `${base}art/stranded-4.png`,
  };
  const kit: ArtKit = {
    peaks: null,
    rock: null,
    ice: null,
    snow: null,
    climber: new Array(4),
    stranded: new Array(4),
  };
  const entries = Object.entries(files);
  return new Promise((resolve) => {
    let left = entries.length;
    const done = () => {
      left -= 1;
      if (left <= 0) resolve(kit);
    };
    const slot = (key: string) => {
      if (key.startsWith("c")) return { list: kit.climber, i: Number(key.slice(1)) - 1 };
      if (key.startsWith("s")) return { list: kit.stranded, i: Number(key.slice(1)) - 1 };
      return null;
    };
    for (const [key, src] of entries) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (key === "peaks") kit.peaks = img;
        else if (key === "rock") kit.rock = img;
        else if (key === "ice") kit.ice = img;
        else if (key === "snow") kit.snow = img;
        else {
          const at = slot(key);
          if (at) at.list[at.i] = img;
        }
        done();
      };
      img.onerror = () => done();
      img.src = src;
    }
  });
}

function headline(hud: Hud) {
  const saved = hud.saved;
  if (hud.reason === "cave" && saved === 5) return "The line held";
  if (hud.reason === "cave" && saved > 0) return "A partial line";
  if (hud.reason === "cave") return "You came back alone";
  if (hud.reason === "cold") return "The cold closed in";
  if (hud.reason === "sick") return "Altitude won";
  return "The face let go";
}

function debriefBody(hud: Hud) {
  const alt = `${Math.round(hud.y)} m`;
  if (hud.reason === "cave") {
    return `The snow cave took you in. ${hud.saved} of 5 linked. ${clock(hud.time)} on the face.`;
  }
  if (hud.reason === "cold") {
    return `The cold closed you down at ${alt}. ${hud.saved} were already linked.`;
  }
  if (hud.reason === "sick") {
    return `Altitude sickness took the climb at ${alt}. Dex and oxygen were the way through. ${hud.saved} were linked.`;
  }
  return `The rope link failed below the last anchor, near ${alt}. ${hud.saved} were on you.`;
}

export function ClimbGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const audioRef = useRef<Sound | null>(null);
  const artRef = useRef<ArtKit | null>(null);
  const keysRef = useRef(new Set<string>());
  const joyRef = useRef({ x: 0, y: 0 });
  const plantRef = useRef(false);
  const radioHeld = useRef(false);
  const o2Held = useRef(false);
  const dexHeld = useRef(false);
  const plantQueued = useRef(false);
  const radioQueued = useRef(false);
  const o2Queued = useRef(false);
  const dexQueued = useRef(false);
  const startLock = useRef(0);
  const stickId = useRef<number | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const world = createWorld();
    worldRef.current = world;
    const audio = createSound();
    audioRef.current = audio;
    const art: ArtKit = { peaks: null, rock: null, ice: null, snow: null, climber: [], stranded: [] };
    artRef.current = art;
    void loadArt().then((kit) => {
      art.peaks = kit.peaks;
      art.rock = kit.rock;
      art.ice = kit.ice;
      art.snow = kit.snow;
      art.climber = kit.climber;
      art.stranded = kit.stranded;
    });

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAt = 0;
    let lastPhase: Phase = world.phase;
    let alive = true;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      return { w, h, dpr };
    };
    let view = size();
    const onResize = () => {
      view = size();
    };
    window.addEventListener("resize", onResize);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      keysRef.current.add(e.code);
      if (e.code === "Escape" && worldRef.current?.phase === "play") {
        worldRef.current.phase = "paused";
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    const onBlur = () => {
      keysRef.current.clear();
      joyRef.current = { x: 0, y: 0 };
      plantRef.current = false;
      radioHeld.current = false;
      o2Held.current = false;
      dexHeld.current = false;
      plantQueued.current = false;
      radioQueued.current = false;
      o2Queued.current = false;
      dexQueued.current = false;
    };
    const onVis = () => {
      if (document.visibilityState === "visible") audio.unlock();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);

    const inputOf = (): Input => {
      const keys = keysRef.current;
      let ax = joyRef.current.x;
      let ay = joyRef.current.y;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) ax -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) ax += 1;
      if (keys.has("KeyW") || keys.has("ArrowUp")) ay += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) ay -= 1;
      ax = Math.max(-1, Math.min(1, ax));
      ay = Math.max(-1, Math.min(1, ay));
      const plant =
        plantRef.current ||
        plantQueued.current ||
        keys.has("Space") ||
        keys.has("ShiftLeft") ||
        keys.has("ShiftRight");
      const radio = radioHeld.current || radioQueued.current || keys.has("KeyR");
      const o2 = o2Held.current || o2Queued.current || keys.has("KeyQ");
      const dex = dexHeld.current || dexQueued.current || keys.has("KeyE");
      return { ax, ay, plant, radio, o2, dex };
    };

    window.__controlsTest = {
      getYaw: () => worldRef.current?.player.x ?? 0,
      getSpeed: () => {
        const p = worldRef.current?.player;
        return p ? Math.hypot(p.vx, p.vy) : 0;
      },
      getX: () => worldRef.current?.player.x ?? 0,
      getY: () => worldRef.current?.player.y ?? 0,
      setKeys: (codes: string[]) => {
        keysRef.current = new Set(codes);
      },
    };

    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = worldRef.current;
      if (!w) return;
      if (w.phase === "title") w.previewT += dt;
      if (w.phase === "play" && document.visibilityState === "visible") {
        acc += dt;
        const input = inputOf();
        plantQueued.current = false;
        radioQueued.current = false;
        o2Queued.current = false;
        dexQueued.current = false;
        while (acc >= 1 / 60) {
          const events = step(w, 1 / 60, input);
          for (const ev of events) audio.tick(ev);
          acc -= 1 / 60;
        }
        audio.setStorm(w.storm);
      } else {
        acc = 0;
      }
      render(ctx, view.w, view.h, view.dpr, w, art, dt, reduce);
      if (w.phase !== lastPhase || now - hudAt > 100) {
        lastPhase = w.phase;
        hudAt = now;
        setHud(snapshot(w));
      }
      raf = requestAnimationFrame(frame);
    };
    setHud(snapshot(world));
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      audio.close();
      delete window.__controlsTest;
    };
  }, []);

  function begin() {
    const now = performance.now();
    if (now - startLock.current < 450) return;
    startLock.current = now;
    audioRef.current?.unlock();
    const next = createWorld();
    next.phase = "play";
    next.radio = "Base. Five still above you. Light only the ice you mean to hold. Link them when you are close.";
    next.radioT = 5.6;
    next.banner = "The Flake";
    next.bannerT = 2.5;
    worldRef.current = next;
    keysRef.current.clear();
    joyRef.current = { x: 0, y: 0 };
    plantRef.current = false;
    radioHeld.current = false;
    o2Held.current = false;
    dexHeld.current = false;
    plantQueued.current = false;
    radioQueued.current = false;
    o2Queued.current = false;
    dexQueued.current = false;
    setKnob({ x: 0, y: 0 });
    setHud(snapshot(next));
  }

  function togglePause() {
    const w = worldRef.current;
    if (!w) return;
    if (w.phase === "play") w.phase = "paused";
    else if (w.phase === "paused") w.phase = "play";
    setHud(snapshot(w));
  }

  function moveStick(clientX: number, clientY: number) {
    const el = stickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const max = rect.width * 0.34;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(max, mag);
    joyRef.current = { x: (dx / mag) * (clamped / max), y: -(dy / mag) * (clamped / max) };
    setKnob({ x: (dx / mag) * clamped, y: (dy / mag) * clamped });
  }

  const phase = hud?.phase ?? "title";
  const plantLabel = hud?.near ? "LINK" : hud?.falling ? "AXE" : "PLANT";
  const low = (hud?.stamina ?? 100) < 28;
  const hurt = (hud?.health ?? 100) < 40;
  const sick = (hud?.ams ?? 0) > 22;

  function pressable(flag: { current: boolean }, queue: { current: boolean }) {
    return {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        flag.current = true;
        queue.current = true;
      },
      onPointerUp: () => {
        flag.current = false;
      },
      onPointerCancel: () => {
        flag.current = false;
      },
      onContextMenu: (e: MouseEvent) => e.preventDefault(),
    };
  }

  return (
    <main className="stage">
      <canvas ref={canvasRef} />
      {phase !== "title" && hud && (
        <div className="hud">
          <div className="hud-top">
            <div className="readout">
              <div className="altitude">
                {Math.round(hud.y)}
                <span>m</span>
              </div>
              <div className="zone">{hud.zone}</div>
              <div className="meters">
                <div className="meter">
                  <label>
                    <span>Health</span>
                    <span>{Math.round(hud.health)}</span>
                  </label>
                  <div className={`track health${hurt ? " hurt" : ""}`}>
                    <i style={{ width: `${Math.max(0, Math.round(hud.health))}%` }} />
                  </div>
                </div>
                <div className="meter">
                  <label>
                    <span>AMS</span>
                    <span>{Math.round(hud.ams)}</span>
                  </label>
                  <div className={`track ams${sick ? " sick" : ""}`}>
                    <i style={{ width: `${Math.max(0, Math.round(hud.ams))}%` }} />
                  </div>
                </div>
                <div className="meter">
                  <label>
                    <span>Storm</span>
                    <span>{Math.round(hud.storm * 100)}</span>
                  </label>
                  <div className="track storm">
                    <i style={{ width: `${Math.round(hud.storm * 100)}%` }} />
                  </div>
                </div>
                <div className="meter">
                  <label>
                    <span>Hands</span>
                    <span>{Math.round(hud.stamina)}</span>
                  </label>
                  <div className={`track stamina${low ? " low" : ""}`}>
                    <i style={{ width: `${Math.max(0, Math.round(hud.stamina))}%` }} />
                  </div>
                </div>
              </div>
              {hud.bannerOn && phase === "play" && <div className="banner">{hud.banner}</div>}
              {hud.radioOn && <p className="radio">{hud.radio}</p>}
            </div>
            <div className="icon-row">
              <button
                type="button"
                className="icon-btn"
                aria-label={muted ? "Unmute" : "Mute"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  audioRef.current?.setMuted(next);
                }}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              {phase !== "debrief" && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={phase === "paused" ? "Resume" : "Pause"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={togglePause}
                >
                  {phase === "paused" ? <Play size={18} /> : <Pause size={18} />}
                </button>
              )}
            </div>
          </div>
          {phase === "play" && hud.next && (
            <div className="next-chip">
              {hud.saved}/5 linked
              {" · "}
              {hud.next.name.split(" ")[0]} {Math.abs(Math.round(hud.next.dy))}m
              {hud.next.dy >= 0 ? " up" : " down"}
              {Math.abs(hud.next.dx) > 1.2 ? (hud.next.dx > 0 ? " right" : " left") : ""}
            </div>
          )}
          {phase === "play" && (
            <div className="hud-bottom">
              <div
                ref={stickRef}
                className="stick"
                role="presentation"
                onPointerDown={(e) => {
                  e.preventDefault();
                  stickId.current = e.pointerId;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  moveStick(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (stickId.current !== e.pointerId) return;
                  moveStick(e.clientX, e.clientY);
                }}
                onPointerUp={(e) => {
                  if (stickId.current !== e.pointerId) return;
                  stickId.current = null;
                  joyRef.current = { x: 0, y: 0 };
                  setKnob({ x: 0, y: 0 });
                }}
                onPointerCancel={() => {
                  stickId.current = null;
                  joyRef.current = { x: 0, y: 0 };
                  setKnob({ x: 0, y: 0 });
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
              </div>
              <div className="gear">
                <button
                  type="button"
                  className={`gear-btn${hud.radioCd > 0 ? " wait" : ""}`}
                  aria-label="Call Basecamp"
                  {...pressable(radioHeld, radioQueued)}
                >
                  <span className="gear-k">Radio</span>
                  <small>{hud.radioCd > 0 ? `${Math.ceil(hud.radioCd)}s` : "Base"}</small>
                </button>
                <button
                  type="button"
                  className={`gear-btn${hud.o2On ? " live" : ""}${hud.o2 <= 0 ? " empty" : ""}`}
                  aria-label="Use oxygen"
                  {...pressable(o2Held, o2Queued)}
                >
                  <span className="gear-k">O2</span>
                  <small>×{hud.o2}</small>
                </button>
                <button
                  type="button"
                  className={`gear-btn${sick && hud.dex > 0 ? " hot" : ""}${hud.dex <= 0 ? " empty" : ""}`}
                  aria-label="Take dexamethasone"
                  {...pressable(dexHeld, dexQueued)}
                >
                  <span className="gear-k">Dex</span>
                  <small>×{hud.dex}</small>
                </button>
              </div>
              <button
                type="button"
                className={`plant${hud.near || hud.falling ? " hot" : ""}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  plantRef.current = true;
                  plantQueued.current = true;
                }}
                onPointerUp={() => {
                  plantRef.current = false;
                }}
                onPointerCancel={() => {
                  plantRef.current = false;
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {plantLabel}
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "title" && (
        <section className="sheet">
          <p className="eyebrow">Night rescue · Karakoram</p>
          <h1>
            Whiteout
            <em>K2</em>
          </h1>
          <p className="lede">
            Five climbers are still above the Bottleneck. The storm is shutting the traverse.
            Your lamp is the only ice that holds.
          </p>
          <div className="rules">
            <div>
              <b>Stick</b>
              <span>Ease it to sweep the lamp. Push to climb that way.</span>
            </div>
            <div>
              <b>Dark</b>
              <span>Unlit ice lets go. Rock remembers the light a little longer.</span>
            </div>
            <div>
              <b>Link</b>
              <span>Get close. The button says LINK. Tap it and they join the rope.</span>
            </div>
            <div>
              <b>Gear</b>
              <span>Radio calls Base. Oxygen refills health. Dex breaks altitude sickness.</span>
            </div>
          </div>
          <button
            type="button"
            className="go"
            onPointerUp={(e) => {
              if (e.pointerType === "mouse" && e.button !== 0) return;
              begin();
            }}
            onClick={begin}
          >
            Start the climb
          </button>
          {hud?.best && (
            <p className="best">
              Best line · {hud.best.saved}/5{hud.best.reached ? ` · cave ${clock(hud.best.time)}` : " · turned back"}
            </p>
          )}
          <p className="keys">W A S D climb · Space link · R radio · Q oxygen · E dex. A is left.</p>
        </section>
      )}

      {phase === "paused" && (
        <section className="pause">
          <p className="eyebrow">Hold</p>
          <h2>Anchored</h2>
          <p className="lede">The storm does not wait, but this one does. Timers are frozen.</p>
          <button type="button" className="go" onClick={togglePause}>
            Resume
          </button>
          <button type="button" className="ghost" onClick={begin}>
            Climb again
          </button>
        </section>
      )}

      {phase === "debrief" && hud && (
        <section className="debrief">
          <p className="eyebrow">{hud.reason === "cave" ? "Cave" : "Descent"} · {clock(hud.time)}</p>
          <h2>{headline(hud)}</h2>
          <p className="lede">{debriefBody(hud)}</p>
          <ul className="roster">
            {hud.victims.map((v) => (
              <li key={v.name}>
                <span>{v.name}</span>
                <span className={v.state}>
                  {v.state === "saved" ? "Linked" : v.state === "lost" ? "Lost" : "Still out"}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="go" onClick={begin}>
            Climb again
          </button>
        </section>
      )}
    </main>
  );
}
