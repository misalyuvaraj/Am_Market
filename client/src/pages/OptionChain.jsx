import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, cls, fmt, fmtn } from "../api";
import { useApi } from "../hooks";
import { tickerFor } from "../symbols";
import { useT } from "../i18n";

const UND = ["NIFTY", "BANKNIFTY", "FINNIFTY", "RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "TCS", "SBIN"];

export default function OptionChain() {
  const t = useT();
  const { tickers } = useOutletContext();
  const [symbol, setSymbol] = useState("NIFTY");
  const [expiry, setExpiry] = useState("");
  const [advanced, setAdvanced] = useState(true);
  const path = `/api/option-chain?symbol=${symbol}${expiry ? `&expiry=${encodeURIComponent(expiry)}` : ""}`;
  const { data, error, loading } = useApi(path, [symbol, expiry], { refreshMs: 8000 });
  const live = tickerFor(symbol, tickers);
  const spot = live?.price ?? data?.spot;

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const px = spot || 0;
    const step = data?.step || 50;
    return all.filter((r) => Math.abs(r.strike - px) <= step * 15);
  }, [data, spot]);

  return (
    <div className="page">
      <div className="row">
        <div>
          <h2>{t("chain.title")}</h2>
          <p className="sub">{t("chain.sub")}</p>
        </div>
        <label className="muted"><input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> {t("chain.advanced")}</label>
      </div>
      <div className="chips">
        {UND.map((s) => (
          <button key={s} className={`chip ${symbol === s ? "on" : ""}`} onClick={() => { setSymbol(s); setExpiry(""); }}>{s}</button>
        ))}
      </div>
      <div className="grid g-4">
        <div className="card"><h3>{t("chain.spot")}</h3><div className="stat mono">{fmt(spot)}</div></div>
        <div className="card"><h3>{t("chain.pcr")}</h3><div className="stat mono">{data?.pcr ?? "—"}</div></div>
        <div className="card"><h3>{t("chain.maxpain")}</h3><div className="stat mono">{fmt(data?.maxPain, 0)}</div></div>
        <div className="card"><h3>{t("chain.atmiv")}</h3><div className="stat mono">{fmt(data?.atmIv)}%</div></div>
      </div>
      <div className="card row">
        <select className="field" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
          <option value="">{t("chain.front")}</option>
          {(data?.expiries || []).map((e) => <option key={e}>{e}</option>)}
        </select>
        <span className="muted">{t("chain.lot")} {data?.lot} · {t("chain.support")} {data?.support} · {t("chain.resist")} {data?.resistance}</span>
        <button className="btn ghost" onClick={() => api(path).catch(() => {})}>{t("chain.refresh")}</button>
      </div>
      {error ? <div className="err">{error}</div> : null}
      {loading ? <div className="muted">{t("chain.fetch")}</div> : null}
      <div className="card scroll">
        <table>
          <thead>
            <tr>
              {advanced ? <th>Δ</th> : null}
              {advanced ? <th>IV</th> : null}
              <th>OI</th>
              <th>CHGOI</th>
              <th>LTP</th>
              <th className="left">CALL</th>
              <th>Strike</th>
              <th className="left">PUT</th>
              <th>LTP</th>
              <th>CHGOI</th>
              <th>OI</th>
              {advanced ? <th>IV</th> : null}
              {advanced ? <th>Δ</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.strike} className={r.atm ? "atm" : ""}>
                {advanced ? <td className="mono">{fmt(r.ceDelta, 2)}</td> : null}
                {advanced ? <td className="mono">{fmt(r.ceIv, 1)}</td> : null}
                <td className="mono">{fmtn(r.ceOi)}</td>
                <td className={`mono ${cls(r.ceChgOi)}`}>{fmtn(r.ceChgOi)}</td>
                <td className="mono">{fmt(r.ceLtp)}</td>
                <td className="left muted">{r.ceItm ? "ITM" : "OTM"}</td>
                <td className="mono"><b>{fmt(r.strike, 0)}</b></td>
                <td className="left muted">{r.peItm ? "ITM" : "OTM"}</td>
                <td className="mono">{fmt(r.peLtp)}</td>
                <td className={`mono ${cls(r.peChgOi)}`}>{fmtn(r.peChgOi)}</td>
                <td className="mono">{fmtn(r.peOi)}</td>
                {advanced ? <td className="mono">{fmt(r.peIv, 1)}</td> : null}
                {advanced ? <td className="mono">{fmt(r.peDelta, 2)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
