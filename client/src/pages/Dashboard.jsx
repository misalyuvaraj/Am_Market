import { useNavigate, useOutletContext } from "react-router-dom";
import { useApi, useFlash } from "../hooks";
import { cls, fmt, livePct } from "../api";
import { Spark, PriceChart } from "../Charts";
import { livePath } from "../symbols";
import { useT } from "../i18n";

function QuoteCard({ name, node, symbol }) {
  const pct = livePct(node);
  const flash = useFlash(node?.price);
  const navigate = useNavigate();
  return (
    <div
      className={`card click-card ${flash}`}
      role="button"
      tabIndex={0}
      onClick={() => symbol && navigate(livePath(symbol))}
      onKeyDown={(e) => e.key === "Enter" && symbol && navigate(livePath(symbol))}
    >
      <h3>{name}</h3>
      <div className="stat mono">{fmt(node?.price, node?.digits ?? 2)}</div>
      <div className={`mono pct-live ${cls(pct)} ${flash}`}>
        {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${fmt(pct, 2)}%`} · {fmt(node?.change, node?.digits ?? 2)}
      </div>
      <Spark data={node?.spark || []} up={(pct || 0) >= 0} />
    </div>
  );
}

export default function Dashboard() {
  const { tickers } = useOutletContext();
  const navigate = useNavigate();
  const t = useT();
  const { data: pulse, error, loading } = useApi("/api/pulse", [], { refreshMs: 5000 });
  const newsFeed = useApi("/api/news", [], { refreshMs: 15000 });
  const niftyChart = useApi("/api/chart/NIFTY", [], { refreshMs: 4000 });
  const sensexChart = useApi("/api/chart/SENSEX", [], { refreshMs: 4000 });
  const btcChart = useApi("/api/chart/BTCUSD?range=1d&interval=5m", [], { refreshMs: 4000 });
  const usdChart = useApi("/api/chart/USDINR?range=1d&interval=2m", [], { refreshMs: 4000 });

  const cards = [
    ["Nifty 50", tickers?.nifty, "NIFTY"],
    ["Sensex", tickers?.sensex, "SENSEX"],
    ["Bank Nifty", tickers?.banknifty, "BANKNIFTY"],
    ["Bitcoin", tickers?.btc, "BTCUSD"]
  ];
  const headlines =
    (newsFeed.data?.headline?.length && newsFeed.data.headline) ||
    (newsFeed.data?.market?.length && newsFeed.data.market) ||
    (pulse?.headlines?.length && pulse.headlines) ||
    tickers?.news ||
    [];

  return (
    <div className="page">
      <div>
        <h2>{t("dash.title")}</h2>
        <p className="sub">{t("dash.sub")}</p>
      </div>
      <div className="grid g-4">
        {cards.map(([name, n, symbol]) => (
          <QuoteCard key={name} name={name} node={n} symbol={symbol} />
        ))}
      </div>
      <div className="grid g-4">
        <QuoteCard name="USD / INR" node={tickers?.usdInr} symbol="USDINR" />
        <QuoteCard name="EUR / USD" node={tickers?.eurusd} symbol="EURUSD" />
        <QuoteCard name="GBP / USD" node={tickers?.gbpusd} symbol="GBPUSD" />
        <QuoteCard name="USD / JPY" node={tickers?.usdjpy} symbol="USDJPY" />
      </div>
      <div className="grid g-2">
        <div className="card">
          <div className="row">
            <h3>{t("dash.pulse")}</h3>
            <span className={`chip ${pulse?.bias === "Bullish" ? "on" : ""}`}>{pulse?.bias || (loading ? t("dash.reading") : "…")} · {pulse?.score ?? "—"}</span>
          </div>
          <p>{pulse?.summary}</p>
          <ul>
            {(pulse?.reasons || []).map((r) => <li key={r} className="muted">{r}</li>)}
          </ul>
          {error ? <div className="err">{error}</div> : null}
          <p className="legal-line">{pulse?.disclaimer || t("legal.disclaimer")}</p>
        </div>
        <div className="card">
          <h3>{t("dash.optint")}</h3>
          <div className="grid g-2">
            <div><div className="muted">PCR</div><b className="mono">{pulse?.chain?.pcr ?? "—"}</b></div>
            <div><div className="muted">{t("dash.maxpain")}</div><b className="mono">{fmt(pulse?.chain?.maxPain, 0)}</b></div>
            <div><div className="muted">{t("dash.support")}</div><b className="mono">{fmt(pulse?.chain?.support, 0)}</b></div>
            <div><div className="muted">{t("dash.resist")}</div><b className="mono">{fmt(pulse?.chain?.resistance, 0)}</b></div>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>ATM IV {pulse?.chain?.atmIv ?? "—"} · Expiry {pulse?.chain?.expiry || "—"}</p>
        </div>
      </div>
      {pulse?.ml ? (
        <div className="card click-card" onClick={() => navigate("/ml")}>
          <div className="row">
            <h3>{t("ml.title")}</h3>
            <span className={`chip ${pulse.ml.lean === "Bullish" ? "on" : ""}`}>{pulse.ml.lean} · {pulse.ml.score} · {pulse.ml.confidence}%</span>
          </div>
          <div className="grid g-4">
            <div><div className="muted">RSI</div><b className="mono">{pulse.ml.rsi ?? "—"}</b></div>
            <div><div className="muted">MACD</div><b className="mono">{fmt(pulse.ml.macd)}</b></div>
            <div><div className="muted">{t("ml.news")}</div><b>{pulse.ml.sentiment || "—"}</b></div>
            <div><div className="muted">{t("ml.vol20")}</div><b className="mono">{fmt(pulse.ml.vol20, 1)}%</b></div>
          </div>
          <ul>
            {(pulse.ml.alerts || []).slice(0, 3).map((a) => (
              <li key={a.text} className="muted">{a.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid g-4">
        <div className="card click-card" onClick={() => navigate(livePath("NIFTY"))}><h3>{t("dash.niftyTape")}</h3><PriceChart candles={niftyChart.data?.candles || []} livePrice={tickers?.nifty?.price} /></div>
        <div className="card click-card" onClick={() => navigate(livePath("SENSEX"))}><h3>{t("dash.sensexTape")}</h3><PriceChart candles={sensexChart.data?.candles || []} livePrice={tickers?.sensex?.price} /></div>
        <div className="card click-card" onClick={() => navigate(livePath("BTCUSD"))}><h3>{t("dash.btcTape")}</h3><PriceChart candles={btcChart.data?.candles || []} livePrice={tickers?.btc?.price} /></div>
        <div className="card click-card" onClick={() => navigate(livePath("USDINR"))}><h3>{t("dash.usdinrTape")}</h3><PriceChart candles={usdChart.data?.candles || []} livePrice={tickers?.usdInr?.price} /></div>
      </div>
      <div className="grid g-2">
        <div className="card">
          <h3>{t("dash.sectors")}</h3>
          <div className="grid g-3">
            {(tickers?.sectors || []).map((s) => (
              <div key={s.name} className="heat" style={{ background: s.change >= 0 ? "rgba(62,227,122,.75)" : "rgba(255,93,115,.75)", color: "#071018" }}>
                <div>{s.name}</div>
                <div className="mono">{fmt(s.price, 2)} · {s.change >= 0 ? "+" : ""}{fmt(s.change, 2)}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>{t("dash.news")}</h3>
          {!headlines.length ? <div className="muted">{t("dash.reading")}</div> : null}
          {headlines.slice(0, 8).map((n) => (
            <div className="news-item" key={n.link || n.title}>
              <a href={n.link || "https://www.google.com/finance"} target="_blank" rel="noreferrer">{n.title}</a>
              <div className="muted">{n.source}{n.pubDate ? ` · ${new Date(n.pubDate).toLocaleTimeString("en-IN")}` : ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
