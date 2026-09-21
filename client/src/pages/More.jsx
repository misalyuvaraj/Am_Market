import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useApi } from "../hooks";
import { cls, fmt, fmtn, livePct } from "../api";
import { PriceChart } from "../Charts";
import { useT } from "../i18n";

export function Technicals() {
  const t = useT();
  const [symbol, setSymbol] = useState("NIFTY");
  const { data, error } = useApi(`/api/technicals/${symbol}`, [symbol], { refreshMs: 5000 });
  return (
    <div className="page">
      <div>
        <h2>{t("tech.title")}</h2>
        <p className="sub">{t("tech.sub")}</p>
      </div>
      <div className="chips">
        {["NIFTY", "BANKNIFTY", "SENSEX", "BTCUSD", "USDINR", "EURUSD", "RELIANCE"].map((s) => (
          <button key={s} className={`chip ${symbol === s ? "on" : ""}`} onClick={() => setSymbol(s)}>{s}</button>
        ))}
      </div>
      {error ? <div className="err">{error}</div> : null}
      <div className="grid g-4">
        <div className="card"><h3>{t("tech.bias")}</h3><div className="stat">{data?.bias}</div></div>
        <div className="card"><h3>{t("tech.rsi")}</h3><div className="stat mono">{data?.rsi ?? "—"}</div></div>
        <div className="card"><h3>SMA20</h3><div className="stat mono">{fmt(data?.sma20)}</div></div>
        <div className="card"><h3>SMA200</h3><div className="stat mono">{fmt(data?.sma200)}</div></div>
        <div className="card"><h3>MACD</h3><div className={`stat mono ${cls(data?.macd)}`}>{fmt(data?.macd)}</div></div>
      </div>
      <div className="card"><PriceChart candles={data?.candles || []} /></div>
      <div className="card">
        {(data?.signals || []).map((s) => (
          <div key={s.name} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span>{s.name}</span>
            <b className={s.bias === "bullish" ? "up" : s.bias === "bearish" ? "down" : ""}>{s.bias}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Fiidii() {
  const t = useT();
  const { data, error, loading } = useApi("/api/fiidii", [], { refreshMs: 30000 });
  const d = data?.daily || {};
  const fii = d.fii || {};
  const dii = d.dii || {};
  const regime = data?.participants?.regime || {};
  const gauges = data?.participants?.gauges || {};
  const fragility = data?.participants?.fragility || {};
  const divergence = data?.participants?.divergence || {};
  const coverage = data?.participants?.coverage || {};
  const cohorts = Array.isArray(data?.participants?.cohortTable)
    ? data.participants.cohortTable
    : Object.values(data?.participants?.cohortTable || {});
  const outlooks = Array.isArray(data?.outlook?.indices) ? data.outlook.indices : [];

  return (
    <div className="page">
      <div>
        <h2>{t("fii.title")}</h2>
        <p className="sub">
          {t("fii.sub")} {d.date || regime.date || "—"}.
          {coverage.days ? ` ${coverage.days}` : ""}
        </p>
      </div>
      {loading && !data ? <div className="muted">{t("fii.loading")}</div> : null}
      {error ? <div className="err">{error}</div> : null}
      <div className="grid g-2">
        <FlowCard title="FII (₹ Cr)" node={fii} />
        <FlowCard title="DII (₹ Cr)" node={dii} />
      </div>
      <div className="card">
        <h3>{t("fii.regime")}</h3>
        <p>{regime.regime || "Waiting for the other-side feed."}</p>
        <div className="muted">
          FII {regime.fii_stance || "—"} · Retail {regime.retail_stance || "—"} · {divergence.state || regime.divergence_state || "—"}
          {" · "}{t("fii.asof")}{" "}{data?.participants?.asOf || d.date || "—"}
        </div>
        <div className="grid g-4" style={{ marginTop: 14 }}>
          <div>
            <div className="muted">FII cash 20d</div>
            <b className={`mono ${cls(regime.fii_cash_20d)}`}>{fmt(regime.fii_cash_20d)}</b>
          </div>
          <div>
            <div className="muted">FII idx fut net</div>
            <b className={`mono ${cls(regime.fii_idx_fut_net)}`}>{fmt(regime.fii_idx_fut_net, 0)}</b>
          </div>
          <div>
            <div className="muted">Fragility</div>
            <b>{fragility.label || regime.fragility_label || "—"}</b>
            <div className="muted mono">{fmt(fragility.pctl || regime.fragility_pctl, 1)} pctl</div>
          </div>
          <div>
            <div className="muted">Retail put short</div>
            <b className="mono">{fmt(regime.client_put_short_net, 0)}</b>
          </div>
        </div>
      </div>
      <div className="grid g-4">
        {["fii", "dii", "pro", "client"].map((k) => {
          const g = gauges[k];
          if (!g) return null;
          return (
            <div className="card" key={k}>
              <h3>{g.cohort} idx futures</h3>
              <div className={`stat mono ${cls(g.idxFutNet)}`}>{fmt(g.idxFutNet, 0)}</div>
              <p className="muted">Long {fmt(g.idxFutLong, 0)} · Short {fmt(g.idxFutShort, 0)}</p>
              <p className="muted">Pctl {fmt(g.pctl, 1)} · Δ day {fmt(g.deltaDay, 0)}</p>
            </div>
          );
        })}
      </div>
      <div className="card scroll">
        <h3>Cohort positioning</h3>
        <table>
          <thead>
            <tr>
              <th className="left">Cohort</th>
              <th>Idx long</th>
              <th>Idx short</th>
              <th>Idx net</th>
              <th>Net long calls</th>
              <th>Net short puts</th>
              <th>Stk fut net</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((r) => (
              <tr key={r.cohort}>
                <td className="left"><b>{r.cohort}</b></td>
                <td className="mono">{fmt(r.idxFutLong, 0)}</td>
                <td className="mono">{fmt(r.idxFutShort, 0)}</td>
                <td className={`mono ${cls(r.idxFutNet)}`}>{fmt(r.idxFutNet, 0)}</td>
                <td className={`mono ${cls(r.netLongCalls)}`}>{fmt(r.netLongCalls, 0)}</td>
                <td className={`mono ${cls(r.netShortPuts)}`}>{fmt(r.netShortPuts, 0)}</td>
                <td className={`mono ${cls(r.stkFutNet)}`}>{fmt(r.stkFutNet, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {outlooks.length ? (
        <div className="grid g-2">
          {outlooks.slice(0, 4).map((o) => (
            <div className="card" key={o.meta?.key || o.meta?.label}>
              <h3>{o.meta?.label || o.meta?.key}</h3>
              <div className="stat mono">{fmt(o.snapshot?.close)}</div>
              <p>{o.regime?.summary || "—"}</p>
              <p className="muted">
                RSI {fmt(o.indicators?.rsi14, 1)} · week {fmt(o.snapshot?.weekReturn, 2)}% · YTD {fmt(o.snapshot?.ytdReturn, 2)}%
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FlowCard({ title, node }) {
  const net = Number(node?.netValue);
  const buy = Number(node?.buyValue);
  const sell = Number(node?.sellValue);
  const tot = Math.abs(buy) + Math.abs(sell) || 1;
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className={`stat mono ${cls(net)}`}>{fmt(net)}</div>
      <p className="muted">Buy {fmt(buy)} · Sell {fmt(sell)}</p>
      <div className="flow-bar">
        <span style={{ width: `${(Math.abs(buy) / tot) * 100}%` }} className="flow-buy" />
        <span style={{ width: `${(Math.abs(sell) / tot) * 100}%` }} className="flow-sell" />
      </div>
    </div>
  );
}

export function News() {
  const t = useT();
  const { data } = useApi("/api/news", [], { refreshMs: 15000 });
  const tabs = [
    ["headline", t("news.desk")],
    ["market", t("news.nse")],
    ["forex", t("news.fx")],
    ["btc", t("news.btc")]
  ];
  const [tab, setTab] = useState("headline");
  const list = (data?.[tab]?.length ? data[tab] : data?.headline || data?.market || []);
  return (
    <div className="page">
      <div><h2>{t("news.title")}</h2><p className="sub">{t("news.sub")}</p></div>
      <div className="chips">
        {tabs.map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="card">
        {!list.length ? <div className="muted">{t("dash.reading")}</div> : null}
        {list.map((n) => (
          <div className="news-item" key={n.link || n.title}>
            <a href={n.link || "https://www.google.com/finance"} target="_blank" rel="noreferrer">{n.title}</a>
            <div className="muted">{n.source} · {n.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BtcLab() {
  const t = useT();
  const { data } = useApi("/api/btc", [], { refreshMs: 5000 });
  return (
    <div className="page">
      <div><h2>{t("btc.title")}</h2><p className="sub">{t("btc.sub")}</p></div>
      <div className="grid g-3">
        <div className="card"><h3>Binance</h3><div className="stat mono">{fmt(data?.live?.price)}</div><div className={cls(data?.live?.changePct)}>{fmt(data?.live?.changePct)}%</div></div>
        <div className="card"><h3>USD</h3><div className="stat mono">{fmt(data?.gecko?.usd)}</div></div>
        <div className="card"><h3>INR</h3><div className="stat mono">{fmt(data?.gecko?.inr, 0)}</div></div>
      </div>
      <div className="card">
        <h3>{t("btc.news")}</h3>
        {(data?.news || []).slice(0, 12).map((n) => (
          <div className="news-item" key={n.link}><a href={n.link} target="_blank" rel="noreferrer">{n.title}</a></div>
        ))}
      </div>
    </div>
  );
}

export function Copilot() {
  const t = useT();
  const { tickers } = useOutletContext();
  const pulse = useApi("/api/pulse", [], { refreshMs: 5000 });
  const ml = useApi("/api/ml/NIFTY", [], { refreshMs: 5000 });
  const engines = useApi("/api/ai/engines", [], { refreshMs: 120000 });
  const newsFeed = useApi("/api/news", [], { refreshMs: 15000 });
  const d = pulse.data;
  const m = ml.data;
  const headlines =
    (newsFeed.data?.headline?.length && newsFeed.data.headline) ||
    (newsFeed.data?.market?.length && newsFeed.data.market) ||
    (d?.headlines?.length && d.headlines) ||
    tickers?.news ||
    [];
  const quotes = [
    ["NIFTY", tickers?.nifty],
    ["SENSEX", tickers?.sensex],
    ["BANKNIFTY", tickers?.banknifty],
    ["VIX", tickers?.vix]
  ];

  return (
    <div className="page">
      <div>
        <h2>{t("copilot.title")}</h2>
        <p className="sub">{t("copilot.sub")}</p>
      </div>
      <div className="legal-banner">{d?.disclaimer || engines.data?.disclaimer || t("legal.disclaimer")}</div>
      <div className="grid g-4">
        {quotes.map(([name, node]) => {
          const pct = livePct(node);
          return (
            <div className="card" key={name}>
              <h3>{name}</h3>
              <div className="stat mono">{fmt(node?.price, node?.digits ?? 2)}</div>
              <div className={`mono ${cls(pct)}`}>{pct == null ? "—" : `${pct >= 0 ? "+" : ""}${fmt(pct, 2)}%`}</div>
            </div>
          );
        })}
      </div>
      <div className="grid g-4">
        <div className="card">
          <h3>{t("dash.pulse")}</h3>
          <div className={`stat ${d?.bias === "Bullish" ? "up" : d?.bias === "Bearish" ? "down" : ""}`}>{d?.bias || "—"} · {d?.score ?? "—"}</div>
          <p>{d?.summary}</p>
        </div>
        <div className="card">
          <h3>{t("dash.optint")}</h3>
          <p>PCR <b className="mono">{d?.chain?.pcr ?? "—"}</b> · {t("dash.maxpain")} <b className="mono">{fmt(d?.chain?.maxPain, 0)}</b></p>
          <p className="muted">{t("chain.support")} {fmt(d?.chain?.support, 0)} · {t("chain.resist")} {fmt(d?.chain?.resistance, 0)}</p>
        </div>
        <div className="card">
          <h3>RSI / MACD</h3>
          <p>RSI <b className="mono">{m?.technicals?.rsi ?? d?.ml?.rsi ?? "—"}</b></p>
          <p>MACD <b className="mono">{fmt(m?.technicals?.macd ?? d?.ml?.macd)}</b></p>
        </div>
        <div className="card">
          <h3>{t("ml.history")}</h3>
          <p>{t("ml.lastVol")} <b className="mono">{fmtn(m?.history?.lastVolume)}</b></p>
          <p className="muted">{m?.history?.volumeBias || "—"}</p>
        </div>
      </div>
      <div className="grid g-2">
        <div className="card">
          <h3>{t("ml.trend")} / {t("ml.risk")}</h3>
          <p>{m?.trend?.summary}</p>
          <p className="muted">{m?.risk?.summary}</p>
          <p className="muted">VIX {fmt(tickers?.vix?.price)} ({fmt(livePct(tickers?.vix))}%)</p>
        </div>
        <div className="card">
          <h3>{t("dash.news")}</h3>
          {!headlines.length ? <div className="muted">{t("dash.reading")}</div> : null}
          {headlines.slice(0, 8).map((n) => (
            <div className="news-item" key={n.link || n.title}>
              <a href={n.link || "https://www.google.com/finance"} target="_blank" rel="noreferrer">{n.title}</a>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>{t("chat.title")}</h3>
        <p className="muted">{t("copilot.engines")}</p>
        <div className="chips">
          {(engines.data?.engines || []).map((e) => (
            <span key={e.id} className={`chip ${e.ready ? "on" : ""}`}>{e.label}{e.ready ? "" : " · off"}</span>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => window.dispatchEvent(new Event("am-open-chat"))}>
          {t("chat.open")}
        </button>
        <p className="legal-line">{t("copilot.keys")}</p>
      </div>
    </div>
  );
}
