import { FINRA_API_BASE, BANKST_API_BASE, MAPPING_API_BASE, OPS_API_BASE, ENCORE_API_BASE, EQD_API_BASE, OUTLOOK_API_BASE } from "./config.js";
import { escapeHtml, Timer } from "./utils.js";

// ── Cloudflare Access credentials ─────────────────────────────────────────────
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

// ── Core fetch helpers ────────────────────────────────────────────────────────

export async function finraGet(path) {
  const timer = new Timer("api", `finra:${path}`);
  const res = await fetch(`${FINRA_API_BASE}${path}`, addCfAccessHeaders({ headers: { Accept: "application/json" } }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`FINRA API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function mappingGet(path) {
  const timer = new Timer("api", `mapping:${path}`);
  const res = await fetch(`${MAPPING_API_BASE}${path}`, addCfAccessHeaders({ headers: { Accept: "application/json" } }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`Mapping API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function encoreGet(path) {
  const timer = new Timer("api", `encore:${path}`);
  const res = await fetch(`${ENCORE_API_BASE}${path}`, addCfAccessHeaders({ headers: { Accept: "application/json" } }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`Encore API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function bankstGet(path) {
  const timer = new Timer("api", `bankst:${path}`);
  const res = await fetch(`${BANKST_API_BASE}${path}`, addCfAccessHeaders({ headers: { Accept: "application/json" } }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`BankSt API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function opsGet(path, label = "ops") {
  const timer = new Timer("api", `${label}:${path}`);
  const res = await fetch(`${OPS_API_BASE}${path}`, addCfAccessHeaders({ headers: { Accept: "application/json" } }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`Ops API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function outlookGet(path) {
  const timer = new Timer("api", `outlook:${path}`);
  const res = await fetch(`${OUTLOOK_API_BASE}${path}`, addCfAccessHeaders({ headers: { Accept: "application/json" } }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`Outlook API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function pipelineGet(path) {
  return opsGet(path, "pipeline");
}

export async function mandatesGet(path) {
  return opsGet(path, "mandates");
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

export async function clientRequestsGet(path) {
  return opsGet(path, "client-requests");
}

export async function researchTasksGet(path) {
  return opsGet(path, "research-tasks");
}

export async function opsPost(path, body) {
  const timer = new Timer("api", `ops:POST:${path}`);
  const res = await fetch(`${OPS_API_BASE}${path}`, addCfAccessHeaders({
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`Ops API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

export async function outlookPost(path, body) {
  const timer = new Timer("api", `outlook:POST:${path}`);
  const res = await fetch(`${OUTLOOK_API_BASE}${path}`, addCfAccessHeaders({
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  if (!res.ok) { timer.done({ status: res.status, ok: false }); throw new Error(`Outlook API ${res.status}: ${path}`); }
  const data = await res.json();
  timer.done({ status: res.status, ok: true });
  return data;
}

// ── Injected rail renderer (breaks api ↔ widgets cycle) ──────────────────────

let _renderRightRail = () => {};
export function setApiRailRenderer(fn) { _renderRightRail = fn; }

// ── Analytics: recently viewed / trending ─────────────────────────────────────

let _trendingCache = [];
export function getTrendingCache() { return _trendingCache; }

export async function loadRecentlyViewed() {
  try {
    const items = await bankstGet("/recently-viewed?limit=8");
    renderRecentlyViewed(items);
  } catch { /* API not available */ }
}

function renderRecentlyViewed(items) {
  const el = document.getElementById("recentList");
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = `<div style="color:var(--text-faint);font-size:12px;padding:4px 12px;">No recent activity</div>`;
    return;
  }
  el.innerHTML = items.map((item) => `
    <button class="recent-item"
      data-open-recent="${item.entity_id}"
      data-recent-type="${item.entity_type}"
      data-recent-label="${escapeHtml(item.entity_label || "")}">
      ${escapeHtml(item.entity_label || item.entity_id)}
    </button>
  `).join("");
}

export async function loadTrending() {
  try {
    _trendingCache = await bankstGet("/trending?hours=48&limit=8");
    _renderRightRail();
  } catch { _trendingCache = []; }
}

// ── FINRA changes cache ───────────────────────────────────────────────────────

let _finraChangesCache = null;
export function getFinraChangesCache() { return _finraChangesCache; }
export function setFinraChangesCache(v) { _finraChangesCache = v; }

// ── Firms index (for palette) ─────────────────────────────────────────────────

let _firmsIndex = [];
export function getFirmsIndex() { return _firmsIndex; }

export async function loadFirmsIndex() {
  try {
    const firms = await bankstGet("/firms");
    _firmsIndex = firms.map(f => ({
      kind: "firm",
      key: f.firm_id,
      name: f.name,
      firm_key: f.firm_key || "",
    }));
  } catch (e) {
    console.warn("[palette] could not load firms index:", e.message);
  }
}

// ── EQD Market Map ────────────────────────────────────────────────────────────

export async function eqdGet(path) {
  const timer = new Timer("api", `eqd:${path}`);
  const res = await fetch(`${EQD_API_BASE}${path}`, addCfAccessHeaders({ headers: { Accept: "application/json" } }));
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
