export type Sound = {
  unlock: () => void;
  setStorm: (storm: number) => void;
  setMuted: (muted: boolean) => void;
  muted: () => boolean;
  tick: (kind: "plant" | "clip" | "fall" | "catch" | "lost" | "cave" | "cold" | "sick" | "radio" | "o2" | "dex") => void;
  close: () => void;
};

export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let windGain: GainNode | null = null;
  let windFilter: BiquadFilterNode | null = null;
  let muted = false;

  function unlock() {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: "interactive" });
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      const seconds = 2;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = "lowpass";
      windFilter.frequency.value = 420;
      windGain = ctx.createGain();
      windGain.gain.value = 0.04;
      src.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      src.start();
    }
    if (ctx.state === "suspended") void ctx.resume();
  }

  function setStorm(storm: number) {
    if (!ctx || !windGain || !windFilter || !master) return;
    const now = ctx.currentTime;
    windGain.gain.setTargetAtTime(muted ? 0 : 0.03 + storm * 0.11, now, 0.08);
    windFilter.frequency.setTargetAtTime(320 + storm * 1100, now, 0.1);
  }

  function blip(freq: number, dur: number, type: OscillatorType, gain: number) {
    if (!ctx || !master || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  function noise(dur: number, gain: number, freq: number) {
    if (!ctx || !master || muted) return;
    const now = ctx.currentTime;
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(now);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  return {
    unlock,
    setStorm,
    setMuted(next: boolean) {
      muted = next;
      if (ctx && master) master.gain.setTargetAtTime(next ? 0 : 0.85, ctx.currentTime, 0.05);
    },
    muted: () => muted,
    tick(kind) {
      if (kind === "plant") noise(0.09, 0.18, 900);
      else if (kind === "clip") {
        blip(660, 0.12, "sine", 0.12);
        blip(880, 0.16, "sine", 0.08);
      } else if (kind === "fall") blip(140, 0.2, "sawtooth", 0.05);
      else if (kind === "catch") {
        noise(0.12, 0.22, 400);
        blip(220, 0.14, "triangle", 0.08);
      } else if (kind === "lost") blip(196, 0.35, "sine", 0.07);
      else if (kind === "cave") blip(523, 0.3, "sine", 0.1);
      else if (kind === "cold" || kind === "sick") blip(110, 0.4, "sine", 0.08);
      else if (kind === "radio") {
        blip(740, 0.06, "square", 0.04);
        blip(520, 0.09, "square", 0.03);
      } else if (kind === "o2") blip(392, 0.18, "sine", 0.08);
      else if (kind === "dex") blip(494, 0.14, "triangle", 0.08);
    },
    close() {
      void ctx?.close();
      ctx = null;
      master = null;
      windGain = null;
      windFilter = null;
    },
  };
}
