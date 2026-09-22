import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Eraser, Minus, Percent, TrendingDown, TrendingUp } from "lucide-react";
import {
  DEFAULT_FIB,
  DEFAULT_INDICATORS,
  bollinger,
  ema,
  loadJson,
  pivotPack,
  rsi,
  saveJson,
  toBars,
  vwap
} from "./chartMath";

const TOOLS = [
  { id: "cursor", label: "Crosshair", icon: Crosshair },
  { id: "trend", label: "Trendline", icon: Minus },
  { id: "fib", label: "Fibonacci", icon: Percent },
  { id: "long", label: "Long position", icon: TrendingUp },
  { id: "short", label: "Short position", icon: TrendingDown },
  { id: "eraser", label: "Eraser", icon: Eraser }
];

const IND_KEYS = [
  ["ema", "EMA"],
  ["volume", "Volume"],
  ["vwap", "VWAP"],
  ["rsi", "RSI"],
  ["bb", "Bollinger"],
  ["pivots", "Pivots"]
];

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function fmtPx(n, digits) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function istStamp(ts) {
  return new Date(ts * 1000).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function setDash(ctx, style) {
  if (style === "dashed") ctx.setLineDash([7, 4]);
  else if (style === "dotted") ctx.setLineDash([2, 3]);
  else ctx.setLineDash([]);
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

const UP = "#089981";
const DOWN = "#f23645";

function fmtVol(n) {
  const x = Math.abs(Number(n) || 0);
  if (x >= 1e7) return `${(x / 1e7).toFixed(2)} Cr`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(2)}K`;
  return fmtPx(x, 0);
}

function alignPx(v, dpr) {
  return Math.round(v * dpr) / dpr;
}

export default function TradeChart({ symbol, interval = "5m", candles = [], livePrice, change, changePct, precision = 2, height = 640 }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const geom = useRef(null);
  const drag = useRef(null);
  const draftRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: height });
  const [hover, setHover] = useState(null);
  const [tool, setTool] = useState("cursor");
  const [indicators, setIndicators] = useState(() => {
    const saved = loadJson("am-chart-indicators", {});
    if (saved?.volume?.up === "#26a69a") saved.volume.up = UP;
    if (saved?.volume?.down === "#ef5350") saved.volume.down = DOWN;
    if (saved?.ema && (saved.ema.color === "#5b8def" || (saved.ema.length === 20 && saved.ema.width === 1.6))) {
      saved.ema.color = "#2962ff";
      saved.ema.length = 9;
      saved.ema.width = 1.5;
    }
    const next = {};
    for (const key of Object.keys(DEFAULT_INDICATORS)) next[key] = { ...DEFAULT_INDICATORS[key], ...(saved?.[key] || {}) };
    return next;
  });
  const [drawings, setDrawings] = useState([]);
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState("ema");
  const bars = useMemo(() => toBars(candles, livePrice), [candles, livePrice]);
  const view = useMemo(() => {
    const maxBars = Math.max(80, Math.floor((size.w - 96) / 6));
    return bars.slice(-maxBars);
  }, [bars, size.w]);
  const emaSeries = useMemo(
    () => (indicators.ema?.on ? ema(view, indicators.ema.length, indicators.ema.source) : []),
    [view, indicators.ema]
  );

  useEffect(() => {
    const saved = loadJson(`am-chart-drawings:${symbol}`, []);
    setDrawings(Array.isArray(saved) ? saved : []);
    setSelected(null);
    setDraft(null);
  }, [symbol]);

  useEffect(() => {
    saveJson("am-chart-indicators", indicators);
  }, [indicators]);

  useEffect(() => {
    saveJson(`am-chart-drawings:${symbol}`, drawings);
  }, [drawings, symbol]);

  useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(() => {
      const w = box.current?.clientWidth || 900;
      setSize({ w, h: height });
    });
    ro.observe(box.current);
    setSize({ w: box.current.clientWidth || 900, h: height });
    return () => ro.disconnect();
  }, [height]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    geom.current = paint(el, { view, indicators, drawings, draft, hover, selected, precision });
  }, [view, size, indicators, drawings, draft, hover, selected, precision]);

  function pointerXY(e) {
    const rect = canvas.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitDrawing(x, y, g) {
    const items = [...drawings].reverse();
    for (const d of items) {
      const hit = hitOne(d, x, y, g);
      if (hit) return hit;
    }
    return null;
  }

  function onDown(e) {
    const g = geom.current;
    if (!g || !view.length) return;
    const { x, y } = pointerXY(e);
    canvas.current.setPointerCapture?.(e.pointerId);
    if (tool === "eraser") {
      const hit = hitDrawing(x, y, g);
      if (hit) {
        setDrawings((list) => list.filter((d) => d.id !== hit.id));
        setSelected(null);
      }
      return;
    }
    if (tool === "cursor") {
      const hit = hitDrawing(x, y, g);
      setSelected(hit ? hit.id : null);
      setPanel(hit ? "draw" : panel);
      if (hit) drag.current = { id: hit.id, part: hit.part, start: g.at(x, y), snap: clone(drawings.find((d) => d.id === hit.id)) };
      return;
    }
    const at = g.at(x, y);
    if (!at) return;
    const base = { id: uid(), t1: at.time, p1: at.price, t2: at.time, p2: at.price };
    let next = null;
    if (tool === "trend") next = { ...base, type: "trend", color: "#eef3ff", width: 1.6, style: "solid" };
    if (tool === "fib") next = { ...base, type: "fib", color: "#7c5cff", width: 1, style: "dashed", levels: clone(DEFAULT_FIB) };
    if (tool === "long" || tool === "short") {
      next = { id: base.id, type: tool, t1: at.time, t2: at.time, entry: at.price, target: at.price, stop: at.price, width: 1.2 };
    }
    if (!next) return;
    draftRef.current = next;
    setDraft(next);
    drag.current = { creating: true };
  }

  function onMove(e) {
    const g = geom.current;
    if (!g) return;
    const { x, y } = pointerXY(e);
    const at = g.at(x, y);
    if (at) setHover({ index: at.index, y: y, price: at.price });
    else setHover(null);
    const active = drag.current;
    if (!active) return;
    if (active.creating && draftRef.current && at) {
      const next = applyCreate(draftRef.current, at);
      draftRef.current = next;
      setDraft(next);
      return;
    }
    if (active.snap && at) {
      setDrawings((list) => list.map((d) => (d.id === active.id ? moveDrawing(active.snap, active.part, active.start, at, g) : d)));
    }
  }

  function onUp() {
    const made = draftRef.current;
    if (drag.current?.creating && made) {
      const span = Math.abs(made.t2 - made.t1) > 0 || Math.abs((made.p2 ?? made.target) - (made.p1 ?? made.entry)) > 0;
      if (span) {
        const next = finishDraft(made);
        setDrawings((list) => [...list, next]);
        setSelected(next.id);
        setPanel("draw");
        setTool("cursor");
      }
      draftRef.current = null;
      setDraft(null);
    }
    drag.current = null;
  }

  const selectedDrawing = drawings.find((d) => d.id === selected) || null;
  const focus = hover?.index ?? view.length - 1;
  const last = view[focus];
  const emaNow = Number.isFinite(emaSeries[focus]) ? emaSeries[focus] : null;
  const dayChg = Number(change);
  const dayPct = Number(changePct);
  const upDay = (Number.isFinite(dayChg) ? dayChg : Number(last?.c) - Number(last?.o)) >= 0;

  return (
    <div className="chart-desk">
      <div className="chart-tools">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" className={`chart-tool ${tool === t.id ? "on" : ""}`} title={t.label} onClick={() => setTool(t.id)}>
              <Icon size={16} />
            </button>
          );
        })}
      </div>
      <div className="chart-stage" ref={box} style={{ height }}>
        <canvas
          ref={canvas}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => { setHover(null); }}
        />
        {last ? (
          <div className="chart-hud mono">
            <div className="chart-legend-name">{symbol} · {interval} · {istStamp(last.time)} IST</div>
            <div>
              <span className="k">O</span>{fmtPx(last.o, precision)}
              <span className="k">H</span>{fmtPx(last.h, precision)}
              <span className="k">L</span>{fmtPx(last.l, precision)}
              <span className="k">C</span><span className={upDay ? "up" : "dn"}>{fmtPx(last.c, precision)}</span>
              {Number.isFinite(dayChg) ? (
                <span className={upDay ? "up" : "dn"}>
                  {dayChg >= 0 ? "+" : ""}{fmtPx(dayChg, precision)} ({dayPct >= 0 ? "+" : ""}{fmtPx(dayPct, 2)}%)
                </span>
              ) : null}
            </div>
            <div><span className="k">Vol</span>{fmtVol(last.v)}</div>
            {emaNow != null ? (
              <div style={{ color: indicators.ema.color }}>EMA {indicators.ema.length} {fmtPx(emaNow, precision)}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      <aside className="chart-side">
        <div className="chips">
          {IND_KEYS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${indicators[key]?.on ? "on" : ""}`}
              onClick={() => setPanel(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {panel === "draw" && selectedDrawing ? (
          <DrawingForm
            drawing={selectedDrawing}
            precision={precision}
            onChange={(next) => setDrawings((list) => list.map((d) => (d.id === next.id ? next : d)))}
            onDelete={() => {
              setDrawings((list) => list.filter((d) => d.id !== selectedDrawing.id));
              setSelected(null);
              setPanel("ema");
            }}
          />
        ) : (
          <IndicatorForm
            name={panel}
            value={indicators[panel] || indicators.ema}
            onChange={(next) => setIndicators((all) => ({ ...all, [panel]: next }))}
          />
        )}
        <button type="button" className="btn ghost" onClick={() => { setDrawings([]); setSelected(null); }}>
          Clear drawings
        </button>
      </aside>
    </div>
  );
}

function applyCreate(d, at) {
  if (!d || !at) return d;
  if (d.type === "long" || d.type === "short") {
    const target = at.price;
    const span = target - d.entry;
    const stop = d.type === "long" ? d.entry - Math.abs(span) * 0.5 : d.entry + Math.abs(span) * 0.5;
    return { ...d, t2: at.time, target, stop };
  }
  return { ...d, t2: at.time, p2: at.price };
}

function finishDraft(d) {
  if (d.type !== "long" && d.type !== "short") return d;
  const t1 = Math.min(d.t1, d.t2);
  const t2 = Math.max(d.t1, d.t2);
  return { ...d, t1, t2 };
}

function moveDrawing(snap, part, start, at, g) {
  const dPrice = at.price - start.price;
  const next = clone(snap);
  const shiftTime = (t) => {
    const i = g.bars.findIndex((b) => b.time === t);
    const j = Math.max(0, Math.min(g.bars.length - 1, (i < 0 ? 0 : i) + (g.bars.findIndex((b) => b.time === at.time) - g.bars.findIndex((b) => b.time === start.time))));
    return g.bars[j]?.time ?? t;
  };
  if (next.type === "trend" || next.type === "fib") {
    if (part === "a") {
      next.t1 = at.time;
      next.p1 = at.price;
    } else if (part === "b") {
      next.t2 = at.time;
      next.p2 = at.price;
    } else {
      next.t1 = shiftTime(snap.t1);
      next.t2 = shiftTime(snap.t2);
      next.p1 = snap.p1 + dPrice;
      next.p2 = snap.p2 + dPrice;
    }
    return next;
  }
  if (part === "entry") next.entry = at.price;
  else if (part === "stop") next.stop = at.price;
  else if (part === "target") next.target = at.price;
  else if (part === "left") next.t1 = at.time;
  else if (part === "right") next.t2 = at.time;
  else {
    next.t1 = shiftTime(snap.t1);
    next.t2 = shiftTime(snap.t2);
    next.entry = snap.entry + dPrice;
    next.stop = snap.stop + dPrice;
    next.target = snap.target + dPrice;
  }
  if (next.t2 < next.t1) [next.t1, next.t2] = [next.t2, next.t1];
  return next;
}

function hitOne(d, x, y, g) {
  const pts = anchors(d, g);
  for (const p of pts) {
    if (Math.hypot(x - p.x, y - p.y) < 10) return { id: d.id, part: p.part };
  }
  if (d.type === "trend" || d.type === "fib") {
    const a = g.xy(d.t1, d.p1);
    const b = g.xy(d.t2, d.p2);
    if (a && b && distToSeg(x, y, a.x, a.y, b.x, b.y) < 8) return { id: d.id, part: "body" };
  }
  if (d.type === "long" || d.type === "short") {
    const x1 = g.xOf(d.t1);
    const x2 = g.xOf(d.t2);
    if (x >= Math.min(x1, x2) && x <= Math.max(x1, x2)) {
      for (const [part, price] of [["entry", d.entry], ["stop", d.stop], ["target", d.target]]) {
        if (Math.abs(y - g.yOf(price)) < 8) return { id: d.id, part };
      }
      const top = Math.min(g.yOf(d.target), g.yOf(d.stop), g.yOf(d.entry));
      const bot = Math.max(g.yOf(d.target), g.yOf(d.stop), g.yOf(d.entry));
      if (y >= top && y <= bot) return { id: d.id, part: "body" };
    }
  }
  return null;
}

function anchors(d, g) {
  if (d.type === "trend" || d.type === "fib") {
    const a = g.xy(d.t1, d.p1);
    const b = g.xy(d.t2, d.p2);
    return [
      a && { ...a, part: "a" },
      b && { ...b, part: "b" }
    ].filter(Boolean);
  }
  const midT = d.t1;
  const x1 = g.xOf(d.t1);
  const x2 = g.xOf(d.t2);
  const mid = (x1 + x2) / 2;
  return [
    { x: mid, y: g.yOf(d.entry), part: "entry" },
    { x: mid, y: g.yOf(d.stop), part: "stop" },
    { x: mid, y: g.yOf(d.target), part: "target" },
    { x: x1, y: g.yOf(d.entry), part: "left" },
    { x: x2, y: g.yOf(d.entry), part: "right" }
  ].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && midT);
}

function axisDay(ts) {
  return new Date(ts * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit" });
}

function axisClock(ts) {
  return new Date(ts * 1000).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function axisLabel(ts) {
  return `${axisDay(ts)} ${axisClock(ts)}`;
}

function roundTag(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function paint(canvas, { view, indicators, drawings, draft, hover, selected, precision }) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  const w = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
  const nextW = Math.max(1, Math.floor(w * dpr));
  const nextH = Math.max(1, Math.floor(h * dpr));
  if (canvas.width !== nextW || canvas.height !== nextH) {
    canvas.width = nextW;
    canvas.height = nextH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b0e11";
  ctx.fillRect(0, 0, w, h);
  const showVol = indicators.volume?.on !== false;
  const showRsi = Boolean(indicators.rsi?.on);
  const pad = { l: 8, r: 86, t: 8, b: 26 };
  const innerH = h - pad.t - pad.b;
  const rsiH = showRsi ? Math.max(70, innerH * 0.2) : 0;
  const volH = showVol ? Math.max(72, innerH * 0.24) : 0;
  const gap = (showVol ? 8 : 0) + (showRsi ? 8 : 0);
  const pxH = Math.max(80, innerH - rsiH - volH - gap);
  const plotW = Math.max(10, w - pad.l - pad.r);
  if (!view.length) {
    ctx.fillStyle = "#8b9bb8";
    ctx.font = "13px IBM Plex Sans, sans-serif";
    ctx.fillText("Waiting for live candles…", 16, h / 2);
    return null;
  }
  const emaLine = indicators.ema?.on ? ema(view, indicators.ema.length, indicators.ema.source) : [];
  const bb = indicators.bb?.on ? bollinger(view, indicators.bb.length, indicators.bb.mult) : null;
  const vw = indicators.vwap?.on ? vwap(view) : [];
  const rsiLine = showRsi ? rsi(view, indicators.rsi.length) : [];
  const pivots = indicators.pivots?.on ? pivotPack(view) : null;
  const extra = [...emaLine, ...vw, ...(bb ? [...bb.upper, ...bb.lower] : [])];
  if (pivots) extra.push(pivots.r2, pivots.s2, pivots.r3, pivots.s3);
  let hi = Math.max(...view.map((b) => b.h), ...extra.filter(Number.isFinite));
  let lo = Math.min(...view.map((b) => b.l), ...extra.filter(Number.isFinite));
  const allDraws = draft ? [...drawings, draft] : drawings;
  for (const d of allDraws) {
    const prices = d.type === "long" || d.type === "short" ? [d.entry, d.stop, d.target] : [d.p1, d.p2];
    for (const p of prices) if (Number.isFinite(p)) { hi = Math.max(hi, p); lo = Math.min(lo, p); }
  }
  const padPx = (hi - lo) * 0.08 || 1;
  hi += padPx;
  lo -= padPx;
  const span = hi - lo || 1;
  const yOf = (p) => pad.t + (1 - (p - lo) / span) * pxH;
  const priceAtY = (y) => hi - ((y - pad.t) / pxH) * span;
  const step = plotW / view.length;
  const xOfIndex = (i) => pad.l + i * step + step / 2;
  const indexAt = (x) => Math.max(0, Math.min(view.length - 1, Math.floor((x - pad.l) / step)));
  const xOf = (time) => {
    let best = 0;
    let dist = Infinity;
    view.forEach((b, i) => {
      const dd = Math.abs(b.time - time);
      if (dd < dist) { dist = dd; best = i; }
    });
    return xOfIndex(best);
  };
  const xy = (time, price) => ({ x: xOf(time), y: yOf(price) });

  const hair = 1 / dpr;
  ctx.strokeStyle = "#1e222d";
  ctx.lineWidth = hair;
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillStyle = "#787b86";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const p = hi - (span * i) / 5;
    const y = alignPx(yOf(p), dpr);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + plotW, y);
    ctx.stroke();
    ctx.fillText(fmtPx(p, precision), pad.l + plotW + 8, y);
  }
  ctx.textBaseline = "alphabetic";

  const upColor = indicators.volume?.up || UP;
  const downColor = indicators.volume?.down || DOWN;
  const bodyW = Math.max(2 / dpr, Math.floor(step * 0.72 * dpr) / dpr);
  view.forEach((b, i) => {
    const x = xOfIndex(i);
    const up = b.c >= b.o;
    const color = up ? upColor : downColor;
    const yH = alignPx(yOf(b.h), dpr);
    const yL = alignPx(yOf(b.l), dpr);
    const top = alignPx(Math.min(yOf(b.o), yOf(b.c)), dpr);
    const bot = alignPx(Math.max(yOf(b.o), yOf(b.c)), dpr);
    const bx = alignPx(x - bodyW / 2, dpr);
    const bw = Math.max(2 / dpr, alignPx(bx + bodyW, dpr) - bx);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(hair, Math.min(1, bw / 3));
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(alignPx(x, dpr), yH);
    ctx.lineTo(alignPx(x, dpr), yL);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(bx, top, bw, Math.max(hair, bot - top));
  });

  function strokeSeries(values, opt) {
    if (!opt) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = opt.color;
    ctx.lineWidth = opt.width || 1.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    setDash(ctx, opt.style);
    let started = false;
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const x = xOfIndex(i);
      const y = yOf(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    if (started) ctx.stroke();
    ctx.restore();
  }
  if (bb) {
    strokeSeries(bb.upper, indicators.bb);
    strokeSeries(bb.lower, indicators.bb);
    strokeSeries(bb.mid, { ...indicators.bb, style: "dashed" });
  }
  strokeSeries(vw, indicators.vwap);
  strokeSeries(emaLine, indicators.ema);
  if (pivots) {
    ctx.save();
    ctx.strokeStyle = indicators.pivots.color;
    ctx.lineWidth = indicators.pivots.width || 1;
    setDash(ctx, indicators.pivots.style);
    ctx.fillStyle = indicators.pivots.color;
    ctx.font = "10px IBM Plex Sans, sans-serif";
    for (const [name, price] of Object.entries(pivots)) {
      if (name === "day" || !Number.isFinite(price)) continue;
      const y = yOf(price);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
      ctx.fillText(name.toUpperCase(), pad.l + 4, y - 3);
    }
    ctx.restore();
  }

  const volTop = pad.t + pxH + 8;
  if (showVol) {
    const vmax = Math.max(...view.map((b) => b.v), 1);
    view.forEach((b, i) => {
      const up = b.c >= b.o;
      const x = xOfIndex(i);
      const vh = alignPx((b.v / vmax) * (volH - 6), dpr);
      const bx = alignPx(x - bodyW / 2, dpr);
      const bw = Math.max(2 / dpr, alignPx(bx + bodyW, dpr) - bx);
      ctx.fillStyle = up ? upColor : downColor;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(bx, alignPx(volTop + volH - vh, dpr), bw, Math.max(hair, vh));
      ctx.globalAlpha = 1;
    });
  }
  if (showRsi) {
    const top = pad.t + pxH + (showVol ? volH + 8 : 0) + 8;
    const yR = (v) => top + (1 - v / 100) * (rsiH - 8);
    ctx.strokeStyle = "#1a2438";
    ctx.fillStyle = "#8b9bb8";
    for (const level of [indicators.rsi.ob, 50, indicators.rsi.os]) {
      const y = yR(level);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
      ctx.fillText(String(level), pad.l + plotW + 6, y + 3);
    }
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = indicators.rsi.color;
    ctx.lineWidth = indicators.rsi.width || 1.4;
    setDash(ctx, indicators.rsi.style);
    let started = false;
    rsiLine.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const x = xOfIndex(i);
      const y = yR(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    if (started) ctx.stroke();
    ctx.restore();
  }

  for (const d of allDraws) drawShape(ctx, d, { xOf, yOf, selected: d.id === selected });

  const mark = view[view.length - 1];
  const ly = alignPx(yOf(mark.c), dpr);
  const markColor = mark.c >= mark.o ? upColor : downColor;
  const markLabel = fmtPx(mark.c, precision);
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = markColor;
  ctx.lineWidth = hair;
  ctx.beginPath();
  ctx.moveTo(pad.l, ly);
  ctx.lineTo(pad.l + plotW, ly);
  ctx.stroke();
  ctx.restore();
  ctx.font = "11px IBM Plex Mono, monospace";
  const tagW = Math.max(72, ctx.measureText(markLabel).width + 14);
  const tagH = 18;
  ctx.fillStyle = markColor;
  roundTag(ctx, pad.l + plotW + 4, ly - tagH / 2, tagW, tagH, 2);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(markLabel, pad.l + plotW + 11, ly);
  ctx.textBaseline = "alphabetic";

  if (hover && view[hover.index]) {
    const x = alignPx(xOfIndex(hover.index), dpr);
    const y = alignPx(hover.y, dpr);
    ctx.save();
    ctx.strokeStyle = "rgba(178,181,190,0.45)";
    ctx.lineWidth = hair;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, h - pad.b);
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + plotW, y);
    ctx.stroke();
    ctx.restore();
    const crossLabel = fmtPx(hover.price, precision);
    const cwTag = Math.max(72, ctx.measureText(crossLabel).width + 14);
    ctx.fillStyle = "#363a45";
    roundTag(ctx, pad.l + plotW + 4, y - 9, cwTag, 18, 2);
    ctx.fillStyle = "#d1d4dc";
    ctx.textBaseline = "middle";
    ctx.fillText(crossLabel, pad.l + plotW + 11, y);
    const stamp = axisLabel(view[hover.index].time, null);
    const tw = ctx.measureText(stamp).width + 12;
    ctx.fillStyle = "#363a45";
    roundTag(ctx, x - tw / 2, h - pad.b + 4, tw, 16, 2);
    ctx.fillStyle = "#d1d4dc";
    ctx.fillText(stamp, x - tw / 2 + 6, h - pad.b + 12);
    ctx.textBaseline = "alphabetic";
  }
  ctx.fillStyle = "#787b86";
  ctx.font = "11px IBM Plex Mono, monospace";
  const every = Math.max(1, Math.floor(view.length / 6));
  let prevDay = "";
  view.forEach((b, i) => {
    const day = axisDay(b.time);
    const show = i === 0 || day !== prevDay || i % every === 0;
    if (i !== 0) prevDay = day;
    else prevDay = day;
    if (!show) return;
    const label = i === 0 || day !== axisDay(view[i - 1]?.time) ? day : axisClock(b.time);
    ctx.fillText(label, xOfIndex(i) - 14, h - 8);
  });

  return {
    bars: view,
    yOf,
    xOf,
    xy,
    at(x, y) {
      if (x < pad.l || x > pad.l + plotW || y < pad.t || y > pad.t + pxH) return null;
      const index = indexAt(x);
      return { index, time: view[index].time, price: priceAtY(y) };
    }
  };
}

function drawShape(ctx, d, { xOf, yOf, selected }) {
  ctx.save();
  if (d.type === "trend" || d.type === "fib") {
    const x1 = xOf(d.t1);
    const x2 = xOf(d.t2);
    const y1 = yOf(d.p1);
    const y2 = yOf(d.p2);
    ctx.strokeStyle = d.color || "#eef3ff";
    ctx.lineWidth = d.width || 1.4;
    setDash(ctx, d.style);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (d.type === "fib") {
      const levels = d.levels?.length ? d.levels : DEFAULT_FIB;
      ctx.font = "10px IBM Plex Mono, monospace";
      for (const lv of levels) {
        if (!lv.on) continue;
        const price = d.p1 + (d.p2 - d.p1) * Number(lv.ratio);
        const y = yOf(price);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(Math.min(x1, x2), y);
        ctx.lineTo(Math.max(x1, x2), y);
        ctx.stroke();
        ctx.fillStyle = d.color || "#7c5cff";
        ctx.fillText(`${lv.ratio}  ${price.toFixed(2)}`, Math.max(x1, x2) + 4, y - 2);
      }
    }
    dot(ctx, x1, y1);
    dot(ctx, x2, y2);
  } else {
    const x1 = xOf(d.t1);
    const x2 = xOf(d.t2);
    const yE = yOf(d.entry);
    const yT = yOf(d.target);
    const yS = yOf(d.stop);
    const left = Math.min(x1, x2);
    const width = Math.max(8, Math.abs(x2 - x1));
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = UP;
    ctx.fillRect(left, Math.min(yE, yT), width, Math.abs(yT - yE));
    ctx.fillStyle = DOWN;
    ctx.fillRect(left, Math.min(yE, yS), width, Math.abs(yS - yE));
    ctx.globalAlpha = 1;
    ctx.lineWidth = d.width || 1.2;
    ctx.strokeStyle = UP;
    ctx.strokeRect(left, Math.min(yE, yT), width, Math.abs(yT - yE));
    ctx.strokeStyle = DOWN;
    ctx.strokeRect(left, Math.min(yE, yS), width, Math.abs(yS - yE));
    const risk = Math.abs(d.entry - d.stop) || 1;
    const rr = Math.abs(d.target - d.entry) / risk;
    ctx.fillStyle = "#eef3ff";
    ctx.font = "11px IBM Plex Sans, sans-serif";
    ctx.fillText(`${d.type === "long" ? "Long" : "Short"}  RR ${rr.toFixed(2)}`, left + 6, Math.min(yT, yS, yE) - 6);
    dot(ctx, (x1 + x2) / 2, yE);
    dot(ctx, (x1 + x2) / 2, yS);
    dot(ctx, (x1 + x2) / 2, yT);
  }
  if (selected) {
    ctx.strokeStyle = "#3ee0ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
  }
  ctx.restore();
}

function dot(ctx, x, y) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = "#0b0e11";
  ctx.strokeStyle = "#eef3ff";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function LineStyle({ value, onChange }) {
  return (
    <div className="chart-form">
      <label>Color <input type="color" value={value.color || "#eef3ff"} onChange={(e) => onChange({ ...value, color: e.target.value })} /></label>
      <label>Width <input type="number" min="1" max="6" step="0.2" value={value.width || 1.4} onChange={(e) => onChange({ ...value, width: Number(e.target.value) })} /></label>
      <label>Style
        <select value={value.style || "solid"} onChange={(e) => onChange({ ...value, style: e.target.value })}>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>
    </div>
  );
}

function IndicatorForm({ name, value, onChange }) {
  if (!value) return null;
  return (
    <div className="chart-panel">
      <div className="row">
        <h3 style={{ margin: 0 }}>{IND_KEYS.find((x) => x[0] === name)?.[1] || name}</h3>
        <label className="muted"><input type="checkbox" checked={Boolean(value.on)} onChange={(e) => onChange({ ...value, on: e.target.checked })} /> Show</label>
      </div>
      {name === "volume" ? (
        <div className="chart-form">
          <label>Up <input type="color" value={value.up} onChange={(e) => onChange({ ...value, up: e.target.value })} /></label>
          <label>Down <input type="color" value={value.down} onChange={(e) => onChange({ ...value, down: e.target.value })} /></label>
        </div>
      ) : null}
      {name === "ema" ? (
        <>
          <div className="chart-form">
            <label>Length <input type="number" min="1" max="400" value={value.length} onChange={(e) => onChange({ ...value, length: Number(e.target.value) })} /></label>
            <label>Source
              <select value={value.source} onChange={(e) => onChange({ ...value, source: e.target.value })}>
                {["close", "open", "high", "low", "hl2", "hlc3"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <LineStyle value={value} onChange={onChange} />
        </>
      ) : null}
      {name === "vwap" || name === "pivots" ? <LineStyle value={value} onChange={onChange} /> : null}
      {name === "bb" ? (
        <>
          <div className="chart-form">
            <label>Length <input type="number" min="2" max="200" value={value.length} onChange={(e) => onChange({ ...value, length: Number(e.target.value) })} /></label>
            <label>Mult <input type="number" min="0.5" max="5" step="0.1" value={value.mult} onChange={(e) => onChange({ ...value, mult: Number(e.target.value) })} /></label>
          </div>
          <LineStyle value={value} onChange={onChange} />
        </>
      ) : null}
      {name === "rsi" ? (
        <>
          <div className="chart-form">
            <label>Length <input type="number" min="2" max="100" value={value.length} onChange={(e) => onChange({ ...value, length: Number(e.target.value) })} /></label>
            <label>Overbought <input type="number" min="50" max="100" value={value.ob} onChange={(e) => onChange({ ...value, ob: Number(e.target.value) })} /></label>
            <label>Oversold <input type="number" min="0" max="50" value={value.os} onChange={(e) => onChange({ ...value, os: Number(e.target.value) })} /></label>
          </div>
          <LineStyle value={value} onChange={onChange} />
        </>
      ) : null}
    </div>
  );
}

function DrawingForm({ drawing, precision, onChange, onDelete }) {
  const patch = (extra) => onChange({ ...drawing, ...extra });
  return (
    <div className="chart-panel">
      <h3 style={{ marginTop: 0 }}>{drawing.type === "fib" ? "Fibonacci" : drawing.type === "trend" ? "Trendline" : drawing.type === "long" ? "Long position" : "Short position"}</h3>
      {drawing.type === "trend" || drawing.type === "fib" ? (
        <>
          <LineStyle value={drawing} onChange={(next) => onChange({ ...drawing, ...next })} />
          <div className="chart-form">
            <label>Start <input type="number" step="0.01" value={drawing.p1} onChange={(e) => patch({ p1: Number(e.target.value) })} /></label>
            <label>End <input type="number" step="0.01" value={drawing.p2} onChange={(e) => patch({ p2: Number(e.target.value) })} /></label>
          </div>
        </>
      ) : (
        <div className="chart-form">
          <label>Entry <input type="number" step="0.01" value={round(drawing.entry, precision)} onChange={(e) => patch({ entry: Number(e.target.value) })} /></label>
          <label>Stop <input type="number" step="0.01" value={round(drawing.stop, precision)} onChange={(e) => patch({ stop: Number(e.target.value) })} /></label>
          <label>Target <input type="number" step="0.01" value={round(drawing.target, precision)} onChange={(e) => patch({ target: Number(e.target.value) })} /></label>
        </div>
      )}
      {drawing.type === "fib" ? (
        <div className="chart-levels">
          {(drawing.levels || []).map((lv, i) => (
            <div className="row" key={`${lv.ratio}-${i}`}>
              <input type="checkbox" checked={lv.on} onChange={(e) => {
                const levels = drawing.levels.map((row, idx) => (idx === i ? { ...row, on: e.target.checked } : row));
                patch({ levels });
              }} />
              <input type="number" step="0.001" value={lv.ratio} onChange={(e) => {
                const levels = drawing.levels.map((row, idx) => (idx === i ? { ...row, ratio: Number(e.target.value) } : row));
                patch({ levels });
              }} />
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={() => patch({ levels: [...(drawing.levels || []), { ratio: 1.618, on: true }] })}>Add level</button>
        </div>
      ) : null}
      <p className="muted">Drag the handles on the chart to move this drawing.</p>
      <button type="button" className="btn danger" onClick={onDelete}>Delete</button>
    </div>
  );
}

function round(n, d) {
  const p = 10 ** d;
  return Math.round(Number(n) * p) / p;
}
