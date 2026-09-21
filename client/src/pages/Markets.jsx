import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useApi } from "../hooks";
import { api, cls, fmt } from "../api";
import { PriceChart, Spark } from "../Charts";
import { livePath } from "../symbols";
import { useT } from "../i18n";

export default function Markets() {
  const { tickers } = useOutletContext();
  const t = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useState("NSE");
  const [sym, setSym] = useState("RELIANCE");
  const [quote, setQuote] = useState(null);
  const nifty = useApi("/api/nifty50", [], { refreshMs: 8000 });
  const btc = useApi("/api/btc", [], { refreshMs: 5000 });

  async function lookup() {
    setQuote(await api(`/api/quote/${sym}?exchange=${tab === "BSE" ? "BSE" : "NSE"}`));
  }

  return (
    <div className="page">
      <div>
        <h2>{t("markets.title")}</h2>
        <p className="sub">{t("markets.sub")}</p>
      </div>
      <div className="chips">
        {["NSE", "BSE", "FOREX", "BTC"].map((ex) => (
          <button key={ex} className={`chip ${tab === ex ? "on" : ""}`} onClick={() => setTab(ex)}>{ex}</button>
        ))}
      </div>
      {tab === "FOREX" ? (
        <div className="card scroll">
          <h3>Live FX</h3>
          <table>
            <thead><tr><th className="left">Pair</th><th>LTP</th><th>Chg%</th><th>High</th><th>Low</th></tr></thead>
            <tbody>
              {(tickers?.forex || []).map((p) => (
                <tr key={p.symbol} className="row-link" onClick={() => navigate(livePath(p.symbol))}>
                  <td className="left"><b>{p.name}</b></td>
                  <td className="mono">{fmt(p.price, p.digits ?? 4)}</td>
                  <td className={`mono ${cls(p.changePct)}`}>{fmt(p.changePct, 2)}%</td>
                  <td className="mono">{fmt(p.high, p.digits ?? 4)}</td>
                  <td className="mono">{fmt(p.low, p.digits ?? 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab !== "BTC" ? (
        <>
          <div className="card row">
            <input className="field" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} placeholder="RELIANCE" />
            <button className="btn" onClick={lookup}>{t("markets.quote")}</button>
          </div>
          {quote ? (
            <div className="grid g-2">
              {["nse", "bse"].map((k) => (
                <div className="card" key={k}>
                  <h3>{k.toUpperCase()} · {quote.symbol}</h3>
                  <div className="stat mono">{fmt(quote[k]?.price)}</div>
                  <div className={cls(quote[k]?.changePct)}>{fmt(quote[k]?.changePct)}%</div>
                  <Spark data={quote[k]?.spark || []} up={(quote[k]?.changePct || 0) >= 0} height={70} />
                </div>
              ))}
            </div>
          ) : null}
          <div className="card scroll">
            <h3>{tab} live constituents / index</h3>
            {tab === "BSE" ? (
              <div className="click-card" onClick={() => navigate(livePath("SENSEX"))} style={{ marginBottom: 12 }}>
                <div className="stat mono">{fmt(tickers?.sensex?.price)}</div>
                <p className={cls(tickers?.sensex?.changePct)}>Sensex {fmt(tickers?.sensex?.changePct)}%</p>
              </div>
            ) : null}
            <table>
              <thead><tr><th className="left">Symbol</th><th>LTP</th><th>Chg%</th><th>High</th><th>Low</th><th>Volume</th></tr></thead>
              <tbody>
                {(nifty.data || []).map((s) => (
                  <tr key={s.symbol} className="row-link" onClick={() => navigate(livePath(s.symbol))}>
                    <td className="left"><b>{s.symbol}</b><div className="muted">{s.name}</div></td>
                    <td className="mono">{fmt(s.price)}</td>
                    <td className={`mono ${cls(s.changePct)}`}>{fmt(s.changePct)}%</td>
                    <td className="mono">{fmt(s.high)}</td>
                    <td className="mono">{fmt(s.low)}</td>
                    <td className="mono">{fmt(s.volume, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="grid g-2">
          <div className="card click-card" onClick={() => navigate(livePath("BTCUSD"))}>
            <h3>Binance BTCUSDT</h3>
            <div className="stat mono">{fmt(btc.data?.live?.price)}</div>
            <div className={cls(btc.data?.live?.changePct)}>{fmt(btc.data?.live?.changePct)}%</div>
            <p className="muted">24h high {fmt(btc.data?.live?.high)} · low {fmt(btc.data?.live?.low)}</p>
            <Spark data={btc.data?.live?.spark || []} up={(btc.data?.live?.changePct || 0) >= 0} height={90} />
          </div>
          <div className="card">
            <h3>CoinGecko + INR</h3>
            <p>USD {fmt(btc.data?.gecko?.usd)} · INR {fmt(btc.data?.gecko?.inr, 0)}</p>
            <PriceChart candles={btc.data?.usd?.candles || []} />
          </div>
        </div>
      )}
    </div>
  );
}
