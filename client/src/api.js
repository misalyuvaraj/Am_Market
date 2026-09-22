export async function api(path, options = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || "";
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const fmt = (n, d = 2) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
};

export const fmtn = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (Math.abs(x) >= 1e7) return `${(x / 1e7).toFixed(2)} Cr`;
  if (Math.abs(x) >= 1e5) return `${(x / 1e5).toFixed(2)} L`;
  return x.toLocaleString("en-IN");
};

export function fmtFx(n, digits = 4) {
  return fmt(n, digits);
}

export function fmtIst(d = new Date()) {
  return new Date(d).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

export function livePct(node) {
  const n = Number(node?.priceChangePercent ?? node?.changePct);
  return Number.isFinite(n) ? n : null;
}

export function cls(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x === 0) return "";
  return x > 0 ? "up" : "down";
}

export function heatColor(pct) {
  const p = Math.max(-4, Math.min(4, Number(pct) || 0));
  if (p >= 0) {
    const a = 0.25 + p / 6;
    return `rgba(62, 227, 122, ${a})`;
  }
  const a = 0.25 + Math.abs(p) / 6;
  return `rgba(255, 93, 115, ${a})`;
}
