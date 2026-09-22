import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export function useIstClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useLive() {
  const [tickers, setTickers] = useState(null);
  const [connected, setConnected] = useState(false);
  const [tickAt, setTickAt] = useState(0);
  const now = useIstClock();

  useEffect(() => {
    let ws;
    let closed = false;
    let pullSeq = 0;
    let lastSeq = 0;
    let lastTapeAt = 0;
    let lastMsg = 0;
    let socketOpen = false;
    let retryMs = 800;
    let retryTimer = 0;
    let pending = null;
    let lastPriceSig = "";
    let lastApply = 0;
    let flushTimer = 0;
    function priceSig(data) {
      if (!data) return "";
      return ["nifty", "sensex", "banknifty", "vix", "btc", "usdInr", "eurusd", "gbpusd", "usdjpy"]
        .map((k) => {
          const q = data[k] || {};
          return `${q.price ?? ""}:${q.high ?? ""}:${q.low ?? ""}:${q.bar?.v ?? ""}`;
        })
        .join("|");
    }
    function isFresh(seq, at) {
      if (at && lastTapeAt && at < lastTapeAt) return false;
      if (at && lastTapeAt && at === lastTapeAt && seq && lastSeq && seq < lastSeq) return false;
      if (!at && seq && lastSeq && seq < lastSeq) return false;
      return true;
    }
    function applyTape(next) {
      if (!next) return;
      const seq = Number(next.seq) || 0;
      const nextAt = Number(next.tapeAt) || 0;
      if (!isFresh(seq, nextAt)) return;
      if (seq) lastSeq = seq;
      if (nextAt) lastTapeAt = nextAt;
      const sig = priceSig(next);
      const same = sig && sig === lastPriceSig;
      if (sig) lastPriceSig = sig;
      if (!same) setTickers(next);
      setTickAt(nextAt || Date.now());
      setConnected(true);
    }
    function queueTape(next) {
      pending = next;
      if (flushTimer) return;
      const wait = Math.max(0, 100 - (Date.now() - lastApply));
      flushTimer = setTimeout(() => {
        flushTimer = 0;
        const data = pending;
        pending = null;
        lastApply = Date.now();
        applyTape(data);
      }, wait);
    }
    async function pull() {
      if (socketOpen && Date.now() - lastMsg < 4000) return;
      const id = ++pullSeq;
      try {
        const d = await api("/api/tickers");
        if (!closed && id === pullSeq) queueTape(d);
      } catch {
        if (!closed && id === pullSeq && !socketOpen) setConnected(false);
      }
    }
    const connect = () => {
      if (closed) return;
      const baseUrl = import.meta.env.VITE_API_URL || `${location.protocol}//${location.host}`;
      const wsUrl = String(baseUrl).replace(/^http/, "ws");
      try {
        ws = new WebSocket(`${wsUrl}/ws`);
      } catch {
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(8000, Math.round(retryMs * 1.6));
        return;
      }
      ws.onopen = () => {
        socketOpen = true;
        retryMs = 800;
        setConnected(true);
      };
      ws.onclose = () => {
        socketOpen = false;
        setConnected(false);
        if (!closed) {
          retryTimer = setTimeout(connect, retryMs);
          retryMs = Math.min(8000, Math.round(retryMs * 1.6));
        }
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          lastMsg = Date.now();
          if (msg.type === "ping") {
            const seq = Number(msg.seq) || 0;
            const at = Number(msg.tapeAt || msg.ts) || 0;
            if (!isFresh(seq, at)) return;
            if (seq) lastSeq = seq;
            if (at) lastTapeAt = Math.max(lastTapeAt, at);
            setTickAt(at || Date.now());
            setConnected(true);
            return;
          }
          if (msg.type === "tickers" && msg.data) queueTape(msg.data);
          if (msg.type === "error") setConnected(socketOpen);
        } catch {
          /* ignore malformed frames */
        }
      };
    };
    pull();
    const poll = setInterval(pull, 5000);
    connect();
    return () => {
      closed = true;
      clearInterval(poll);
      clearTimeout(flushTimer);
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return { tickers, connected, now, tickAt, ageSec: tickAt ? Math.max(0, Math.floor((now - tickAt) / 1000)) : null };
}

export function useApi(path, deps = [], extra = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let on = true;
    let inflight = false;
    setLoading(true);
    setError("");
    setData(null);
    const refreshMs = extra.refreshMs || 8000;
    async function load() {
      if (inflight) return;
      inflight = true;
      let attempt = 0;
      while (on && attempt < 3) {
        try {
          const d = await api(path);
          if (on) {
            setData(d);
            setError("");
            setLoading(false);
          }
          inflight = false;
          return;
        } catch (e) {
          attempt += 1;
          if (attempt >= 3) {
            if (on) {
              setError(e.message);
              setLoading(false);
            }
            inflight = false;
            return;
          }
          await new Promise((r) => setTimeout(r, 900 * attempt));
        }
      }
      inflight = false;
    }
    load();
    const refresh = setInterval(load, refreshMs);
    return () => {
      on = false;
      clearInterval(refresh);
    };
  }, [path, extra.refreshMs, ...deps]);
  return { data, error, loading, setData };
}

export function useFlash(value) {
  const prev = useRef(value);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (value == null || prev.current == null || value === prev.current) {
      prev.current = value;
      return;
    }
    setFlash(value > prev.current ? "tick-up" : "tick-down");
    prev.current = value;
    const t = setTimeout(() => setFlash(""), 700);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}
