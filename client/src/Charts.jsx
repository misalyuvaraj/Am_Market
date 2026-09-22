import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import LiveCandleChart from "./LiveCandleChart";

export function Spark({ data = [], up = true, height = 46 }) {
  const rows = (data || []).map((c, i) => ({ i, c: Number(c) || 0 }));
  if (rows.length < 2) return <div className="muted">No tape</div>;
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <AreaChart data={rows}>
        <defs>
          <linearGradient id={up ? "upg" : "dng"} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "#3ee37a" : "#ff5d73"} stopOpacity={0.35} />
            <stop offset="100%" stopColor={up ? "#3ee37a" : "#ff5d73"} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={["dataMin", "dataMax"]} hide />
        <Area type="monotone" dataKey="c" stroke={up ? "#3ee37a" : "#ff5d73"} fill={`url(#${up ? "upg" : "dng"})`} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PnlChart({ points = [] }) {
  return (
    <ResponsiveContainer width="100%" height={280} minWidth={0}>
      <AreaChart data={points}>
        <CartesianGrid stroke="#22304c" />
        <XAxis dataKey="spot" tick={{ fill: "#8b9bb8", fontSize: 11 }} />
        <YAxis tick={{ fill: "#8b9bb8", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#10182a", border: "1px solid #22304c" }} />
        <Area type="monotone" dataKey="pnl" stroke="#3ee0ff" fill="rgba(62,224,255,0.15)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OiChart({ rows = [], atm }) {
  if (!rows.length) return <div className="muted">Waiting for live OI wall…</div>;
  const max = Math.max(...rows.map((r) => Math.max(Number(r.ceOi) || 0, Number(r.peOi) || 0)), 1);
  return (
    <div className="oi-wall">
      <div className="oi-legend">
        <span className="ce">Call OI</span>
        <span className="muted">Strike</span>
        <span className="pe">Put OI</span>
      </div>
      {rows.map((r) => (
        <div key={r.strike} className={`oi-row ${r.atm || r.strike === atm ? "atm" : ""}`}>
          <div className="oi-ce">
            <b className="mono">{Number(r.ceOi) ? Math.round(r.ceOi).toLocaleString("en-IN") : ""}</b>
            <span style={{ width: `${(Number(r.ceOi) / max) * 100}%` }} />
          </div>
          <div className="oi-strike mono">{Number(r.strike).toLocaleString("en-IN")}</div>
          <div className="oi-pe">
            <span style={{ width: `${(Number(r.peOi) / max) * 100}%` }} />
            <b className="mono">{Number(r.peOi) ? Math.round(r.peOi).toLocaleString("en-IN") : ""}</b>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PriceChart({ candles = [], livePrice }) {
  return <LiveCandleChart candles={candles} livePrice={livePrice} height={260} />;
}
