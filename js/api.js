import { FINRA_API_BASE, BANKST_API_BASE, MAPPING_API_BASE } from "./config.js";
import { escapeHtml } from "./utils.js";

// ── Core fetch helpers ────────────────────────────────────────────────────────

export async function finraGet(path) {
  const res = await fetch(`${FINRA_API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`FINRA API ${res.status}: ${path}`);
  return res.json();
}

export async function mappingGet(path) {
  const res = await fetch(`${MAPPING_API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Mapping API ${res.status}: ${path}`);
  return res.json();
}

export async function bankstGet(path) {
  const res = await fetch(`${BANKST_API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BankSt API ${res.status}: ${path}`);
  return res.json();
}

// ── Injected rail renderer (breaks api ↔ widgets cycle) ──────────────────────

let _renderRightRail = () => {};
export function setApiRailRenderer(fn) { _renderRightRail = fn; }

// ── Analytics: recently viewed / trending ─────────────────────────────────────

let _trendingCache = [];
export function getTrendingCache() { return _trendingCache; }

export function recordView(entityId, entityType, entityLabel) {
  fetch(`${BANKST_API_BASE}/viewed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entityId, entity_type: entityType, entity_label: entityLabel }),
  }).catch(() => {});
  // Refresh sidebar + trending after write lands
  setTimeout(() => {
    loadRecentlyViewed();
    loadTrending();
  }, 400);
}

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
