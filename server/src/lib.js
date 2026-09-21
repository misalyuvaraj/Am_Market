import { UA } from "./universe.js";

const store = new Map();

export function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = Promise.resolve()
    .then(fn)
    .then((data) => {
      store.set(key, { at: Date.now(), value: Promise.resolve(data) });
      return data;
    })
    .catch((err) => {
      if (hit) return hit.value;
      throw err;
    });
  store.set(key, { at: Date.now(), value });
  return value;
}

export async function getJson(url, extra = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en-IN,en;q=0.9",
        ...extra.headers
      },
      ...extra
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`HTTP ${res.status} ${url}`);
      err.status = res.status;
      err.body = text.slice(0, 200);
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function getText(url, extra = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml,application/xml,text/xml,*/*",
        "Accept-Language": "en-IN,en;q=0.9",
        ...extra.headers
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.text();
  } finally {
    clearTimeout(t);
  }
}

export function parseRss(xml, limit = 40) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks.slice(0, limit)) {
    const title = decode(pick(block, "title"));
    const href = (block.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const link = decode(pick(block, "link") || href || pick(block, "guid") || pick(block, "id"));
    const source = decode(pick(block, "source") || pick(block, "dc:creator")) || host(link);
    const pubDate = pick(block, "pubDate") || pick(block, "published") || pick(block, "updated");
    const description = strip(decode(pick(block, "description") || pick(block, "summary") || pick(block, "content:encoded")));
    if (title) items.push({ title, link, source, pubDate, description, live: true });
  }
  return items;
}

function pick(xml, tag) {
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"));
  if (cdata) return cdata[1].trim();
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return plain ? plain[1].trim() : "";
}

function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function strip(s = "") {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "News";
  }
}

export function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function pct(now, prev) {
  if (!prev) return 0;
  return ((now - prev) / prev) * 100;
}

export function round(n, d = 2) {
  const p = 10 ** d;
  return Math.round((Number(n) || 0) * p) / p;
}

export function istNow() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export function marketSession() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const mins = Number(map.hour) * 60 + Number(map.minute);
  const weekend = map.weekday === "Sat" || map.weekday === "Sun";
  const open = !weekend && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
  const pre = !weekend && mins >= 9 * 60 && mins < 9 * 60 + 15;
  return {
    open,
    pre,
    weekend,
    state: weekend ? "weekend" : open ? "open" : pre ? "pre-open" : "closed",
    ist: istNow()
  };
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch {
        out[idx] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
