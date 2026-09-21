import { useEffect, useState } from "react";
import { api, fmt } from "../api";
import { PnlChart } from "../Charts";
import { useT } from "../i18n";

export default function StrategyBuilder() {
  const tx = useT();
  const [symbol, setSymbol] = useState("NIFTY");
  const [templates, setTemplates] = useState([]);
  const [chain, setChain] = useState(null);
  const [legs, setLegs] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [err, setErr] = useState("");
  const [id, setId] = useState("bull-call");
  const [bias, setBias] = useState("Bullish");

  useEffect(() => {
    api("/api/strategies").then(setTemplates);
  }, []);

  async function loadTemplate(tid = id) {
    setErr("");
    try {
      const data = await api("/api/strategies/template", { method: "POST", body: { symbol, id: tid } });
      setChain(data.chain);
      setLegs(data.legs);
      setAnalysis(data.analysis);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function run() {
    setErr("");
    const data = await api("/api/strategies/analyze", { method: "POST", body: { symbol, legs } });
    setAnalysis(data.analysis);
    setChain((c) => ({ ...(c || {}), spot: data.spot, lot: data.lot, expiry: data.expiry }));
  }

  function addLeg(side, type) {
    const strike = chain?.spot || 0;
    setLegs((xs) => [...xs, { type, side, strike, premium: 100, qty: 1, iv: 16 }]);
  }

  function patch(i, key, val) {
    setLegs((xs) => xs.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));
  }

  const shown = templates.filter((t) => bias === "All" || t.bias === bias);

  return (
    <div className="page">
      <div>
        <h2>{tx("builder.title")}</h2>
        <p className="sub">{tx("builder.sub")}</p>
      </div>
      <div className="chips">
        {["Bullish", "Bearish", "Neutral", "All"].map((b) => (
          <button key={b} className={`chip ${bias === b ? "on" : ""}`} onClick={() => setBias(b)}>{tx(`bias.${b.toLowerCase()}`)}</button>
        ))}
      </div>
      <div className="grid g-3">
        {shown.map((t) => (
          <button key={t.id} className={`card ${id === t.id ? "selected" : ""}`} onClick={() => { setId(t.id); loadTemplate(t.id); }}>
            <b>{t.name}</b>
            <div className="muted">{t.bias} · {t.risk}</div>
            <p className="muted">{t.description}</p>
          </button>
        ))}
      </div>
      <div className="card row">
        <select className="field" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {["NIFTY", "BANKNIFTY", "FINNIFTY", "RELIANCE", "HDFCBANK"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="btn" onClick={() => loadTemplate()}>{tx("builder.load")}</button>
        <button className="btn ghost" onClick={() => addLeg("buy", "CE")}>{tx("builder.buyce")}</button>
        <button className="btn ghost" onClick={() => addLeg("sell", "PE")}>{tx("builder.sellpe")}</button>
        <button className="btn" onClick={run}>{tx("builder.analyse")}</button>
      </div>
      {err ? <div className="err">{err}</div> : null}
      <div className="grid g-2">
        <div className="card">
          <h3>{tx("builder.legs")} · {tx("chain.spot")} {fmt(chain?.spot)} · {tx("chain.lot")} {chain?.lot} · {chain?.expiry}</h3>
          {legs.map((l, i) => (
            <div className="row" key={i} style={{ marginBottom: 8 }}>
              <select className="field" value={l.side} onChange={(e) => patch(i, "side", e.target.value)}><option>buy</option><option>sell</option></select>
              <select className="field" value={l.type} onChange={(e) => patch(i, "type", e.target.value)}><option>CE</option><option>PE</option></select>
              <input className="field" type="number" value={l.strike} onChange={(e) => patch(i, "strike", Number(e.target.value))} />
              <input className="field" type="number" value={l.premium} onChange={(e) => patch(i, "premium", Number(e.target.value))} />
              <input className="field" type="number" value={l.qty} onChange={(e) => patch(i, "qty", Number(e.target.value))} />
              <button className="btn ghost" onClick={() => setLegs(legs.filter((_, x) => x !== i))}>x</button>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>{tx("builder.payoff")}</h3>
          <PnlChart points={analysis?.points || []} />
          <div className="grid g-2">
            <div>{tx("builder.maxprofit")} <b className="up mono">{fmt(analysis?.maxProfit, 0)}</b></div>
            <div>{tx("builder.maxloss")} <b className="down mono">{fmt(analysis?.maxLoss, 0)}</b></div>
            <div>{tx("builder.pop")} <b>{analysis?.pop}%</b></div>
            <div>Net {analysis?.netCredit >= 0 ? tx("builder.credit") : tx("builder.debit")} <b className="mono">{fmt(analysis?.netCredit, 0)}</b></div>
            <div>Delta {fmt(analysis?.greeks?.delta)}</div>
            <div>Theta {fmt(analysis?.greeks?.theta)}</div>
            <div>Vega {fmt(analysis?.greeks?.vega)}</div>
            <div>BE {analysis?.breakevens?.join(", ") || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
