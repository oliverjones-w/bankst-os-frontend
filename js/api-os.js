/**
 * api-os.js — exports added to api.js after Cloudflare cached the old version.
 * Imported by app-os.js so the cached api.js isn't a blocker.
 */
import { Timer } from "./utils.js";

const OPS_API_BASE = window.APP_CONFIG?.OPS_API_BASE || "/api/ops";
const EQD_API_BASE = window.APP_CONFIG?.EQD_API_BASE || "/api/eqd";
const REFS_API_BASE = window.APP_CONFIG?.REFS_API_BASE || "/api/refs";

const CF_ACCESS_CLIENT_ID = "ea0a06998d94b1d895952de84a6bd423.access";
const CF_ACCESS_CLIENT_SECRET = "e7df0dde86ef9d6988f4723b273dce62e465330d982e34018802d25d64b57454";

function addCfAccessHeaders(opts = {}) {
  return {
    ...opts,
    headers: {
      ...opts.headers,
      "CF-Access-Client-Id": CF_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": CF_ACCESS_CLIENT_SECRET,
    },
  };
}

export async function mandatesPatch(path, body) {
  const timer = new Timer("api", `mandates:PATCH:${path}`);
  const res = await fetch(`${OPS_API_BASE}${path}`, addCfAccessHeaders({
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-idempotency-key": body.request_id,
    },
    body: JSON.stringify(body),
  }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`Ops API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function opsPost(path, body, queryParams = {}) {
  const timer = new Timer("api", `ops:POST:${path}`);
  let url = `${OPS_API_BASE}${path}`;

  // Append query parameters if provided
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== null && value !== undefined && value !== "") {
      searchParams.append(key, value);
    }
  }
  if (searchParams.toString()) {
    url += `?${searchParams.toString()}`;
  }

  const res = await fetch(url, addCfAccessHeaders({
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`Ops API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function eqdGet(path) {
  const timer = new Timer("api", `eqd:${path}`);
  const res = await fetch(`${EQD_API_BASE}${path}`, addCfAccessHeaders({ headers: { Accept: "application/json" } }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`EQD API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function eqdPatch(path, body) {
  const timer = new Timer("api", `eqd:PATCH:${path}`);
  const res = await fetch(`${EQD_API_BASE}${path}`, addCfAccessHeaders({
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`EQD API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function eqdPost(path, body) {
  const timer = new Timer("api", `eqd:POST:${path}`);
  const res = await fetch(`${EQD_API_BASE}${path}`, addCfAccessHeaders({
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`EQD API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

// Refs API — canonical firm directory. The gateway injects x-refs-api-token, so
// no token is needed client-side. This is the ONLY canonical firm source.
export async function refsGet(path) {
  const timer = new Timer("api", `refs:${path}`);
  const res = await fetch(`${REFS_API_BASE}${path}`, addCfAccessHeaders({ headers: { Accept: "application/json" } }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`Refs API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}
