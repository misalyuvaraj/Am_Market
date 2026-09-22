import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api, cls, fmt, livePct } from "../api";
import { useFlash } from "../hooks";
import TradeChart from "../TradeChart";
import { CHART_SYMBOLS, TFS, livePath, symbolSpec, tickerFor } from "../symbols";
import { useT } from "../i18n";

export default function LiveAction() {
  const { tickers, ageSec } = useOutletContext();
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

  useEffect(() => {
    if (!routeSymbol) navigate(livePath("NIFTY"), { replace: true });
  }, [routeSymbol, navigate]);

  useEffect(() => {
    let on = true;
    let seq = 0;
    setPack(null);
    async function load() {
      const id = ++seq;
      try {
        const data = await api(`/api/candles/${symbol}?range=${tfSpec.range}&interval=${tfSpec.id}`).catch(() =>
          api(`/api/chart/${symbol}?range=${tfSpec.range}&interval=${tfSpec.id}`)
        );
        if (on && id === seq) {
          setPack(data);
          setErr("");
        }
      } catch (e) {
        if (on && id === seq) setErr(e.message);
      }
    }
    load();
    const timer = setInterval(load, tf === "1m" ? 3000 : 8000);
    return () => {
      on = false;
      clearInterval(timer);
    };
  }, [symbol, tf, tfSpec.range, tfSpec.id]);

  const price = live?.price ?? pack?.price;
  const tape = useRef({ key: "", t: 0, h: null, l: null });
  const candles = useMemo(() => {
    const rows = (pack?.candles || []).map((c) => ({ ...c }));
    const px = Number(price);
    if (!rows.length || !Number.isFinite(px)) return rows;
    const last = rows[rows.length - 1];
    const key = `${symbol}:${tf}`;
    if (tape.current.key !== key || tape.current.t !== last.t) tape.current = { key, t: last.t, h: px, l: px };
    tape.current.h = Math.max(tape.current.h, px);
    tape.current.l = Math.min(tape.current.l, px);
    last.c = px;
    last.h = Math.max(Number(last.h) || px, tape.current.h);
    last.l = Math.min(Number(last.l) || px, tape.current.l);
    return rows;
  }, [pack, price, symbol, tf]);
  const last = candles.at(-1);
  const pct = livePct(live) ?? pack?.changePct;
  const digits = spec.digits;
  const vol = last?.v;
  const bars = pack?.candles?.length || 0;
  const [chartH, setChartH] = useState(540);
  useEffect(() => {
    const fit = () => {
      const w = window.innerWidth;
      setChartH(w < 720 ? 520 : w < 1100 ? 620 : 680);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="page">
      <div className="row">
        <div>
          <h2>{t("live.title")}</h2>
          <p className="sub">{t("live.sub")}</p>
        </div>
      </div>

      <div className="card">
        <div className="chips" style={{ marginBottom: 10 }}>
          {CHART_SYMBOLS.map((s) => (
            <button
              key={s.id}
              className={`chip ${symbol === s.id ? "on" : ""}`}
              onClick={() => navigate(livePath(s.id))}
            >
              {s.label}
            </button>
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
            {" · "}{tf} · {bars} bars
            {ageSec != null ? ` · streaming ${ageSec}s` : ""}
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          {t("live.hint")}
        </div>
        {err ? <div className="err">{err}</div> : null}
        <TradeChart
          symbol={spec.label}
          interval={tf}
          candles={candles}
          livePrice={price}
          change={live?.change}
          changePct={pct}
          height={chartH}
          precision={digits}
        />
      </div>
    </div>
  );
}
