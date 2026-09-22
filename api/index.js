import { app } from "../server/src/index.js";

export const config = { maxDuration: 10 };

function restorePath(req) {
  const forwarded = req.headers["x-forwarded-uri"] || req.headers["x-invoke-path"] || "";
  const current = String(req.originalUrl || req.url || "/");
  let url = String(forwarded || current);
  if (!url.startsWith("/api")) {
    const path = url.startsWith("/") ? url : `/${url}`;
    url = path === "/" ? "/api" : `/api${path}`;
  }
  const q = current.includes("?") ? current.slice(current.indexOf("?")) : url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const path = url.split("?")[0];
  req.url = `${path}${q}`;
}

function restoreBody(req) {
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString("utf8");
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      req.body = {};
    }
  } else if (typeof req.body === "string") {
    try {
      req.body = req.body ? JSON.parse(req.body) : {};
    } catch {
      req.body = {};
    }
  }
}

export default function handler(req, res) {
  restorePath(req);
  restoreBody(req);
  return app(req, res);
}
