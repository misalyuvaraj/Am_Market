import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useApi } from "../hooks";
import { fmt, fmtn, heatColor, cls } from "../api";
import { OiChart } from "../Charts";
import { tickerFor } from "../symbols";
import { useT } from "../i18n";

export function OILab() {
  const t = useT();
  const { tickers } = useOutletContext();
  const [symbol, setSymbol] = useState("NIFTY");
  const { data, error, loading } = useApi(`/api/oi?symbol=${symbol}`, [symbol], { refreshMs: 8000 });
  const ready = String(data?.symbol || "").toUpperCase() === symbol;
  const rows = ready ? (data.buildup?.length ? data.buildup : data.rows || []) : [];
  const live = tickerFor(symbol, tickers);
  const spot = live?.price ?? (ready ? data?.spot : null);
  return (
    <div className="page">
      <div>
        <h2>{t("oi.title")}</h2>
        <p className="sub">{t("oi.sub")}</p>
      </div>
      <div className="chips">
        {["NIFTY", "BANKNIFTY", "FINNIFTY"].map((s) => (
          <button key={s} className={`chip ${symbol === s ? "on" : ""}`} onClick={() => setSymbol(s)}>{s}</button>
        ))}
      </div>
      {loading || !ready ? <div className="muted">{t("oi.loading")} {symbol}</div> : null}
      {error ? <div className="err">{symbol}: {error}</div> : null}
      <div className="grid g-4">
        <div className="card"><h3>{symbol} {t("oi.spot")}</h3><div className="stat mono">{spot != null ? fmt(spot) : "—"}</div></div>
        <div className="card"><h3>{t("oi.pcr")}</h3><div className="stat mono">{ready ? data?.pcr ?? "—" : "—"}</div></div>
        <div className="card"><h3>{t("oi.maxpain")}</h3><div className="stat mono">{ready ? fmt(data?.maxPain, 0) : "—"}</div></div>
        <div className="card"><h3>{t("oi.atm")}</h3><div className="stat mono">{ready ? fmt(data?.atm, 0) : "—"}</div></div>
      </div>
      <div className="card">
        <div className="row">
          <h3>{symbol} {t("oi.wall")} · {ready ? data?.expiry || "—" : "…"}</h3>
          <span className="muted">{ready ? data?.bias : loading ? t("dash.reading") : ""}</span>
        </div>
        <p className="muted">
          {ready
            ? `${t("oi.callOi")} ${fmtn(data?.ceOi)} · ${t("oi.putOi")} ${fmtn(data?.peOi)} · ${t("chain.support")} ${fmt(data?.support, 0)} · ${t("chain.resist")} ${fmt(data?.resistance, 0)}`
            : t("oi.waiting")}
        </p>
        <OiChart rows={rows} atm={data?.atm} />
      </div>
      <div className="card scroll">
        <h3>{symbol} {t("oi.buildup")}</h3>
        <table>
          <thead><tr><th>Strike</th><th>{t("oi.callOi")}</th><th>{t("oi.putOi")}</th><th>Call ΔOI</th><th>Put ΔOI</th><th>Call build</th><th>Put build</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.strike} className={r.atm || r.strike === data?.atm ? "atm" : ""}>
                <td className="mono">{fmt(r.strike, 0)}</td>
                <td className="mono">{fmtn(r.ceOi)}</td>
                <td className="mono">{fmtn(r.peOi)}</td>
                <td className={`mono ${cls(r.ceChgOi)}`}>{fmtn(r.ceChgOi)}</td>
                <td className={`mono ${cls(r.peChgOi)}`}>{fmtn(r.peChgOi)}</td>
                <td>{r.callBuild || "—"}</td>
                <td>{r.putBuild || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !loading ? <div className="muted" style={{ padding: 12 }}>No {symbol} strike data yet. NSE sometimes rate-limits — click the chip again in a few seconds.</div> : null}
      </div>
    </div>
  );
}

export function Heatmap() {
  const t = useT();
  const { data } = useApi("/api/heatmap", [], { refreshMs: 8000 });
  return (
    <div className="page">
      <div><h2>{t("heat.title")}</h2><p className="sub">{t("heat.sub")}</p></div>
      <div className="grid g-4">
        {(data?.stocks || []).map((s) => (
          <div key={s.symbol} className="heat" style={{ background: heatColor(s.changePct), color: "#071018" }}>
            <div>{s.symbol}<div className="muted" style={{ color: "#071018" }}>{s.sector}</div></div>
            <div className="mono">{fmt(s.price)} · {fmt(s.changePct)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Screener() {
  const t = useT();
  const { data } = useApi("/api/screener", [], { refreshMs: 8000 });
  const [q, setQ] = useState("");
  const rows = (data || []).filter((s) => s.symbol.includes(q.toUpperCase()) || s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <div><h2>{t("screen.title")}</h2><p className="sub">{t("screen.sub")}</p></div>
      <input className="field" placeholder={t("screen.filter")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card scroll">
        <table>
          <thead><tr><th className="left">Stock</th><th>LTP</th><th>Chg%</th><th>Day pos</th><th>Volume</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.symbol}>
                <td className="left">{s.symbol}<div className="muted">{s.name}</div></td>
                <td className="mono">{fmt(s.price)}</td>
                <td className={`mono ${cls(s.changePct)}`}>{fmt(s.changePct)}%</td>
                <td>{fmt(s.rangePct, 0)}%</td>
                <td>{fmtn(s.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
