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
    let wsFails = 0;
    async function pull() {
      try {
        const d = await api("/api/tickers");
        if (!closed) {
          setTickers(d);
          setTickAt(Date.now());
          setConnected(true);
        }
      } catch {
        if (!closed) setConnected(false);
      }
    }
    const connect = () => {
      if (closed || wsFails >= 2) return;
      const baseUrl = import.meta.env.VITE_API_URL || `${location.protocol}//${location.host}`;
      const wsUrl = String(baseUrl).replace(/^http/, "ws");
      try {
        ws = new WebSocket(`${wsUrl}/ws`);
      } catch {
        wsFails += 1;
        return;
      }
      ws.onopen = () => {
        wsFails = 0;
        setConnected(true);
      };
      ws.onclose = () => {
        wsFails += 1;
        if (!closed && wsFails < 2) setTimeout(connect, 2500);
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
          if (msg.type === "tickers") {
            setTickers(msg.data);
            setTickAt(msg.ts || Date.now());
          }
          if (msg.type === "btc") {
            setTickers((prev) => (prev ? { ...prev, btc: msg.data } : prev));
            setTickAt(msg.ts || Date.now());
          }
        } catch {
          /* ignore */
        }
      };
    };
    pull();
    const poll = setInterval(pull, 3000);
    connect();
    return () => {
      closed = true;
      clearInterval(poll);
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
