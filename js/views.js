import { registerWorkspaceView, updateActiveTabState, getActiveTab, fetchingTabs, workspaceState } from "./workspace.js";
import { finraGet, bankstGet, mappingGet, setFinraChangesCache } from "./api.js";
import { escapeHtml, debounce, metaHTML } from "./utils.js";
import { entityData } from "./mock-data.js";

// ── Perf dashboard helpers ─────────────────────────────────────────────────────
function perfFrameBars(frames) {
  if (!frames.length) return `<div class="perf-empty-hint">No frame data yet — rendering activity populates this chart.</div>`;
  const last60 = frames.slice(-60);
  const maxMs  = Math.max(...last60.map(f => f.ms), 33);
  return last60.map(f => {
    const pct   = Math.min((f.ms / maxMs) * 100, 100).toFixed(1);
    const cls   = f.ms > 33 ? "perf-bar--slow" : f.ms > 16 ? "perf-bar--warn" : "perf-bar--ok";
    const label = `${f.ms}ms`;
    return `<div class="perf-frame-bar ${cls}" style="height:${pct}%" title="${label}"></div>`;
  }).join("");
}

function perfApiRows(apiEntries) {
  if (!apiEntries.length) return `<div class="perf-empty-hint">No API calls recorded yet.</div>`;
  return apiEntries.slice(-50).reverse().map(e => {
    const t   = new Date(e.t).toLocaleTimeString("en-GB", { hour12: false });
    const ms  = e.ms;
    const cls = ms > 500 ? "perf-ms--slow" : ms > 200 ? "perf-ms--warn" : "perf-ms--ok";
    const ok  = e.ok === false ? `<span class="perf-badge perf-badge--error">${e.status}</span>` : `<span class="perf-badge perf-badge--ok">${e.status ?? "—"}</span>`;
    const endpoint = e.label.replace(/^(finra|mapping|bankst):/, "");
    const src  = e.label.split(":")[0];
    return `
      <div class="perf-api-row">
        <div class="perf-api-time">${t}</div>
        <div class="perf-api-src">${src}</div>
        <div class="perf-api-endpoint truncate">${escapeHtml(endpoint)}</div>
        <div class="perf-api-ms ${cls}">${ms}ms</div>
        <div>${ok}</div>
      </div>`;
  }).join("");
}

// Declared OTF files and sizes pulled from the typography/ audit
const FONT_AUDIT = [
  { file: "SF-Pro-Display-Regular.otf",      sizeKb: 5800, used: true  },
  { file: "SF-Pro-Display-RegularItalic.otf", sizeKb: 5800, used: true  },
  { file: "SF-Pro-Display-Medium.otf",        sizeKb: 6000, used: true  },
  { file: "SF-Pro-Display-Semibold.otf",      sizeKb: 6000, used: true  },
  { file: "SF-Pro-Display-Bold.otf",          sizeKb: 6000, used: true  },
  { file: "SF-Mono-Regular.otf",              sizeKb: 108,  used: true  },
  { file: "SF-Mono-RegularItalic.otf",        sizeKb: 100,  used: true  },
  { file: "SF-Mono-Medium.otf",               sizeKb: 109,  used: true  },
  { file: "SF-Mono-Semibold.otf",             sizeKb: 108,  used: true  },
];
const TOTAL_FONT_KB = FONT_AUDIT.reduce((s, f) => s + f.sizeKb, 0);
const WOFF2_EST_KB  = Math.round(TOTAL_FONT_KB * 0.35); // ~65% savings typical

function perfAssetRows() {
  return FONT_AUDIT.map(f => {
    const mb   = f.sizeKb >= 1000 ? `${(f.sizeKb / 1024).toFixed(1)} MB` : `${f.sizeKb} KB`;
    const flag = f.sizeKb >= 1000 ? `<span class="perf-badge perf-badge--warn">OTF</span>` : `<span class="perf-badge perf-badge--ok">OTF</span>`;
    return `
      <div class="perf-asset-row">
        <div class="perf-asset-name truncate">${f.file}</div>
        <div class="perf-asset-size">${mb}</div>
        <div>${flag}</div>
      </div>`;
  }).join("");
}

// ── FINRA helpers ──────────────────────────────────────────────────────────────
function finraLoadingHTML() {
  return `
    <div class="table-shell">
      <div class="table-header-grid finra-changes-compact-grid" style="padding:10px 14px;">
        ${Array(5).fill(`<div class="skeleton" style="height:10px;width:70%;"></div>`).join("")}
      </div>
      ${Array(10).fill(0).map(() => `
        <div class="table-row-grid finra-changes-compact-grid">
          <div class="skeleton skeleton-text"></div>
          <div class="skeleton skeleton-text" style="width:75%;"></div>
          <div class="skeleton skeleton-pill"></div>
          <div class="skeleton skeleton-text" style="width:55%;"></div>
          <div class="skeleton skeleton-text" style="width:65%;"></div>
        </div>
      `).join("")}
    </div>
  `;
}

function finraErrorHTML(label, msg) {
  return `<div class="table-shell view-placeholder"><span>${label}</span><p class="text-error">Error: ${msg}</p></div>`;
}

function finraStatusBadge(status) {
  const s = (status || "").toUpperCase();
  if (s.includes("INACTIVE"))
    return `<div class="status-indicator" style="color:var(--color-yellow)"><span class="status-dot dot--inactive"></span>Inactive</div>`;
  if (s.includes("NOT FOUND") || s === "")
    return `<div class="status-indicator" style="color:var(--text-faint)"><span class="status-dot dot--null"></span>N/A</div>`;
  if (s === "ERROR")
    return `<div class="status-indicator" style="color:var(--color-red)"><span class="status-dot dot--error"></span>Error</div>`;
  return `<div class="status-indicator" style="color:var(--color-green)"><span class="status-dot dot--active"></span>Active</div>`;
}

// ── Master search helper ───────────────────────────────────────────────────────
async function runMasterSearch(q) {
  const resultsEl = document.getElementById("masterSearchResults");
  const countEl   = document.getElementById("masterSearchCount");
  if (!resultsEl) return;

  if (!q.trim()) {
    resultsEl.innerHTML = `<div class="master-empty">Type to search 24,427 reference records.</div>`;
    if (countEl) countEl.textContent = "";
    return;
  }

  try {
    const params = new URLSearchParams({ q, limit: 100 });
    const data   = await bankstGet(`/master/search?${params}`);
    if (countEl) countEl.textContent = data.total.toLocaleString() + " results";

    if (!data.results.length) {
      resultsEl.innerHTML = `<div class="master-empty">No matches for "${escapeHtml(q)}"</div>`;
      return;
    }

    resultsEl.innerHTML = `
      <div class="master-table-header-grid">
        <div>Name</div><div>Firm</div><div>Title</div>
        <div>Function</div><div>Strategy</div><div>Location</div><div></div>
      </div>
      ${data.results.map(r => `
        <div class="master-table-row-grid">
          <div class="text-normal">${escapeHtml(r.Name     || "—")}</div>
          <div>${escapeHtml(r.Firm     || "—")}</div>
          <div>${escapeHtml(r.Title    || "—")}</div>
          <div>${escapeHtml(r.Function || "—")}</div>
          <div>${escapeHtml(r.Strategy || "—")}</div>
          <div>${escapeHtml(r.Location || "—")}</div>
          <div>
            <button class="toolbar-button master-import-btn"
              data-master-import="${escapeHtml(r.ID)}"
              title="Import ${escapeHtml(r.Name)} into BankSt OS">Import</button>
          </div>
        </div>
      `).join("")}
      ${data.total > 100 ? `<div class="master-empty">Showing 100 of ${data.total.toLocaleString()} — refine your search to narrow results.</div>` : ""}
    `;
  } catch (e) {
    if (resultsEl) resultsEl.innerHTML = `<div class="master-empty text-error">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ── View: people.table ─────────────────────────────────────────────────────────
registerWorkspaceView({
  id: "people.table",
  match: (tab) => tab.type === "people.table",
  toolbar: (tab) => ({
    left: [
      { id: "people.table.mode.table",    label: "Table",    active: tab.state?.mode === "table" },
      { id: "people.table.mode.timeline", label: "Timeline", active: tab.state?.mode === "timeline" },
      { id: "people.table.mode.graph",    label: "Graph",    active: tab.state?.mode === "graph" },
    ],
    right: [
      { id: "people.table.filter",  label: "Filter" },
      { id: "people.table.sort",    label: "Sort" },
      { id: "people.table.columns", label: "Columns" },
    ],
  }),
  render: (tab) => {
    const mode = tab.state?.mode || "table";
    if (mode === "timeline") return `<div class="table-shell view-placeholder"><span>People · Timeline</span><p>Timeline view coming soon.</p></div>`;
    if (mode === "graph")    return `<div class="table-shell view-placeholder"><span>People · Graph</span><p>Network graph view coming soon.</p></div>`;
    const personRow = (id, name, firm, firmId, title, strategy, location, updated) => `
      <div class="table-row-wrap">
        <div class="table-row-grid">
          <button class="cell-link" data-open-person="${id}">${name}</button>
          <div>${firmId
            ? `<button class="cell-link" data-open-firm="${firmId}">${firm}</button>`
            : firm}</div>
          <div>${title}</div>
          <div>${strategy}</div>
          <div>${location}</div>
          <div>${updated}</div>
        </div>
        <div class="row-actions">
          <button class="action-btn row-ghost-btn" data-action="log"    data-entity-id="${id}" data-entity-type="person">Log</button>
          <button class="action-btn row-ghost-btn" data-action="note"   data-entity-id="${id}" data-entity-type="person">Note</button>
          <button class="action-btn row-ghost-btn" data-action="remind" data-entity-id="${id}" data-entity-type="person">Remind</button>
        </div>
      </div>
    `;
    return `
      <div class="table-shell">
        <div class="table-header-grid">
          <div>Name</div>
          <div>Current Firm</div>
          <div>Title</div>
          <div>Strategy</div>
          <div>Location</div>
          <div>Updated</div>
        </div>
        ${personRow("david-flowerdew", "David Flowerdew", "BNP Paribas", "bnp-paribas", "Agency MBS Trader", "MBS / Rates",    "New York",     "2h ago")}
        ${personRow("kate-li",         "Kate Li",         "Fidelity",    "",             "Data Science",      "Digital Assets", "San Francisco", "Today")}
        ${personRow("liam-fox",        "Liam Fox",        "Old Mission", "",             "ETF / Indexing",    "Smart Beta",     "Chicago",       "Yesterday")}
      </div>
    `;
  },
});

// ── View: person.detail ────────────────────────────────────────────────────────
registerWorkspaceView({
  id: "person.detail",
  match: (tab) => tab.type === "person.detail",
  toolbar: (tab) => ({
    left: [
      { id: "person.detail.profile",  label: "Profile",  active: tab.state?.mode === "profile" },
      { id: "person.detail.timeline", label: "Timeline", active: tab.state?.mode === "timeline" },
      { id: "person.detail.graph",    label: "Graph",    active: tab.state?.mode === "graph" },
    ],
    right: [
      { id: "person.detail.note",     label: "Add Note" },
      { id: "person.detail.reminder", label: "Remind" },
    ],
  }),
  render: (tab) => {
    const entity = entityData[tab.entityId];
    if (!entity) return `<div class="table-shell">Person not found.</div>`;
    const mode = tab.state?.mode || "profile";
    if (mode === "timeline") return `<div class="detail-view-shell view-placeholder"><span>${entity.title} · Timeline</span><p>Career and interaction timeline coming soon.</p></div>`;
    if (mode === "graph")    return `<div class="detail-view-shell view-placeholder"><span>${entity.title} · Graph</span><p>Relationship graph coming soon.</p></div>`;
    return `
      <div class="detail-view-shell">
        <div class="detail-header">
          <div>
            <div class="detail-title">${entity.title}</div>
            <div class="detail-subtitle">${entity.subtitle}</div>
          </div>
        </div>
        <div class="meta-grid">${metaHTML(entity.meta)}</div>
        <div class="floating-section">
          <div class="floating-section-title">Notes</div>
          <p class="floating-copy">${entity.notes}</p>
        </div>
      </div>
    `;
  },
});

// ── View: firm.detail ──────────────────────────────────────────────────────────
registerWorkspaceView({
  id: "firm.detail",
  match: (tab) => tab.type === "firm.detail",
  toolbar: (tab) => ({
    left: [
      { id: "firm.detail.profile", label: "Profile", active: tab.state?.mode === "profile" },
      { id: "firm.detail.funds",   label: "Funds",   active: tab.state?.mode === "funds" },
      { id: "firm.detail.related", label: "Related", active: tab.state?.mode === "related" },
    ],
    right: [
      { id: "firm.detail.note",     label: "Add Note" },
      { id: "firm.detail.reminder", label: "Remind" },
    ],
  }),
  render: (tab) => {
    const mode   = tab.state?.mode || "profile";
    const data   = tab.state?.data;
    const entity = entityData[tab.entityId];
    const firmName = data?.name || entity?.title || tab.title || "Firm";

    if (mode === "funds")   return `<div class="detail-view-shell view-placeholder"><span>${escapeHtml(firmName)} · Funds</span><p>Fund structure and AUM view coming soon.</p></div>`;
    if (mode === "related") return `<div class="detail-view-shell view-placeholder"><span>${escapeHtml(firmName)} · Related</span><p>Related entities and network coming soon.</p></div>`;

    if (data) {
      const aliasGroup = (title, items, cls) => items.length === 0 ? "" : `
        <div class="floating-section">
          <div class="floating-section-title">${title}</div>
          <div class="alias-tag-list">
            ${items.map(a => `<span class="alias-tag ${cls}">${escapeHtml(a)}</span>`).join("")}
          </div>
        </div>
      `;
      return `
        <div class="detail-view-shell">
          <div class="detail-header">
            <div>
              <div class="detail-title">${escapeHtml(data.name)}</div>
              <div class="detail-subtitle">${data.firm_key ? `Key: ${data.firm_key}` : ""}</div>
            </div>
          </div>
          <div class="alias-stats-row">
            <span class="alias-stat"><strong>${data.aliases.length}</strong> Aliases</span>
            <span class="alias-stat"><strong>${data.platforms.length}</strong> Platforms</span>
            <span class="alias-stat"><strong>${data.blacklist.length}</strong> Blacklist</span>
          </div>
          ${aliasGroup("Aliases",   data.aliases,   "")}
          ${aliasGroup("Platforms", data.platforms, "alias-tag--platform")}
          ${aliasGroup("Blacklist", data.blacklist, "alias-tag--blacklist")}
        </div>
      `;
    }

    if (!entity) return `<div class="table-shell view-placeholder"><span>Loading…</span></div>`;
    return `
      <div class="detail-view-shell">
        <div class="detail-header">
          <div>
            <div class="detail-title">${entity.title}</div>
            <div class="detail-subtitle">${entity.subtitle}</div>
          </div>
        </div>
        <div class="meta-grid">${metaHTML(entity.meta)}</div>
        <div class="floating-section">
          <div class="floating-section-title">Notes</div>
          <p class="floating-copy">${entity.notes}</p>
        </div>
      </div>
    `;
  },
  onActivate: async (tab) => {
    if (fetchingTabs.has(tab.id)) return;
    if (tab.state?.data) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tab.entityId)) return;
    fetchingTabs.add(tab.id);
    try {
      const data = await bankstGet(`/firms/${tab.entityId}`);
      updateActiveTabState({ data }, tab.id);
    } catch (e) {
      console.error("[firm.detail] fetch failed:", e);
    } finally {
      fetchingTabs.delete(tab.id);
    }
  },
});

// ── View: firms.table ──────────────────────────────────────────────────────────
registerWorkspaceView({
  id: "firms.table",
  match: (tab) => tab.type === "firms.table",
  toolbar: () => ({
    left:  [{ id: "firms.table.mode.table", label: "Table", active: true }],
    right: [{ id: "firms.table.refresh",    label: "Refresh" }],
  }),
  render: (tab) => {
    if (tab.state?.error) return `<div class="table-shell view-placeholder"><span>Error</span><p class="text-error">${escapeHtml(tab.state.error)}</p></div>`;
    const firms = tab.state?.firms;
    if (!firms) return `
      <div class="table-shell">
        <div class="firms-table-header-grid" style="padding:12px 14px;">
          ${Array(5).fill(`<div class="skeleton" style="height:10px;width:65%;"></div>`).join("")}
        </div>
        ${Array(12).fill(0).map(() => `
          <div class="firms-table-row-grid">
            <div class="skeleton skeleton-text" style="width:80%;"></div>
            <div class="skeleton skeleton-text" style="width:60%;"></div>
            <div class="skeleton skeleton-pill"></div>
            <div class="skeleton skeleton-pill"></div>
            <div class="skeleton skeleton-pill"></div>
          </div>
        `).join("")}
      </div>
    `;
    if (!firms.length) return `<div class="table-shell view-placeholder"><span>No firms found.</span></div>`;
    return `
      <div class="table-shell">
        <div class="firms-table-header-grid">
          <div>Firm</div>
          <div>Key</div>
          <div>Aliases</div>
          <div>Platforms</div>
          <div>Blacklist</div>
        </div>
        ${firms.map(f => `
          <div class="firms-table-row-grid">
            <button class="cell-link" data-open-firm-id="${f.firm_id}" data-firm-name="${escapeHtml(f.name)}">${escapeHtml(f.name)}</button>
            <div class="text-mono text-muted">${f.firm_key || "—"}</div>
            <div>${f.alias_count    > 0 ? `<span class="count-badge">${f.alias_count}</span>`                               : `<span class="text-faint">—</span>`}</div>
            <div>${f.platform_count > 0 ? `<span class="count-badge count-badge--platform">${f.platform_count}</span>`     : `<span class="text-faint">—</span>`}</div>
            <div>${f.blacklist_count > 0 ? `<span class="count-badge count-badge--warn">${f.blacklist_count}</span>`       : `<span class="text-faint">—</span>`}</div>
          </div>
        `).join("")}
      </div>
    `;
  },
  onActivate: async (tab) => {
    if (fetchingTabs.has(tab.id)) return;
    if (tab.state?.firms) return;
    fetchingTabs.add(tab.id);
    try {
      const firms = await bankstGet("/firms");
      updateActiveTabState({ firms }, tab.id);
    } catch (e) {
      updateActiveTabState({ error: e.message }, tab.id);
    } finally {
      fetchingTabs.delete(tab.id);
    }
  },
});

// ── View: finra.monitor ────────────────────────────────────────────────────────
registerWorkspaceView({
  id: "finra.monitor",
  match: (tab) => tab.type === "finra.monitor",
  toolbar: () => ({
    left:  [],
    right: [{ id: "finra.monitor.refresh", label: "Refresh" }],
  }),
  onActivate: async (tab) => {
    if (tab.state?.data !== undefined || fetchingTabs.has(tab.id)) return;
    fetchingTabs.add(tab.id);
    try {
      const [summary, arrivals, departures, runs, changes, individuals] = await Promise.all([
        finraGet("/summary"),
        finraGet("/firms/arrivals?limit=12"),
        finraGet("/firms/departures?limit=12"),
        finraGet("/runs"),
        finraGet("/changes?limit=100"),
        finraGet("/individuals"),
      ]);
      setFinraChangesCache(changes);
      fetchingTabs.delete(tab.id);
      updateActiveTabState({ data: { summary, arrivals, departures, runs, changes, individuals }, error: null }, tab.id);
    } catch (err) {
      fetchingTabs.delete(tab.id);
      updateActiveTabState({ data: null, error: err.message }, tab.id);
    }
  },
  render: (tab) => {
    if (tab.state?.error)              return finraErrorHTML("FINRA Monitor", tab.state.error);
    if (tab.state?.data === undefined) return finraLoadingHTML();

    const { summary, arrivals, departures, runs, changes, individuals } = tab.state.data;

    const lastRun = runs?.[0];
    const lastRunLabel = lastRun?.completed_at
      ? (() => {
          const diff = Date.now() - new Date(lastRun.completed_at);
          const h = Math.floor(diff / 36e5);
          const m = Math.floor((diff % 36e5) / 6e4);
          return h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;
        })()
      : "—";

    const maxArrival   = Math.max(1, ...(arrivals  || []).map(f => f.count));
    const maxDeparture = Math.max(1, ...(departures || []).map(f => f.count));

    const lbRows = (items, maxVal, barClass = "") => (items || []).map((f, i) => `
      <div class="finra-lb-row">
        <span class="finra-lb-rank">${i + 1}</span>
        <span class="finra-lb-name" title="${escapeHtml(f.firm)}">${escapeHtml(f.firm)}</span>
        <div class="finra-lb-bar-track"><div class="finra-lb-bar-fill ${barClass}" style="width:${Math.round((f.count / maxVal) * 100)}%"></div></div>
        <span class="finra-lb-count">${f.count}</span>
      </div>
    `).join("");

    return `
      <div class="detail-view-shell" style="gap:20px;">

        <!-- Stat strip -->
        <div class="finra-stat-strip">
          <div class="finra-ssi"><span class="finra-ssi-label">Tracked</span><span class="finra-ssi-value">${summary.total ?? "—"}</span></div>
          <div class="finra-ssi finra-ssi--green"><span class="finra-ssi-label">Active</span><span class="finra-ssi-value">${summary.active ?? "—"}</span></div>
          <div class="finra-ssi finra-ssi--yellow"><span class="finra-ssi-label">Inactive</span><span class="finra-ssi-value">${summary.inactive ?? "—"}</span></div>
          <div class="finra-ssi finra-ssi--accent"><span class="finra-ssi-label">Changes Logged</span><span class="finra-ssi-value">${summary.total_changes ?? "—"}</span></div>
          <div class="finra-ssi"><span class="finra-ssi-label">Last Run</span><span class="finra-ssi-value" style="font-size:13px;padding-top:3px;">${lastRunLabel}</span></div>
        </div>

        <!-- Arrivals / Departures -->
        <div class="finra-overview-body" style="grid-template-columns:1fr 1fr;">
          <div>
            <div class="finra-section-hdr">Firm Arrivals</div>
            ${lbRows(arrivals, maxArrival)}
          </div>
          <div>
            <div class="finra-section-hdr">Departures to Inactive</div>
            ${lbRows(departures, maxDeparture, "finra-lb-bar-fill--red")}
          </div>
        </div>

        <!-- Recent changes (full width) -->
        <div>
          <div class="finra-section-hdr">Recent Changes</div>
          <div class="table-shell" style="margin-top:6px;padding:0;">
            <div class="table-header-grid finra-changes-compact-grid">
              <div>Name</div><div>From</div><div>To</div><div>Function</div><div>Detected</div>
            </div>
            ${(changes || []).slice(0, 50).length ? (changes || []).slice(0, 50).map(r => `
              <div class="table-row-grid finra-changes-compact-grid">
                <div class="truncate" style="color:var(--text-normal);font-weight:500;">${escapeHtml(r.name || "—")}</div>
                <div class="text-muted truncate" style="font-size:12px;">${escapeHtml(r.old_status || "—")}</div>
                <div>${finraStatusBadge(r.new_status)}</div>
                <div class="text-muted truncate" style="font-size:11px;">${r.function || "—"}</div>
                <div class="text-faint" style="font-family:var(--font-data);font-size:11px;">${r.detected_at?.slice(0, 10) || "—"}</div>
              </div>
            `).join("") : `<div class="table-row-grid" style="grid-column:1/-1;padding:12px;color:var(--text-faint);">No changes recorded yet.</div>`}
          </div>
        </div>

        <!-- All individuals -->
        <div>
          <div class="finra-section-hdr">Individuals (${(individuals || []).length})</div>
          <div class="table-shell" style="margin-top:6px;padding:0;">
            <div class="table-header-grid finra-individuals-grid">
              <div>Name</div><div>Firm</div><div>Status</div><div>Function</div><div>Group</div><div>Checked</div>
            </div>
            ${(individuals || []).length ? individuals.map(r => `
              <div class="table-row-grid finra-individuals-grid">
                <div class="truncate" style="color:var(--text-normal);font-weight:500;">${escapeHtml(r.name || "—")}</div>
                <div class="text-muted truncate" style="font-size:12px;" title="${escapeHtml(r.firm || "")}">${escapeHtml(r.firm || "—")}</div>
                <div>${finraStatusBadge(r.status)}</div>
                <div class="text-muted truncate" style="font-size:11px;">${r.function || "—"}</div>
                <div class="text-muted truncate" style="font-size:11px;">${r.group || "—"}</div>
                <div class="text-faint" style="font-family:var(--font-data);font-size:11px;">${r.last_checked?.slice(0, 10) || "—"}</div>
              </div>
            `).join("") : `<div class="table-row-grid" style="grid-column:1/-1;padding:12px;color:var(--text-faint);">No individuals loaded.</div>`}
          </div>
        </div>

      </div>
    `;
  },
});

// ── Shared map helpers ──────────────────────────────────────────────────────────

// Fuzzy scorer (mirrors palette.js scoreMatch — not exported there)
function fuzzyScore(query, text) {
  const q = query.trim().toLowerCase();
  const t = (text || "").toLowerCase();
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 40 : 0;
}

const HF_FIELD_ORDER = ["firm", "function", "location"];
const IR_FIELD_ORDER = ["function", "group", "firm"];

function buildAutocompleteField(key, placeholder, currentVal) {
  return `
    <div class="autocomplete-wrap${currentVal ? " has-value" : ""}" data-filter-key="${key}">
      <input class="autocomplete-input" type="text"
        placeholder="${placeholder}"
        value="${escapeHtml(currentVal || "")}"
        autocomplete="off" spellcheck="false" />
      ${currentVal ? `<button class="autocomplete-clear" tabindex="-1" title="Clear">×</button>` : ""}
      <div class="autocomplete-dropdown"></div>
    </div>`;
}

function wireAutocompleteField(wrap, options, type) {
  const input    = wrap.querySelector(".autocomplete-input");
  const dropdown = wrap.querySelector(".autocomplete-dropdown");
  const filterKey = wrap.dataset.filterKey;
  let activeIdx = -1;

  function showSuggestions(q) {
    const scored = options
      .map(opt => ({ opt, score: fuzzyScore(q, opt) }))
      .filter(x => !q || x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    if (!scored.length) { hideSuggestions(); return; }
    activeIdx = -1;
    dropdown.innerHTML = scored.map((x, i) =>
      `<div class="autocomplete-option" data-idx="${i}" data-value="${escapeHtml(x.opt)}">${escapeHtml(x.opt)}</div>`
    ).join("");
    dropdown.style.display = "block";
  }

  function hideSuggestions() { dropdown.style.display = "none"; activeIdx = -1; }

  function highlightIdx(idx) {
    const opts = dropdown.querySelectorAll(".autocomplete-option");
    opts.forEach((el, i) => el.classList.toggle("is-active", i === idx));
    activeIdx = idx;
    opts[idx]?.scrollIntoView({ block: "nearest" });
  }

  function applyValue(value) {
    input.value = value;
    hideSuggestions();
    const tab = getActiveTab();
    if (!tab) return;
    const filters = { ...(tab.state.filters || {}), [filterKey]: value || null };
    updateActiveTabState({ filters });
  }

  input.addEventListener("focus", () => showSuggestions(input.value));
  input.addEventListener("input", () => showSuggestions(input.value));
  input.addEventListener("blur",  () => setTimeout(hideSuggestions, 150));

  input.addEventListener("keydown", (e) => {
    const opts = dropdown.querySelectorAll(".autocomplete-option");
    if (e.key === "ArrowDown") {
      e.preventDefault(); highlightIdx(Math.min(activeIdx + 1, opts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); highlightIdx(Math.max(activeIdx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = activeIdx >= 0 ? opts[activeIdx] : (opts.length === 1 ? opts[0] : null);
      if (target) applyValue(target.dataset.value);
    } else if (e.key === "Tab") {
      if (dropdown.style.display !== "none" && input.value.trim()) {
        const target = activeIdx >= 0 ? opts[activeIdx] : opts[0];
        if (target) {
          e.preventDefault();
          // Store which field to focus after re-render
          const order = type === "hf.table" ? HF_FIELD_ORDER : IR_FIELD_ORDER;
          const nextKey = order[order.indexOf(filterKey) + 1] || null;
          const tab = getActiveTab();
          if (tab) tab.state._pendingFocus = nextKey;
          applyValue(target.dataset.value);
        }
      }
    } else if (e.key === "Escape") {
      hideSuggestions(); input.blur();
    }
  });

  dropdown.addEventListener("mousedown", (e) => {
    const opt = e.target.closest(".autocomplete-option");
    if (opt) { e.preventDefault(); applyValue(opt.dataset.value); }
  });

  dropdown.addEventListener("mousemove", (e) => {
    const opt = e.target.closest(".autocomplete-option");
    if (opt) highlightIdx(parseInt(opt.dataset.idx));
  });

  const clearBtn = wrap.querySelector(".autocomplete-clear");
  if (clearBtn) {
    clearBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = "";
      hideSuggestions();
      const tab = getActiveTab();
      if (!tab) return;
      const filters = { ...(tab.state.filters || {}), [filterKey]: null };
      updateActiveTabState({ filters });
    });
  }
}

function wireMapFilters(records, type) {
  const fieldMap = type === "hf.table"
    ? { firm: "firm", function: "function", location: "location" }
    : { function: "function", group: "group", firm: "current_firm" };

  document.querySelectorAll(".autocomplete-wrap[data-filter-key]").forEach(wrap => {
    const key = wrap.dataset.filterKey;
    if (!fieldMap[key]) return;
    const options = [...new Set(records.map(r => r[fieldMap[key]]).filter(Boolean))].sort();
    wireAutocompleteField(wrap, options, type);
  });

  // Focus pending field after a Tab-triggered re-render
  const tab = getActiveTab();
  if (tab?.state?._pendingFocus) {
    const pending = tab.state._pendingFocus;
    delete tab.state._pendingFocus;
    const nextInput = document.querySelector(
      `.autocomplete-wrap[data-filter-key="${pending}"] .autocomplete-input`
    );
    nextInput?.focus();
  }
}

// ── Shared map filter logic ─────────────────────────────────────────────────────

function applyMapFilters(records, query, filters, type) {
  let result = records;
  const q = (query || "").toLowerCase();
  const firmField = type === "hf.table" ? "firm" : "current_firm";
  const locField  = type === "hf.table" ? "location" : "current_location";

  if (q) {
    if (type === "hf.table") {
      result = result.filter(r =>
        [r.name, r.firm, r.title, r.function, r.strategy, r.location, r.products, r.reports_to]
          .some(v => (v || "").toLowerCase().includes(q)));
    } else {
      result = result.filter(r =>
        [r.name, r.current_firm, r.current_title, r.function, r.group, r.current_location]
          .some(v => (v || "").toLowerCase().includes(q)));
    }
  }
  if (filters?.firm)     result = result.filter(r => (r[firmField]   || "") === filters.firm);
  if (filters?.function) result = result.filter(r => (r.function     || "") === filters.function);
  if (filters?.strategy) result = result.filter(r => (r.strategy     || "") === filters.strategy);
  if (filters?.group)    result = result.filter(r => (r.group        || "") === filters.group);
  if (filters?.location) result = result.filter(r => (r[locField]    || "") === filters.location);
  return result;
}


// ── View: hf.table ─────────────────────────────────────────────────────────────

registerWorkspaceView({
  id: "hf.table",
  hasContext: true,
  match: (tab) => tab.type === "hf.table",
  toolbar: () => ({
    left:  [{ id: "hf.table.mode.table", label: "HF Map", active: true }],
    right: [
      { id: "hf.table.save-view", label: "Save View" },
      { id: "hf.table.refresh",   label: "Refresh" },
    ],
  }),
  onActivate: async (tab) => {
    if (!tab.state?.records && !fetchingTabs.has(tab.id)) {
      fetchingTabs.add(tab.id);
      try {
        const records = await mappingGet("/hf/records?limit=400");
        updateActiveTabState({ records, recordsComplete: false, error: null }, tab.id);
        const [rest, allChanges, dailyChanges] = await Promise.all([
          mappingGet("/hf/records?offset=400"),
          mappingGet("/hf/changes?limit=200"),
          mappingGet("/hf/daily-changes?days=60"),
        ]);
        updateActiveTabState({ records: [...records, ...rest], recordsComplete: true, allChanges, dailyChanges }, tab.id);
      } catch (e) {
        updateActiveTabState({ records: null, allChanges: null, error: e.message }, tab.id);
      } finally {
        fetchingTabs.delete(tab.id);
      }
    }
    const input = document.getElementById("hfSearchInput");
    if (!input) return;
    input.focus();
    input.addEventListener("input", debounce((e) => {
      const t = getActiveTab();
      if (!t) return;
      t.state.query = e.target.value;
      const results = document.getElementById("hfSearchResults");
      const count   = document.getElementById("hfSearchCount");
      if (!results) return;
      const filtered = applyMapFilters(t.state.records || [], t.state.query, t.state.filters, "hf.table");
      results.innerHTML = hfTableBody(filtered, t.state.records?.length);
      if (count) count.textContent = countLabel(filtered.length, t.state.records?.length);
    }, 200));
    const records = tab.state?.records;
    if (records) wireMapFilters(records, "hf.table");
    document.getElementById("hfFilterClear")
      ?.addEventListener("click", () => updateActiveTabState({ filters: {} }));
  },
  render: (tab) => {
    if (tab.state?.error)
      return `<div class="table-shell view-placeholder"><span>HF Map</span><p class="text-error">Error: ${escapeHtml(tab.state.error)}</p></div>`;
    const records    = tab.state?.records;
    const query      = tab.state?.query   || "";
    const filters    = tab.state?.filters || {};
    const hasFilters = Object.values(filters).some(Boolean);
    const filtered   = records ? applyMapFilters(records, query, filters, "hf.table") : null;
    const bodyHTML   = records ? hfTableBody(filtered, records.length) : skeletonGrid(9, "hf-table-grid");
    return `
      <div class="master-search-shell">
        <div class="master-search-bar">
          <input id="hfSearchInput" class="master-search-input" type="text"
            placeholder="Search ${records ? records.length.toLocaleString() : "…"} HF records…"
            value="${escapeHtml(query)}" autocomplete="off" spellcheck="false" />
          <span id="hfSearchCount" class="master-search-count">${records ? (tab.state?.recordsComplete === false ? `${records.length.toLocaleString()} records — loading more…` : countLabel(filtered?.length ?? records.length, records.length)) : ""}</span>
        </div>
        ${records ? `
        <div class="filter-bar">
          ${buildAutocompleteField("firm",     "Firm…",     filters.firm)}
          ${buildAutocompleteField("function", "Function…", filters.function)}
          ${buildAutocompleteField("location", "Location…", filters.location)}
          ${hasFilters ? `<button class="filter-clear-btn" id="hfFilterClear">Clear filters</button>` : ""}
        </div>` : ""}
        <div id="hfSearchResults" class="master-search-results">
          <div class="master-table-header-grid hf-table-grid">
            <div>Name</div><div>Firm</div><div>Title</div>
            <div>Function</div><div>Strategy</div><div>Products</div>
            <div>Location</div><div>Reports To</div><div></div>
          </div>
          ${bodyHTML}
        </div>
      </div>
    `;
  },
});

function hfTableBody(filtered, total) {
  if (!filtered?.length)
    return `<div class="master-empty">No matches for current filters.</div>`;
  return filtered.map(r => `
    <div class="master-table-row-grid hf-table-grid" data-select-map-record="${escapeHtml(r.id)}" data-map-source="hf" style="cursor:pointer;">
      <div class="truncate" style="color:var(--text-normal);font-weight:500;">${escapeHtml(r.name || "—")}</div>
      <div class="truncate">${escapeHtml(r.firm || "—")}</div>
      <div class="truncate">${escapeHtml(r.title || "—")}</div>
      <div class="truncate">${escapeHtml(r.function || "—")}</div>
      <div class="truncate">${escapeHtml(r.strategy || "—")}</div>
      <div class="truncate">${escapeHtml(r.products || "—")}</div>
      <div class="truncate">${escapeHtml(r.location || "—")}</div>
      <div class="truncate" style="color:var(--text-faint);font-size:10px;">${escapeHtml(r.reports_to || "—")}</div>
      <div>
        <button class="master-import-btn"
          data-master-import="${escapeHtml(r.id)}"
          data-map-source="hf"
          title="Import ${escapeHtml(r.name || "")} into BankSt OS">Import</button>
      </div>
    </div>
  `).join("");
}

function countLabel(filtered, total) {
  if (filtered === total) return `${total.toLocaleString()} records`;
  return `${filtered.toLocaleString()} of ${total.toLocaleString()}`;
}

// ── View: ir.table ─────────────────────────────────────────────────────────────

registerWorkspaceView({
  id: "ir.table",
  hasContext: true,
  match: (tab) => tab.type === "ir.table",
  toolbar: () => ({
    left:  [{ id: "ir.table.mode.table", label: "IR Map", active: true }],
    right: [
      { id: "ir.table.save-view", label: "Save View" },
      { id: "ir.table.refresh",   label: "Refresh" },
    ],
  }),
  onActivate: async (tab) => {
    if (!tab.state?.records && !fetchingTabs.has(tab.id)) {
      fetchingTabs.add(tab.id);
      try {
        const records = await mappingGet("/ir/records?limit=400");
        updateActiveTabState({ records, recordsComplete: false, error: null }, tab.id);
        const [rest, allChanges, dailyChanges] = await Promise.all([
          mappingGet("/ir/records?offset=400"),
          mappingGet("/ir/changes?limit=200"),
          mappingGet("/ir/daily-changes?days=60"),
        ]);
        updateActiveTabState({ records: [...records, ...rest], recordsComplete: true, allChanges, dailyChanges }, tab.id);
      } catch (e) {
        updateActiveTabState({ records: null, allChanges: null, error: e.message }, tab.id);
      } finally {
        fetchingTabs.delete(tab.id);
      }
    }
    const input = document.getElementById("irSearchInput");
    if (!input) return;
    input.focus();
    input.addEventListener("input", debounce((e) => {
      const t = getActiveTab();
      if (!t) return;
      t.state.query = e.target.value;
      const results = document.getElementById("irSearchResults");
      const count   = document.getElementById("irSearchCount");
      if (!results) return;
      const filtered = applyMapFilters(t.state.records || [], t.state.query, t.state.filters, "ir.table");
      results.innerHTML = irTableBody(filtered, t.state.records?.length);
      if (count) count.textContent = countLabel(filtered.length, t.state.records?.length);
    }, 200));
    const records = tab.state?.records;
    if (records) wireMapFilters(records, "ir.table");
    document.getElementById("irFilterClear")
      ?.addEventListener("click", () => updateActiveTabState({ filters: {} }));
  },
  render: (tab) => {
    if (tab.state?.error)
      return `<div class="table-shell view-placeholder"><span>IR Map</span><p class="text-error">Error: ${escapeHtml(tab.state.error)}</p></div>`;
    const records    = tab.state?.records;
    const query      = tab.state?.query   || "";
    const filters    = tab.state?.filters || {};
    const hasFilters = Object.values(filters).some(Boolean);
    const filtered   = records ? applyMapFilters(records, query, filters, "ir.table") : null;
    const bodyHTML   = records ? irTableBody(filtered, records.length) : skeletonGrid(9, "ir-table-grid");
    return `
      <div class="master-search-shell">
        <div class="master-search-bar">
          <input id="irSearchInput" class="master-search-input" type="text"
            placeholder="Search ${records ? records.length.toLocaleString() : "…"} IR records…"
            value="${escapeHtml(query)}" autocomplete="off" spellcheck="false" />
          <span id="irSearchCount" class="master-search-count">${records ? (tab.state?.recordsComplete === false ? `${records.length.toLocaleString()} records — loading more…` : countLabel(filtered?.length ?? records.length, records.length)) : ""}</span>
        </div>
        ${records ? `
        <div class="filter-bar">
          ${buildAutocompleteField("function", "Function…", filters.function)}
          ${buildAutocompleteField("group",    "Group…",    filters.group)}
          ${buildAutocompleteField("firm",     "Firm…",     filters.firm)}
          ${hasFilters ? `<button class="filter-clear-btn" id="irFilterClear">Clear filters</button>` : ""}
        </div>` : ""}
        <div id="irSearchResults" class="master-search-results">
          <div class="master-table-header-grid ir-table-grid">
            <div>Name</div><div>Current Firm</div><div>Title</div>
            <div>Function</div><div>Group</div><div>Joined</div>
            <div title="Linked HF record">HF</div><div title="Has note"></div><div></div>
          </div>
          ${bodyHTML}
        </div>
      </div>
    `;
  },
});

function skeletonGrid(cols, gridClass) {
  return Array(14).fill(0).map(() => `
    <div class="master-table-row-grid ${gridClass}">
      ${Array(cols).fill(`<div class="skeleton skeleton-text"></div>`).join("")}
    </div>
  `).join("");
}

function irTableBody(filtered, total) {
  if (!filtered?.length)
    return `<div class="master-empty">No matches for current filters.</div>`;
  return filtered.map(r => {
    const joined = r.date_joined && r.date_joined !== "Pending"
      ? r.date_joined.slice(0, 7)
      : (r.date_joined || "—");
    return `
    <div class="master-table-row-grid ir-table-grid" data-select-map-record="${escapeHtml(r.id)}" data-map-source="ir" style="cursor:pointer;">
      <div class="truncate" style="color:var(--text-normal);font-weight:500;">${escapeHtml(r.name || "—")}</div>
      <div class="truncate">
        ${r.current_firm
          ? `<button class="cell-link" data-open-ir-firm="${escapeHtml(r.current_firm)}">${escapeHtml(r.current_firm)}</button>`
          : "—"}
      </div>
      <div class="truncate">${escapeHtml(r.current_title || "—")}</div>
      <div class="truncate">${escapeHtml(r.function || "—")}</div>
      <div class="truncate">${escapeHtml(r.group || "—")}</div>
      <div style="font-family:var(--font-data);font-size:10px;color:var(--text-faint);">${escapeHtml(joined)}</div>
      <div>${r.hf_id
        ? `<button class="hfid-link" data-open-hf-record="${escapeHtml(r.hf_id)}" title="Open HF Map record">HF↗</button>`
        : ""}</div>
      <div>${r.note ? `<span class="note-indicator" title="${escapeHtml(r.note)}"></span>` : ""}</div>
      <div>
        <button class="master-import-btn"
          data-master-import="${escapeHtml(r.id)}"
          data-map-source="ir"
          title="Import ${escapeHtml(r.name || "")} into BankSt OS">Import</button>
      </div>
    </div>
  `}).join("");
}

// ── IR Firm composition helpers ────────────────────────────────────────────────

const DONUT_COLORS = [
  "#0073ff", "#22c55e", "#d4a017", "#8b7dff",
  "#ff8a3d", "#21b3ff", "#ef4444", "#06b6d4",
  "#a78bfa", "#f59e0b", "#10b981", "#ec4899",
];

function svgDonut(entries, size = 110) {
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (!total) return "";
  const MAX = 8;
  let segs = entries.slice(0, MAX);
  const otherCount = entries.slice(MAX).reduce((s, [, n]) => s + n, 0);
  if (otherCount > 0) segs = [...segs, ["Other", otherCount]];

  const cx = size / 2, cy = size / 2;
  const r = size * 0.36, sw = size * 0.18;
  const circ = 2 * Math.PI * r;
  let cum = 0;

  const arcs = segs.map(([, count], i) => {
    const pct  = count / total;
    const dash = pct * circ;
    const rot  = (cum / total) * 360 - 90;
    cum += count;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke-width="${sw}"
      stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}"
      transform="rotate(${rot.toFixed(2)} ${cx} ${cy})" />`;
  }).join("\n");

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;flex-shrink:0;">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${sw}" />
    ${arcs}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle"
      style="font-size:${Math.round(size * 0.16)}px;font-family:var(--font-data);fill:var(--text-normal);font-weight:600;">${total}</text>
    <text x="${cx}" y="${cy + 9}" text-anchor="middle"
      style="font-size:${Math.round(size * 0.1)}px;font-family:var(--font-interface);fill:var(--text-faint);">total</text>
  </svg>`;
}

function donutLegend(entries, total) {
  const MAX = 8;
  const shown = entries.slice(0, MAX);
  const otherCount = entries.slice(MAX).reduce((s, [, n]) => s + n, 0);
  let rows = shown.map(([label, count], i) => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]};"></span>
      <span class="legend-label">${escapeHtml(label)}</span>
      <span class="legend-pct">${Math.round(count / total * 100)}%</span>
      <span class="legend-count">${count}</span>
    </div>`).join("");
  if (otherCount > 0) rows += `
    <div class="legend-row">
      <span class="legend-dot" style="background:var(--text-faint);opacity:0.4;"></span>
      <span class="legend-label" style="color:var(--text-faint);">Other</span>
      <span class="legend-pct" style="color:var(--text-faint);">${Math.round(otherCount / total * 100)}%</span>
      <span class="legend-count" style="color:var(--text-faint);">${otherCount}</span>
    </div>`;
  return `<div class="donut-legend">${rows}</div>`;
}

function groupTable(entries) {
  if (!entries.length) return `<p style="color:var(--text-faint);font-size:11px;">No data.</p>`;
  const max = entries[0][1];
  return `<div class="composition-table">${entries.map(([label, count], i) => `
    <div class="comp-row">
      <span class="comp-rank">${i + 1}</span>
      <span class="comp-label">${escapeHtml(label === "--" ? "—" : label)}</span>
      <div class="comp-bar-track"><div class="comp-bar-fill" style="width:${Math.round(count / max * 100)}%"></div></div>
      <span class="comp-count">${count}</span>
    </div>`).join("")}</div>`;
}

function irFirmStats(records, firmName) {
  const firm = records.filter(r => r.current_firm === firmName);
  const tally = (key) => {
    const counts = {};
    firm.forEach(r => { const v = r[key] || "Unknown"; counts[v] = (counts[v] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };
  return {
    total:     firm.length,
    functions: tally("function"),
    locations: tally("current_location"),
    groups:    tally("group"),
  };
}

// ── View: ir.firm ───────────────────────────────────────────────────────────────

registerWorkspaceView({
  id: "ir.firm",
  hasContext: true,
  match: (tab) => tab.type === "ir.firm",
  toolbar: () => ({ left: [], right: [] }),
  render: (tab) => {
    const firmName = tab.state?.firmName;
    if (!firmName)
      return `<div class="table-shell view-placeholder"><span>No firm selected</span></div>`;

    const irTab = workspaceState.tabs.find(t => t.type === "ir.table" && t.state?.records);
    const allRecords = irTab?.state?.records || [];

    if (!allRecords.length) return `
      <div class="detail-view-shell view-placeholder">
        <span>${escapeHtml(firmName)}</span>
        <p>Open the IR Map tab to load records first.</p>
      </div>`;

    const stats = irFirmStats(allRecords, firmName);
    if (!stats.total) return `
      <div class="detail-view-shell view-placeholder">
        <span>${escapeHtml(firmName)}</span>
        <p>No records found for this firm in the loaded IR data.</p>
      </div>`;

    return `
      <div class="firm-composition-shell">
        <div class="firm-comp-header">
          <div class="firm-comp-name">${escapeHtml(firmName)}</div>
          <div class="firm-comp-meta">
            <span>${stats.total} people</span>
            <span class="firm-comp-meta-sep">·</span>
            <span>${stats.locations.length} location${stats.locations.length !== 1 ? "s" : ""}</span>
            <span class="firm-comp-meta-sep">·</span>
            <span>${stats.functions.length} function${stats.functions.length !== 1 ? "s" : ""}</span>
            <span class="firm-comp-meta-sep">·</span>
            <span>${stats.groups.filter(([l]) => l !== "--" && l !== "Unknown").length} groups</span>
          </div>
        </div>

        <div class="firm-comp-donuts">
          <div class="firm-comp-donut-card">
            <div class="firm-comp-section-title">Function</div>
            <div class="firm-comp-donut-body">
              ${svgDonut(stats.functions)}
              ${donutLegend(stats.functions, stats.total)}
            </div>
          </div>
          <div class="firm-comp-donut-card">
            <div class="firm-comp-section-title">Location</div>
            <div class="firm-comp-donut-body">
              ${svgDonut(stats.locations)}
              ${donutLegend(stats.locations, stats.total)}
            </div>
          </div>
        </div>

        <div class="firm-comp-section">
          <div class="firm-comp-section-title">Group / Strategy Breakdown</div>
          ${groupTable(stats.groups.filter(([l]) => l !== "--" && l !== "Unknown"))}
        </div>
      </div>
    `;
  },
});

// ── View: master.search ────────────────────────────────────────────────────────
registerWorkspaceView({
  id: "master.search",
  hasContext: false,
  match: (tab) => tab.type === "master.search",
  toolbar: () => ({ left: [], right: [] }),
  render: (tab) => `
    <div class="master-search-shell">
      <div class="master-search-bar">
        <input
          id="masterSearchInput"
          class="master-search-input"
          type="text"
          placeholder="Search 24,427 reference records by name, firm, title, strategy…"
          value="${escapeHtml(tab.state?.query || "")}"
          autocomplete="off"
          spellcheck="false"
        />
        <span id="masterSearchCount" class="master-search-count"></span>
      </div>
      <div id="masterSearchResults" class="master-search-results">
        <div class="master-empty">Type to search 24,427 reference records.</div>
      </div>
    </div>
  `,
  onActivate: (tab) => {
    const input = document.getElementById("masterSearchInput");
    if (!input) return;
    if (tab.state?.query) runMasterSearch(tab.state.query);
    input.focus();
    input.addEventListener("input", debounce((e) => {
      const q = e.target.value;
      const activeTab = getActiveTab();
      if (activeTab) activeTab.state.query = q;
      runMasterSearch(q);
    }, 250));
  },
});

// ── View: trending ─────────────────────────────────────────────────────────────
registerWorkspaceView({
  id: "trending",
  match: (tab) => tab.type === "trending",
  toolbar: () => ({ left: [], right: [{ id: "trending.refresh", label: "Refresh" }] }),
  onActivate: async (tab) => {
    if (tab.state?.data !== undefined || fetchingTabs.has(tab.id)) return;
    fetchingTabs.add(tab.id);
    try {
      const data = await bankstGet("/trending?hours=48&limit=50");
      fetchingTabs.delete(tab.id);
      updateActiveTabState({ data, error: null }, tab.id);
    } catch (err) {
      fetchingTabs.delete(tab.id);
      updateActiveTabState({ data: null, error: err.message }, tab.id);
    }
  },
  render: (tab) => {
    if (tab.state?.error)             return `<div class="table-shell view-placeholder"><span>Trending</span><p class="text-error">Error: ${tab.state.error}</p></div>`;
    if (tab.state?.data === undefined) return `<div class="table-shell view-placeholder"><span>Trending</span><p>Loading…</p></div>`;
    if (!tab.state.data?.length)      return `<div class="table-shell view-placeholder"><span>Trending</span><p>No views recorded in the last 48 hours.</p></div>`;
    return `
      <div class="table-shell">
        <div class="table-header-grid trending-grid">
          <div>#</div>
          <div>Name</div>
          <div>Type</div>
          <div>Views (48h)</div>
        </div>
        ${tab.state.data.map((item, i) => `
          <div class="table-row-grid trending-grid">
            <div class="text-muted">${i + 1}</div>
            <div>${escapeHtml(item.entity_label || item.entity_id)}</div>
            <div class="text-muted">${item.entity_type}</div>
            <div><span class="finra-badge finra-badge--active">${item.view_count}</span></div>
          </div>
        `).join("")}
      </div>
    `;
  },
});

// ── Performance Dashboard ─────────────────────────────────────────────────────
registerWorkspaceView({
  id:         "perf.dashboard",
  hasContext: false,
  match:      (tab) => tab.type === "perf.dashboard",
  toolbar:    () => ({
    left:  [{ id: "perf-refresh",   label: "Refresh" }],
    right: [{ id: "perf-clear-log", label: "Clear Log" }],
  }),
  render(tab) {
    const log     = window.perf_log || [];
    const frames  = log.filter(e => e.category === "renderer");
    const apiCalls = log.filter(e => e.category === "api");

    // Stats
    const last60f   = frames.slice(-60);
    const slowFrames = last60f.filter(f => f.ms > 16).length;
    const avgFrame   = last60f.length
      ? (last60f.reduce((s, f) => s + f.ms, 0) / last60f.length).toFixed(1)
      : "—";
    const avgApi = apiCalls.length
      ? (apiCalls.reduce((s, e) => s + e.ms, 0) / apiCalls.length).toFixed(0)
      : "—";
    const frameColor = slowFrames > 10 ? "var(--status-inactive)" : slowFrames > 3 ? "var(--status-warning, #d4a017)" : "var(--status-active)";

    return `
      <div class="perf-view">

        <div class="perf-stat-strip">
          <div class="perf-stat">
            <div class="perf-stat-label">Avg Frame</div>
            <div class="perf-stat-value">${avgFrame}<span class="perf-unit">ms</span></div>
          </div>
          <div class="perf-stat">
            <div class="perf-stat-label">Slow Frames</div>
            <div class="perf-stat-value" style="color:${frameColor}">${slowFrames}<span class="perf-unit">/60</span></div>
          </div>
          <div class="perf-stat">
            <div class="perf-stat-label">API Calls</div>
            <div class="perf-stat-value">${apiCalls.length}</div>
          </div>
          <div class="perf-stat">
            <div class="perf-stat-label">Avg API</div>
            <div class="perf-stat-value">${avgApi}<span class="perf-unit">ms</span></div>
          </div>
          <div class="perf-stat">
            <div class="perf-stat-label">Log Entries</div>
            <div class="perf-stat-value">${log.length}</div>
          </div>
        </div>

        <div class="perf-section">
          <div class="perf-section-title">Frame Timeline <span class="perf-section-hint">last 60 frames — red &gt;33ms, yellow 16–33ms</span></div>
          <div class="perf-frame-chart">
            ${perfFrameBars(frames)}
          </div>
        </div>

        <div class="perf-section">
          <div class="perf-section-title">API Calls <span class="perf-section-hint">last 50, newest first</span></div>
          <div class="perf-api-header">
            <div>Time</div><div>Source</div><div>Endpoint</div><div>Duration</div><div>Status</div>
          </div>
          <div class="perf-api-list">
            ${perfApiRows(apiCalls)}
          </div>
        </div>

        <div class="perf-section">
          <div class="perf-section-title">Asset Audit — Fonts <span class="perf-section-hint">declared in css/fonts.css</span></div>
          <div class="perf-asset-summary">
            Total declared: <strong>${(TOTAL_FONT_KB / 1024).toFixed(1)} MB</strong> (OTF) —
            Est. WOFF2 savings: <strong>~${((TOTAL_FONT_KB - WOFF2_EST_KB) / 1024).toFixed(1)} MB</strong>
            → target <strong>${(WOFF2_EST_KB / 1024).toFixed(1)} MB</strong>
          </div>
          <div class="perf-asset-header">
            <div>File</div><div>Size</div><div>Format</div>
          </div>
          <div class="perf-asset-list">
            ${perfAssetRows()}
          </div>
        </div>

        <div class="perf-section">
          <div class="perf-section-title">JS Modules <span class="perf-section-hint">no bundler — ES module waterfall</span></div>
          <div class="perf-asset-summary">
            15 modules loaded sequentially via browser ES module resolution.
            No bundler, no tree-shaking. Total JS payload ≈ 130 KB unminified.
            Primary bottleneck is network waterfall on first load, not file size.
          </div>
        </div>

      </div>
    `;
  },
});
