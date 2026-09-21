import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api, cls, fmt, livePct } from "../api";
import { useFlash } from "../hooks";
import LiveCandleChart from "../LiveCandleChart";
import { CHART_SYMBOLS, TFS, livePath, symbolSpec, tickerFor } from "../symbols";
import { useT } from "../i18n";

export default function LiveAction() {
  const { tickers } = useOutletContext();
  const t = useT();
  const { symbol: routeSymbol } = useParams();
  const navigate = useNavigate();
  const symbol = String(routeSymbol || "NIFTY").toUpperCase();
  const [tf, setTf] = useState("5m");
  const [pack, setPack] = useState(null);
  const [err, setErr] = useState("");
  const spec = symbolSpec(symbol);
  const live = tickerFor(symbol, tickers);
  const flash = useFlash(live?.price || pack?.price);
  const tfSpec = TFS.find((t) => t.id === tf) || TFS[1];
  const groups = useMemo(() => [...new Set(CHART_SYMBOLS.map((s) => s.group))], []);

  useEffect(() => {
    if (!routeSymbol) navigate(livePath("NIFTY"), { replace: true });
  }, [routeSymbol, navigate]);

  useEffect(() => {
    let on = true;
    setPack(null);
    async function load() {
      try {
        const data = await api(`/api/candles/${symbol}?range=${tfSpec.range}&interval=${tfSpec.id}`).catch(() =>
          api(`/api/chart/${symbol}?range=${tfSpec.range}&interval=${tfSpec.id}`)
        );
        if (on) {
          setPack(data);
          setErr("");
        }
      } catch (e) {
        if (on) setErr(e.message);
      }
    }
    load();
    const id = setInterval(load, tf === "1m" ? 2500 : 4000);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [symbol, tf, tfSpec.range, tfSpec.id]);

  const last = pack?.candles?.at(-1);
  const price = live?.price ?? pack?.price;
  const pct = livePct(live) ?? pack?.changePct;
  const digits = spec.digits;
  const vol = last?.v;
  const bars = pack?.candles?.length || 0;

  return (
    <div className="page">
      <div className="row">
        <div>
          <h2>{t("live.title")}</h2>
          <p className="sub">{t("live.sub")}</p>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          {groups.map((g) => (
            <span key={g} className="chips">
              {CHART_SYMBOLS.filter((s) => s.group === g).map((s) => (
                <button
                  key={s.id}
                  className={`chip ${symbol === s.id ? "on" : ""}`}
                  onClick={() => navigate(livePath(s.id))}
                >
                  {s.label}
                </button>
              ))}
            </span>
          ))}
        </div>
        <div className="chips" style={{ marginBottom: 12 }}>
          {TFS.map((t) => (
            <button key={t.id} className={`chip ${tf === t.id ? "on" : ""}`} onClick={() => setTf(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className={`row ${flash}`} style={{ marginBottom: 8 }}>
          <div>
            <b>{spec.label}</b>
            <span className="mono stat" style={{ marginLeft: 12 }}>{fmt(price, digits)}</span>
            <span className={`mono pct-live ${cls(pct)}`} style={{ marginLeft: 8 }}>
              {pct >= 0 ? "+" : ""}{fmt(pct, 2)}%
            </span>
          </div>
          <div className="muted mono" style={{ fontSize: 12 }}>
            O {fmt(last?.o, digits)} · H {fmt(last?.h, digits)} · L {fmt(last?.l, digits)} · C {fmt(last?.c || price, digits)}
            {" · Vol "}{fmt(vol, 0)}
            {" · live "}{tf} · {bars} bars
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          {t("live.hint")}
        </div>
        {err ? <div className="err">{err}</div> : null}
        <LiveCandleChart candles={pack?.candles || []} livePrice={price} height={540} precision={digits} />
      </div>
    </div>
  );
}
