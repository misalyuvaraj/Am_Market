import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { livePath } from "./symbols";
import {
  Activity, Bot, Brain, CandlestickChart, Flame, Globe2, Layers3,
  LineChart, Menu, Newspaper, Radar, Sparkles, Target, Wallet, Bitcoin, LayoutGrid, DollarSign, X
} from "lucide-react";
import { cls, fmt, fmtIst, livePct } from "./api";
import { useFlash, useLive } from "./hooks";
import { LanguageSelect, useT } from "./i18n";
import ChatWidget from "./ChatWidget";
import ErrorBoundary from "./ErrorBoundary";

const links = [
  { to: "/", key: "nav.desk", icon: Activity },
  { to: "/live", key: "nav.live", icon: CandlestickChart },
  { to: "/markets", key: "nav.markets", icon: Globe2 },
  { to: "/forex", key: "nav.forex", icon: DollarSign },
  { to: "/option-chain", key: "nav.chain", icon: Layers3 },
  { to: "/builder", key: "nav.builder", icon: Target },
  { to: "/wizard", key: "nav.wizard", icon: Sparkles },
  { to: "/easy", key: "nav.easy", icon: LayoutGrid },
  { to: "/oi", key: "nav.oi", icon: Radar },
  { to: "/heatmap", key: "nav.heatmap", icon: Flame },
  { to: "/screener", key: "nav.screener", icon: LineChart },
  { to: "/technicals", key: "nav.technicals", icon: LineChart },
  { to: "/ml", key: "nav.ml", icon: Brain },
  { to: "/fiidii", key: "nav.fiidii", icon: Wallet },
  { to: "/news", key: "nav.news", icon: Newspaper },
  { to: "/btc", key: "nav.btc", icon: Bitcoin },
  { to: "/copilot", key: "nav.copilot", icon: Bot }
];

function Chip({ label, node, symbol }) {
  const pct = livePct(node);
  const flash = useFlash(node?.price);
  if (node?.price == null) return null;
  const body = (
    <>
      <b>{label}</b>
      <span className="mono">{fmt(node.price, node.digits ?? 2)}</span>
      <span className={`mono pct-live ${cls(pct)} ${flash}`}>
        {pct >= 0 ? "+" : ""}{fmt(pct, 2)}%
      </span>
    </>
  );
  if (!symbol) return <div className={`ticker-chip ${flash}`}>{body}</div>;
  return (
    <Link to={livePath(symbol)} className={`ticker-chip ${flash}`} title={`Open ${label} live chart`}>
      {body}
    </Link>
  );
}

export default function Layout() {
  const { tickers, connected, now, ageSec } = useLive();
  const t = useT();
  const session = tickers?.session;
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <button
        type="button"
        className={`nav-backdrop ${navOpen ? "show" : ""}`}
        aria-label="Close menu"
        onClick={() => setNavOpen(false)}
      />
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="logo">AM</div>
          <div>
            <h1>Am Market</h1>
            <p>{t("brand.tag")}</p>
          </div>
          <button type="button" className="btn ghost nav-close" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <nav className="nav">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon size={16} /> {t(l.key)}
              </NavLink>
            );
          })}
        </nav>
        <div className="session-pill">
          <LanguageSelect />
          <div style={{ marginTop: 10 }}><span className={`dot ${connected ? "live" : "off"}`} />{connected ? t("session.live") : t("session.reconnect")}</div>
          <div className="mono" style={{ marginTop: 8, fontSize: 12 }}>{fmtIst(now)}</div>
          <div className="muted">{t("session.cash")}: {session?.state || "…"}</div>
          <div className="muted">{t("session.quote")}: {ageSec == null ? "…" : `${ageSec}${t("session.ago")}`}</div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button type="button" className="btn ghost nav-toggle" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Menu size={18} />
          </button>
          <div className="tape">
            <Chip label="NIFTY" node={tickers?.nifty} symbol="NIFTY" />
            <Chip label="SENSEX" node={tickers?.sensex} symbol="SENSEX" />
            <Chip label="BANKNIFTY" node={tickers?.banknifty} symbol="BANKNIFTY" />
            <Chip label="GIFT" node={tickers?.giftnifty} />
            <Chip label="VIX" node={tickers?.vix} symbol="INDIAVIX" />
            <Chip label="USDINR" node={tickers?.usdInr} symbol="USDINR" />
            <Chip label="EURUSD" node={tickers?.eurusd} symbol="EURUSD" />
            <Chip label="BTC" node={tickers?.btc} symbol="BTCUSD" />
          </div>
        </div>
        <ErrorBoundary title={t("err.title")} retry={t("err.retry")}>
          <Outlet context={{ tickers, connected, now, ageSec }} />
        </ErrorBoundary>
        <ChatWidget />
      </div>
    </div>
  );
}
