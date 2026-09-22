import { useEffect, useState } from "react";
import { api, fmt } from "../api";
import { PnlChart } from "../Charts";
import { useT } from "../i18n";

export function Wizard() {
  const t = useT();
  const [view, setView] = useState("bullish");
  const [symbol, setSymbol] = useState("NIFTY");
  const [target, setTarget] = useState(1.2);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setErr("");
    setBusy(true);
    try {
      setData(await api("/api/wizard", { method: "POST", body: { symbol, view, targetPct: Number(target) } }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    run();
  }, [symbol, view]);

  return (
    <div className="page">
      <div>
        <h2>{t("wizard.title")}</h2>
        <p className="sub">{t("wizard.sub")}</p>
      </div>
      <div className="card grid g-4">
        <select className="field" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {["NIFTY", "BANKNIFTY", "FINNIFTY"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="field" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="bullish">{t("bias.bullish")}</option>
          <option value="bearish">{t("bias.bearish")}</option>
          <option value="neutral">{t("wizard.range")}</option>
        </select>
        <input className="field" type="number" step="0.1" value={target} onChange={(e) => setTarget(e.target.value)} />
        <button className="btn" onClick={run} disabled={busy}>{busy ? t("dash.reading") : t("wizard.build")}</button>
      </div>
      {busy && !data ? <div className="muted">{t("dash.reading")}</div> : null}
      {err ? <div className="err">{err}</div> : null}
      {(data?.ideas || []).map((idea) => (
        <div className="card" key={idea.id}>
          <div className="row"><h3>{idea.name}</h3><span className="chip on">{idea.bias}</span></div>
          <p className="muted">{idea.description}</p>
          <PnlChart points={idea.analysis?.points || []} />
          <div className="legend">{t("builder.maxprofit")} {fmt(idea.analysis.maxProfit, 0)} · {t("builder.maxloss")} {fmt(idea.analysis.maxLoss, 0)} · {t("builder.pop")} {idea.analysis.pop}%</div>
        </div>
      ))}
    </div>
  );
}

export function EasyOptions() {
  const t = useT();
  const [direction, setDirection] = useState("up");
  const [symbol, setSymbol] = useState("NIFTY");
  const [data, setData] = useState(null);

  async function run() {
    setData(await api("/api/easy-options", { method: "POST", body: { symbol, direction } }));
  }

  return (
    <div className="page">
      <div>
        <h2>{t("easy.title")}</h2>
        <p className="sub">{t("easy.sub")}</p>
      </div>
      <div className="chips">
        {["NIFTY", "BANKNIFTY", "SENSEX"].map((s) => (
          <button key={s} className={`chip ${symbol === s ? "on" : ""}`} onClick={() => setSymbol(s)}>{s}</button>
        ))}
      </div>
      <div className="grid g-2">
        <button className={`card ${direction === "up" ? "selected" : ""}`} onClick={() => setDirection("up")}>
          <h3>{t("easy.up")}</h3>
          <p className="muted">{t("easy.upHint")}</p>
        </button>
        <button className={`card ${direction === "down" ? "selected" : ""}`} onClick={() => setDirection("down")}>
          <h3>{t("easy.down")}</h3>
          <p className="muted">{t("easy.downHint")}</p>
        </button>
      </div>
      <button className="btn" onClick={run}>{t("easy.go")}</button>
      {data ? (
        <div className="card">
          <h3>{data.headline}</h3>
          <p>{data.note}</p>
          <PnlChart points={data.strategy?.analysis?.points || []} />
          <div className="legend">{t("builder.maxloss")} {fmt(data.strategy.analysis.maxLoss, 0)} · {t("builder.maxprofit")} {fmt(data.strategy.analysis.maxProfit, 0)}</div>
        </div>
      ) : null}
    </div>
  );
}
