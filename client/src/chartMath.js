export function toBars(candles = [], livePrice) {
  const bars = [];
  for (const c of candles) {
    const t = Number(c.t);
    const time = t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
    const o = Number(c.o || c.c);
    const h = Number(c.h || c.c);
    const l = Number(c.l || c.c);
    const cl = Number(c.c);
    const v = Number(c.v || 0);
    if (!time || !Number.isFinite(cl)) continue;
    bars.push({ time, o, h: Math.max(o, h, l, cl), l: Math.min(o, h, l, cl), c: cl, v });
  }
  bars.sort((a, b) => a.time - b.time);
  const uniq = [];
  for (const b of bars) {
    if (uniq.length && uniq.at(-1).time === b.time) uniq[uniq.length - 1] = b;
    else uniq.push(b);
  }
  if (uniq.length && Number.isFinite(Number(livePrice))) {
    const last = uniq[uniq.length - 1];
    last.c = Number(livePrice);
    last.h = Math.max(last.h, last.c);
    last.l = Math.min(last.l, last.c);
  }
  return uniq;
}

export function sourceValue(bar, source) {
  if (source === "open") return bar.o;
  if (source === "high") return bar.h;
  if (source === "low") return bar.l;
  if (source === "hl2") return (bar.h + bar.l) / 2;
  if (source === "hlc3") return (bar.h + bar.l + bar.c) / 3;
  return bar.c;
}

export function ema(bars, length, source = "close") {
  const n = Math.max(1, Number(length) || 1);
  const out = Array(bars.length).fill(null);
  if (bars.length < n) return out;
  const k = 2 / (n + 1);
  let e = 0;
  for (let i = 0; i < n; i++) e += sourceValue(bars[i], source);
  e /= n;
  out[n - 1] = e;
  for (let i = n; i < bars.length; i++) {
    e = sourceValue(bars[i], source) * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

export function bollinger(bars, length, mult) {
  const n = Math.max(2, Number(length) || 20);
  const m = Number(mult) || 2;
  const mid = Array(bars.length).fill(null);
  const upper = Array(bars.length).fill(null);
  const lower = Array(bars.length).fill(null);
  for (let i = n - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += bars[j].c;
    const mean = sum / n;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (bars[j].c - mean) ** 2;
    const sd = Math.sqrt(v / n);
    mid[i] = mean;
    upper[i] = mean + m * sd;
    lower[i] = mean - m * sd;
  }
  return { mid, upper, lower };
}

export function rsi(bars, length) {
  const n = Math.max(2, Number(length) || 14);
  const out = Array(bars.length).fill(null);
  if (bars.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = bars[i].c - bars[i - 1].c;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  const pack = (g, l) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out[n] = pack(gain, loss);
  for (let i = n + 1; i < bars.length; i++) {
    const d = bars[i].c - bars[i - 1].c;
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = pack(gain, loss);
  }
  return out;
}

export function istDay(ts) {
  return new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function vwap(bars) {
  const out = Array(bars.length).fill(null);
  let day = "";
  let pv = 0;
  let vol = 0;
  bars.forEach((b, i) => {
    const d = istDay(b.time);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const tp = (b.h + b.l + b.c) / 3;
    const q = b.v > 0 ? b.v : 1;
    pv += tp * q;
    vol += q;
    out[i] = pv / vol;
  });
  return out;
}

export function pivotPack(bars) {
  const days = new Map();
  for (const b of bars) {
    const d = istDay(b.time);
    const cur = days.get(d) || { h: -Infinity, l: Infinity, c: b.c };
    cur.h = Math.max(cur.h, b.h);
    cur.l = Math.min(cur.l, b.l);
    cur.c = b.c;
    days.set(d, cur);
  }
  const keys = [...days.keys()];
  if (keys.length < 2) return null;
  const prev = days.get(keys[keys.length - 2]);
  const p = (prev.h + prev.l + prev.c) / 3;
  return {
    day: keys[keys.length - 2],
    p,
    r1: 2 * p - prev.l,
    s1: 2 * p - prev.h,
    r2: p + (prev.h - prev.l),
    s2: p - (prev.h - prev.l),
    r3: prev.h + 2 * (p - prev.l),
    s3: prev.l - 2 * (prev.h - p)
  };
}

export const DEFAULT_FIB = [
  { ratio: 0, on: true },
  { ratio: 0.236, on: true },
  { ratio: 0.382, on: true },
  { ratio: 0.5, on: true },
  { ratio: 0.618, on: true },
  { ratio: 0.786, on: true },
  { ratio: 1, on: true }
];

export const DEFAULT_INDICATORS = {
  ema: { on: true, length: 9, source: "close", color: "#2962ff", width: 1.5, style: "solid" },
  volume: { on: true, up: "#089981", down: "#f23645" },
  vwap: { on: false, color: "#f5c84c", width: 1.4, style: "dashed" },
  rsi: { on: false, length: 14, ob: 70, os: 30, color: "#c084fc", width: 1.4, style: "solid" },
  bb: { on: false, length: 20, mult: 2, color: "#94a3b8", width: 1.2, style: "solid" },
  pivots: { on: false, color: "#fb923c", width: 1, style: "dotted" }
};

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}
