/**
 * finra.js — FINRA Monitor: real-time tracking of attorney movements.
 *
 * Displays summary stats, arrivals/departures, and a searchable/filterable
 * changelog of all detected moves (firm-to-firm, to inactive, reactivated).
 */

import { escapeHtml } from "../utils.js";

export const FINRA_VIEW_ID = "finra.monitor";

export function createFinraView(finraGet) {
  return {
    id: FINRA_VIEW_ID,
    label: "FINRA Monitor",
    section: "Monitors",
    endpoint: "/api/finra/summary, /api/finra/firms/*, /api/finra/runs, /api/finra/changes",

    load: async () => {
      const [summary, arrivals, departures, runs, changes] = await Promise.all([
        finraGet("/summary"),
        finraGet("/firms/arrivals?limit=12"),
        finraGet("/firms/departures?limit=12"),
        finraGet("/runs"),
        finraGet("/changes?limit=500"),
      ]);

      return {
        summary: summary || {},
        arrivals: rowsFrom(arrivals),
        departures: rowsFrom(departures),
        runs: rowsFrom(runs),
        changes: rowsFrom(changes),
        activeFilter: "all",
        searchQuery: "",
      };
    },

    render: (data) => data ? renderRoot(data) : renderLoading(),

    handleClick(event, data, rerender) {
      // Search input handled by wireMainActions
      const filterBtn = event.target.closest("[data-finra-filter]");
      if (filterBtn) {
        data.activeFilter = filterBtn.dataset.finraFilter;
        rerender();
        return;
      }
    },
  };
}

function renderLoading() {
  return `<div class="view-wrapper"><div class="view-empty">Loading…</div></div>`;
}

function renderRoot(data) {
  const summary = data?.summary || {};
  const arrivals = Array.isArray(data?.arrivals) ? data.arrivals : [];
  const departures = Array.isArray(data?.departures) ? data.departures : [];
  const runs = Array.isArray(data?.runs) ? data.runs : [];
  const allChanges = Array.isArray(data?.changes) ? data.changes : [];
  const runCount = Number(runs.length || 0);
  const lastRun = runs[0];
  const query = (data?.searchQuery || "").trim().toLowerCase();
  const filter = data?.activeFilter || "all";

  const changes = [...allChanges].sort((a, b) => {
    const dt = finraDetectedTs(b.detected_at) - finraDetectedTs(a.detected_at);
    if (dt !== 0) return dt;
    return Number(b.id || 0) - Number(a.id || 0);
  });

  const counts = changes.reduce((acc, row) => {
    const type = finraMoveType(row);
    if (type === "to_inactive") acc.toInactive += 1;
    else acc.moved += 1;
    return acc;
  }, { toInactive: 0, moved: 0 });

  const filteredChanges = changes.filter((row) => {
    const type = finraMoveType(row);
    if (filter === "to_inactive" && type !== "to_inactive") return false;
    if (filter === "moved" && type === "to_inactive") return false;
    if (!query) return true;
    const text = [
      row.name,
      row.finra_id,
      row.old_status,
      row.new_status,
    ].map((v) => String(v || "").toLowerCase()).join(" ");
    return text.includes(query);
  });

  const arrivalDepartureRows = Array.from({ length: Math.max(arrivals.length, departures.length, 1) })
    .map((_, index) => {
      const left = arrivals[index];
      const right = departures[index];
      return `
        <tr>
          <td>${escapeHtml(toText(left?.firm))}</td>
          <td>${escapeHtml(toText(left?.count))}</td>
          <td>${escapeHtml(toText(right?.firm))}</td>
          <td>${escapeHtml(toText(right?.count))}</td>
        </tr>
      `;
    })
    .join("");

  const moveRows = filteredChanges
    .map((row) => {
      const moveType = finraMoveType(row);
      const moveTypeLabel = finraMoveTypeLabel(moveType);
      const destinationStatus = finraStatusClass(row.new_status);
      const destinationLabel = destinationStatus === "inactive" ? "Inactive" : "Moved";

      return `
        <tr class="finra-move-row">
          <td class="finra-name">${escapeHtml(toText(row.name))}</td>
          <td class="finra-id">${escapeHtml(toText(row.finra_id))}</td>
          <td class="finra-former">${escapeHtml(toText(row.old_status))}</td>
          <td class="finra-current">
            <div class="finra-current-cell">
              <span>${escapeHtml(toText(row.new_status))}</span>
              <span class="finra-pill finra-pill--${destinationStatus}">${escapeHtml(destinationLabel)}</span>
            </div>
          </td>
          <td class="finra-move-type"><span class="finra-pill finra-pill--${moveType}">${escapeHtml(moveTypeLabel)}</span></td>
          <td class="finra-detected">${escapeHtml(finraDateLabel(row.detected_at))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="view-wrapper finra-view">
      <!-- Summary Stats -->
      <div class="finra-stats">
        <article class="finra-stat-card"><h3>Tracked</h3><p>${escapeHtml(toText(summary.total))}</p></article>
        <article class="finra-stat-card"><h3>Active</h3><p class="status-ok">${escapeHtml(toText(summary.active))}</p></article>
        <article class="finra-stat-card"><h3>Inactive</h3><p class="status-fail">${escapeHtml(toText(summary.inactive))}</p></article>
        <article class="finra-stat-card"><h3>Changes</h3><p>${escapeHtml(toText(summary.total_changes))}</p></article>
        <article class="finra-stat-card"><h3>Runs</h3><p>${escapeHtml(String(runCount))}</p></article>
        <article class="finra-stat-card"><h3>Last Run</h3><p>${escapeHtml(finraDateLabel(lastRun?.completed_at || lastRun?.run_at))}</p></article>
      </div>

      <!-- Arrivals / Departures -->
      <div class="finra-section">
        <h4 class="finra-section-header">Arrivals / Departures (Top 12)</h4>
        <div class="table-wrap">
          <table class="data-table finra-table">
            <thead>
              <tr>
                <th>Arrivals</th>
                <th style="text-align: right;">Count</th>
                <th>Departures</th>
                <th style="text-align: right;">Count</th>
              </tr>
            </thead>
            <tbody>${arrivalDepartureRows}</tbody>
          </table>
        </div>
      </div>

      <!-- Search & Filter Controls -->
      <div class="finra-section">
        <div class="finra-controls">
          <input
            type="text"
            data-finra-search
            class="finra-search-input"
            value="${escapeHtml(data?.searchQuery || "")}"
            placeholder="Search name, FINRA ID, former/current firm…"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="finra-filter-group">
            <button class="finra-filter-btn${filter === "all" ? " is-active" : ""}" data-finra-filter="all">All · ${changes.length}</button>
            <button class="finra-filter-btn${filter === "to_inactive" ? " is-active" : ""}" data-finra-filter="to_inactive">To Inactive · ${counts.toInactive}</button>
            <button class="finra-filter-btn${filter === "moved" ? " is-active" : ""}" data-finra-filter="moved">Moved · ${counts.moved}</button>
          </div>
          <span class="finra-results-count">${filteredChanges.length.toLocaleString()} shown</span>
        </div>

        <!-- Moves Table -->
        <div class="table-wrap">
          <table class="data-table finra-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>FINRA ID</th>
                <th>Former Firm</th>
                <th>Current Firm / Status</th>
                <th>Move Type</th>
                <th>Detected</th>
              </tr>
            </thead>
            <tbody>
              ${moveRows || `<tr><td colspan="6" style="color: var(--text-faint); padding: 12px 14px;">No moves match the current search/filter.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function rowsFrom(data) {
  if (!data) return [];
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data)) return data;
  return [];
}

function toText(value) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  return String(value);
}

function finraDetectedTs(value) {
  if (!value) return 0;
  const ts = Date.parse(String(value).replace(" ", "T"));
  return Number.isFinite(ts) ? ts : 0;
}

function finraDateLabel(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || "-";
  return date.toLocaleDateString("en-CA");
}

function finraMoveType(row) {
  const oldStatus = String(row?.old_status || "").toUpperCase();
  const newStatus = String(row?.new_status || "").toUpperCase();
  if (newStatus.includes("INACTIVE")) return "to_inactive";
  if (oldStatus.includes("INACTIVE")) return "reactivated";
  return "firm_to_firm";
}

function finraMoveTypeLabel(type) {
  if (type === "to_inactive") return "To Inactive";
  if (type === "reactivated") return "Reactivated";
  return "Firm-to-Firm";
}

function finraStatusClass(status) {
  const value = String(status || "").toUpperCase();
  return value.includes("INACTIVE") ? "inactive" : "moved";
}
