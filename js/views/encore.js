import { escapeHtml } from "../utils.js";

export const ENCORE_VIEW_ID = "encore.candidates";

export function createEncoreView(encoreGet) {
  return {
    id: ENCORE_VIEW_ID,
    label: "Encore Candidates",
    section: "Intake",
    endpoint: "/api/encore/stats, /api/encore/candidates",

    load: async () => {
      const [stats, allCandidates] = await Promise.all([
        encoreGet("/stats"),
        encoreGet("/candidates"),
      ]);

      // Deduplicate: keep only the latest probe for each candidate
      const candidateMap = new Map();
      if (Array.isArray(allCandidates)) {
        for (const candidate of allCandidates) {
          const key = `${candidate.candidate_name}|${candidate.obsidian_firm}`;
          const existing = candidateMap.get(key);

          // Keep the one with the latest probe date
          if (!existing) {
            candidateMap.set(key, candidate);
          } else {
            const existingDate = new Date(existing.last_probe_at || 0);
            const newDate = new Date(candidate.last_probe_at || 0);
            if (newDate > existingDate) {
              candidateMap.set(key, candidate);
            }
          }
        }
      }

      return {
        stats: stats || {},
        candidates: Array.from(candidateMap.values()),
        filter: "all",
        query: "",
        expandedRows: new Set(),
      };
    },

    render: (data) => (data ? renderEncoreView(data) : renderLoading()),

    onStatusFilter(filter, data, rerender) {
      data.filter = filter;
      data.expandedRows.clear();
      rerender();
    },

    onSearchInput(query, data, rerender) {
      data.query = query;
      rerender();
    },

    onToggleRow(candidateName, data, rerender) {
      if (data.expandedRows.has(candidateName)) {
        data.expandedRows.delete(candidateName);
      } else {
        data.expandedRows.add(candidateName);
      }
      rerender();
    },
  };
}

function renderEncoreView(data) {
  const stats = data.stats || {};
  const allCandidates = Array.isArray(data.candidates) ? data.candidates : [];
  const filter = data.filter || "all";
  const query = (data.query || "").trim().toLowerCase();

  // Filter candidates
  let filtered = allCandidates;
  if (filter !== "all") {
    filtered = filtered.filter(c => c.encore_status === filter);
  }
  if (query) {
    filtered = filtered.filter(c => {
      const text = [
        c.candidate_name,
        c.obsidian_firm,
        c.encore_match_name,
        c.encore_match_company,
      ]
        .map(v => String(v || "").toLowerCase())
        .join(" ");
      return text.includes(query);
    });
  }

  const statsHTML = `
    <div class="cards">
      <article class="card">
        <h3>Total</h3>
        <p>${escapeHtml(String(stats.total || 0))}</p>
      </article>
      <article class="card">
        <h3>Found</h3>
        <p class="status-ok">${escapeHtml(String(stats.found || 0))}</p>
      </article>
      <article class="card">
        <h3>Possible</h3>
        <p>${escapeHtml(String(stats.possible || 0))}</p>
      </article>
      <article class="card">
        <h3>Ambiguous</h3>
        <p>${escapeHtml(String(stats.ambiguous || 0))}</p>
      </article>
      <article class="card">
        <h3>Not Found</h3>
        <p class="status-fail">${escapeHtml(String(stats.not_found || 0))}</p>
      </article>
      <article class="card">
        <h3>Needs Review</h3>
        <p>${escapeHtml(String(stats.needs_review || 0))}</p>
      </article>
      <article class="card">
        <h3>Last Probe</h3>
        <p style="font-size: 13px;">${escapeHtml(formatLastProbe(stats.last_probe))}</p>
      </article>
    </div>
  `;

  const filterButtonsHTML = `
    <div class="encore-filter-group">
      <button class="encore-filter-btn ${filter === "all" ? "is-active" : ""}" data-filter="all">All (${stats.total || 0})</button>
      <button class="encore-filter-btn ${filter === "found" ? "is-active" : ""}" data-filter="found">Found (${stats.found || 0})</button>
      <button class="encore-filter-btn ${filter === "possible" ? "is-active" : ""}" data-filter="possible">Possible (${stats.possible || 0})</button>
      <button class="encore-filter-btn ${filter === "ambiguous" ? "is-active" : ""}" data-filter="ambiguous">Ambiguous (${stats.ambiguous || 0})</button>
      <button class="encore-filter-btn ${filter === "not_found" ? "is-active" : ""}" data-filter="not_found">Not Found (${stats.not_found || 0})</button>
    </div>
  `;

  const searchHTML = `
    <div class="encore-search-row">
      <input
        type="text"
        class="encore-search-input"
        placeholder="Search candidates..."
        data-encore-search
        value="${escapeHtml(data.query || "")}"
      />
      <span class="encore-results-count">${filtered.length} shown</span>
    </div>
  `;

  const candidateRows = filtered
    .map(c => {
      const isExpanded = data.expandedRows && data.expandedRows.has(c.candidate_name);
      const statusClass = getStatusClass(c.encore_status);
      const statusLabel = getStatusLabel(c.encore_status);

      return `
        <tr class="candidate-row ${isExpanded ? "is-expanded" : ""}" data-encore-candidate="${escapeHtml(c.candidate_name)}">
          <td class="candidate-name-cell">
            <button class="toggle-btn" data-encore-toggle="${escapeHtml(c.candidate_name)}" type="button">
              <span class="toggle-icon">${isExpanded ? "▼" : "▶"}</span>
              <span>${escapeHtml(c.candidate_name)}</span>
            </button>
          </td>
          <td>${escapeHtml(c.obsidian_firm || "—")}</td>
          <td><span class="status-pill status-pill--${statusClass}">${escapeHtml(statusLabel)}</span></td>
          <td>${escapeHtml(c.encore_match_name || "—")}</td>
          <td>${escapeHtml(c.encore_match_company || "—")}</td>
        </tr>
        ${isExpanded ? `
          <tr class="detail-row">
            <td colspan="5">
              <div class="detail-content">
                <div class="detail-section">
                  <h4>Match Details</h4>
                  <dl class="detail-list">
                    <dt>Title:</dt>
                    <dd>${escapeHtml(c.encore_match_title || "—")}</dd>
                    <dt>GUID:</dt>
                    <dd><code>${escapeHtml(c.encore_guid || "—")}</code></dd>
                    <dt>Last Probe:</dt>
                    <dd>${escapeHtml(formatDate(c.last_probe_at))}</dd>
                    <dt>Sync Status:</dt>
                    <dd>${escapeHtml(c.sync_status || "pending")}</dd>
                  </dl>
                </div>
              </div>
            </td>
          </tr>
        ` : ""}
      `;
    })
    .join("");

  const tableHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Candidate Name</th>
            <th>Obsidian Firm</th>
            <th>Status</th>
            <th>Match Name</th>
            <th>Match Company</th>
          </tr>
        </thead>
        <tbody>
          ${candidateRows || `<tr><td colspan="5" class="empty-cell">No candidates match filter</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  return `
    ${statsHTML}
    ${filterButtonsHTML}
    ${searchHTML}
    ${tableHTML}
  `;
}

function renderLoading() {
  return `<div class="loading">Loading Encore candidates...</div>`;
}

function getStatusClass(status) {
  const classMap = {
    found: "success",
    possible: "warning",
    ambiguous: "warning",
    not_found: "error",
    error: "error",
  };
  return classMap[status] || "info";
}

function getStatusLabel(status) {
  const labelMap = {
    found: "Found",
    possible: "Possible",
    ambiguous: "Ambiguous",
    not_found: "Not Found",
    error: "Error",
  };
  return labelMap[status] || status;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return "—";
  }
}

function formatLastProbe(dateStr) {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return "—";
  }
}
