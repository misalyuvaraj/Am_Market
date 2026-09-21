import { useEffect, useMemo, useRef, useState } from "react";

function emaLine(bars, period) {
  if (bars.length < period) return [];
  const k = 2 / (period + 1);
  let e = bars.slice(0, period).reduce((a, b) => a + b.c, 0) / period;
  const out = Array(period - 1).fill(null);
  out.push(e);
  for (let i = period; i < bars.length; i++) {
    e = bars[i].c * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

function smaLine(bars, period) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= period) sum -= bars[i - period].c;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function toBars(candles = [], livePrice) {
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
    bars.push({
      time,
      o,
      h: Math.max(o, h, l, cl),
      l: Math.min(o, h, l, cl),
      c: cl,
      v
    });
  }
  bars.sort((a, b) => a.time - b.time);
  const uniq = [];
  for (const b of bars) {
    if (uniq.length && uniq[uniq.length - 1].time === b.time) uniq[uniq.length - 1] = b;
    else uniq.push(b);
  }
  if (uniq.length > 1) {
    const last = uniq[uniq.length - 1];
    const prev = uniq[uniq.length - 2];
    const gap = last.time - prev.time;
    if (last.time % 60 !== 0 || (gap > 0 && gap < 60)) {
      prev.h = Math.max(prev.h, last.h);
      prev.l = Math.min(prev.l, last.l);
      prev.c = last.c;
      prev.v += last.v;
      uniq.pop();
    }
  }
  if (uniq.length && Number.isFinite(Number(livePrice))) {
    const last = uniq[uniq.length - 1];
    last.c = Number(livePrice);
    last.h = Math.max(last.h, last.c);
    last.l = Math.min(last.l, last.c);
  }
  return uniq;
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

function fmtPx(n, digits) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function drawChart(canvas, view, hover, precision) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#070b14";
  ctx.fillRect(0, 0, w, h);

  const pad = { l: 10, r: 72, t: 14, b: 26 };
  const plotW = Math.max(10, w - pad.l - pad.r);
  const plotH = Math.max(10, h - pad.t - pad.b);
  const volH = plotH * 0.22;
  const pxH = plotH - volH - 10;

  if (!view.length) {
    ctx.fillStyle = "#8b9bb8";
    ctx.font = "13px IBM Plex Sans, sans-serif";
    ctx.fillText("Waiting for live candles…", pad.l + 8, h / 2);
    return;
  }

  const sma5 = smaLine(view, 5);
  const ema20 = emaLine(view, 20);
  const ema200 = emaLine(view, 200);
  const extras = [...sma5, ...ema20, ...ema200].filter((x) => Number.isFinite(x));
  let hi = Math.max(...view.map((b) => b.h), ...extras);
  let lo = Math.min(...view.map((b) => b.l), ...extras);
  const padPx = (hi - lo) * 0.06 || hi * 0.002 || 1;
  hi += padPx;
  lo -= padPx;
  const span = hi - lo || 1;
  const yPx = (p) => pad.t + (1 - (p - lo) / span) * pxH;
  const step = plotW / view.length;
  const cw = Math.max(1.2, step * 0.68);
  const vmax = Math.max(...view.map((b) => b.v), 1);

  ctx.strokeStyle = "#1a2438";
  ctx.lineWidth = 1;
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillStyle = "#8b9bb8";
  const ticks = 6;
  for (let i = 0; i <= ticks; i++) {
    const p = hi - (span * i) / ticks;
    const y = yPx(p);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + plotW, y);
    ctx.stroke();
    ctx.fillText(fmtPx(p, precision), pad.l + plotW + 8, y + 4);
  }

  const volTop = pad.t + pxH + 8;
  view.forEach((b, i) => {
    const x = pad.l + i * step + step / 2;
    const up = b.c >= b.o;
    const color = up ? "#26a69a" : "#ef5350";
    const yO = yPx(b.o);
    const yC = yPx(b.c);
    const yH = yPx(b.h);
    const yL = yPx(b.l);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, yH);
    ctx.lineTo(x, yL);
    ctx.stroke();
    const top = Math.min(yO, yC);
    const bh = Math.max(1, Math.abs(yC - yO));
    ctx.fillStyle = color;
    ctx.fillRect(x - cw / 2, top, cw, bh);
    const vh = (b.v / vmax) * volH;
    ctx.fillStyle = up ? "rgba(38,166,154,0.45)" : "rgba(239,83,80,0.45)";
    ctx.fillRect(x - cw / 2, volTop + volH - vh, cw, vh);
  });

  function strokeLine(values, color, width) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    let started = false;
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const x = pad.l + i * step + step / 2;
      const y = yPx(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    if (started) ctx.stroke();
  }
  strokeLine(sma5, "#cfd8e6", 1);
  strokeLine(ema20, "#3ee0ff", 1.6);
  strokeLine(ema200, "#5b8def", 1.6);

  const last = view[view.length - 1];
  const ly = yPx(last.c);
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = last.c >= last.o ? "#26a69a" : "#ef5350";
  ctx.beginPath();
  ctx.moveTo(pad.l, ly);
  ctx.lineTo(pad.l + plotW, ly);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = last.c >= last.o ? "#26a69a" : "#ef5350";
  ctx.fillRect(pad.l + plotW + 4, ly - 8, 64, 16);
  ctx.fillStyle = "#070b14";
  ctx.fillText(fmtPx(last.c, precision), pad.l + plotW + 8, ly + 4);

  ctx.fillStyle = "#8b9bb8";
  const tEvery = Math.max(1, Math.floor(view.length / 6));
  view.forEach((b, i) => {
    if (i % tEvery !== 0 && i !== view.length - 1) return;
    const x = pad.l + i * step + step / 2;
    ctx.fillText(istStamp(b.time).split(",")[1]?.trim() || istStamp(b.time), x - 22, h - 8);
  });

  if (hover != null && view[hover]) {
    const b = view[hover];
    const x = pad.l + hover * step + step / 2;
    ctx.strokeStyle = "rgba(207,216,230,0.45)";
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + plotH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.l, yPx(b.c));
    ctx.lineTo(pad.l + plotW, yPx(b.c));
    ctx.stroke();
  }
}

export default function LiveCandleChart({ candles = [], height = 520, livePrice, precision = 2 }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const [size, setSize] = useState({ w: 800, h: height });
  const [hover, setHover] = useState(null);
  const bars = useMemo(() => toBars(candles, livePrice), [candles, livePrice]);

  useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(() => {
      const w = box.current?.clientWidth || 800;
      setSize({ w, h: height });
    });
    ro.observe(box.current);
    setSize({ w: box.current.clientWidth || 800, h: height });
    return () => ro.disconnect();
  }, [height]);

  const view = useMemo(() => {
    const maxBars = Math.max(40, Math.floor((size.w - 82) / 6));
    return bars.slice(-maxBars);
  }, [bars, size.w]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.max(1, Math.floor(size.w * dpr));
    el.height = Math.max(1, Math.floor(size.h * dpr));
    el.style.width = `${size.w}px`;
    el.style.height = `${size.h}px`;
    drawChart(el, view, hover, precision);
  }, [view, size, hover, precision]);

  function onMove(e) {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect || !view.length) return;
    const x = e.clientX - rect.left - 10;
    const plotW = Math.max(10, rect.width - 82);
    const i = Math.min(view.length - 1, Math.max(0, Math.floor((x / plotW) * view.length)));
    setHover(i);
  }

  const tip = hover != null ? view[hover] : null;

  return (
    <div ref={box} className="am-chart" style={{ height }}>
      <canvas
        ref={canvas}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      />
      {tip ? (
        <div className="am-chart-tip">
          <div>{istStamp(tip.time)} IST</div>
          <div>
            O {fmtPx(tip.o, precision)} · H {fmtPx(tip.h, precision)} · L {fmtPx(tip.l, precision)} · C {fmtPx(tip.c, precision)}
          </div>
          <div>Vol {fmtPx(tip.v, 0)}</div>
        </div>
      ) : null}
    </div>
  );
}
