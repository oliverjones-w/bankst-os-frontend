import { registerWorkspaceView, updateActiveTabState, updateTabTitle, getActiveTab, fetchingTabs, workspaceState } from "./workspace.js";
import { finraGet, bankstGet, mappingGet, mappingUpload, setFinraChangesCache, encoreGet } from "./api.js";
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
      updateTabTitle(tab.id, data.firm_key || data.name);
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
        const countEl = document.getElementById("hfSearchCount");
        if (countEl) {
          countEl.textContent = `All ${(records.length + rest.length).toLocaleString()} records ready`;
          countEl.style.color = "var(--text-accent, var(--interactive-accent))";
          setTimeout(() => { countEl.style.color = ""; }, 3000);
        }
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

const MAP_DISPLAY_LIMIT = 500;

function hfTableBody(filtered, total) {
  if (!filtered?.length)
    return `<div class="master-empty">No matches for current filters.</div>`;
  const rows = filtered.slice(0, MAP_DISPLAY_LIMIT);
  const overflow = filtered.length > MAP_DISPLAY_LIMIT
    ? `<div class="master-empty" style="padding:12px 16px;">Showing ${MAP_DISPLAY_LIMIT.toLocaleString()} of ${filtered.length.toLocaleString()} matches — refine your search to see more.</div>`
    : "";
  return rows.map(r => `
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
  `).join("") + overflow;
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
        const countEl = document.getElementById("irSearchCount");
        if (countEl) {
          countEl.textContent = `All ${(records.length + rest.length).toLocaleString()} records ready`;
          countEl.style.color = "var(--text-accent, var(--interactive-accent))";
          setTimeout(() => { countEl.style.color = ""; }, 3000);
        }
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
  const rows = filtered.slice(0, MAP_DISPLAY_LIMIT);
  const overflow = filtered.length > MAP_DISPLAY_LIMIT
    ? `<div class="master-empty" style="padding:12px 16px;">Showing ${MAP_DISPLAY_LIMIT.toLocaleString()} of ${filtered.length.toLocaleString()} matches — refine your search to see more.</div>`
    : "";
  return rows.map(r => {
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
  `}).join("") + overflow;
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

// ---------------------------------------------------------------------------
// BBG Extraction — Firms Summary
// ---------------------------------------------------------------------------
registerWorkspaceView({
  id: "bbg.firms",
  match: (tab) => tab.type === "bbg.firms",
  toolbar: (_tab) => ({
    left:  [{ id: "bbg.firms.summary", label: "Summary", active: true }],
    right: [{ id: "bbg.firms.refresh", label: "Refresh" }],
  }),
  render: (tab) => {
    const firms       = tab.state?.data;
    const uploadState = tab.state?.uploadState || "idle";
    const uploadMsg   = tab.state?.uploadMessage || "";

    // Upload zone + terminal block — state-driven appearance
    const uploadResult = tab.state?.uploadResult;
    const uploadLog    = tab.state?.uploadLog;

    const zoneBorder = {
      idle:      "border-color:var(--border-subtle);background:transparent;",
      dragging:  "border-color:var(--interactive-accent);background:rgba(0,115,255,.04);",
      streaming: "border-color:var(--interactive-accent);background:rgba(0,115,255,.04);",
      success:   "border-color:hsla(133,49%,49%,.4);background:hsla(133,49%,49%,.05);",
      error:     "border-color:hsla(0,72%,60%,.4);background:hsla(0,72%,60%,.05);",
    };

    let zoneLabel = "";
    if      (uploadState === "success" && uploadResult) {
      zoneLabel = `<div style="font-size:var(--font-size-label,9px);font-family:var(--font-interface);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4ade80;">
        ✓ Run complete — ${escapeHtml(uploadResult.firm_name)}
        <span style="margin-left:16px;color:var(--text-muted);font-weight:400;">
          ${uploadResult.confirmed_count} conf · ${uploadResult.discrepancy_count} disc · ${uploadResult.addition_count} add · run #${uploadResult.run_id}
          <button class="cell-link" data-open-bbg-firm="${escapeHtml(uploadResult.firm_id)}" data-firm-name="${escapeHtml(uploadResult.firm_name)}"
            style="margin-left:12px;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-accent);">View →</button>
        </span>
      </div>`;
    } else if (uploadState === "streaming") {
      zoneLabel = `<div style="font-size:var(--font-size-label,9px);font-family:var(--font-interface);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--interactive-accent);">⟳ Extraction running…</div>`;
    } else if (uploadState === "error") {
      zoneLabel = `<div style="font-size:var(--font-size-label,9px);font-family:var(--font-interface);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ef4444;">✗ Extraction failed</div>`;
    } else if (uploadState === "dragging") {
      zoneLabel = `<div style="font-size:var(--font-size-label,9px);font-family:var(--font-interface);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--interactive-accent);">⊛ Release to upload</div>`;
    } else {
      zoneLabel = `<div style="font-size:var(--font-size-label,9px);font-family:var(--font-interface);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint);">⊛ Drop a BBG CSV here to run extraction</div>`;
    }

    // Terminal block — shown during streaming (empty, lines appended via DOM) and after (log from state)
    let terminalBlock = "";
    if (uploadState === "streaming") {
      terminalBlock = `<div class="bbg-terminal" id="bbg-terminal-${escapeHtml(tab.id)}"></div>`;
    } else if (uploadLog?.length) {
      terminalBlock = `<div class="bbg-terminal bbg-terminal--done">${uploadLog.map(l =>
        `<div class="tl tl-${escapeHtml(l.type)}">${escapeHtml(l.msg)}</div>`
      ).join("")}</div>`;
    }

    const uploadZone = `
      <div class="bbg-upload-zone" data-tab-id="${escapeHtml(tab.id)}"
        style="margin-bottom:${terminalBlock ? "0" : "16px"};padding:10px 14px;border:1px dashed;border-radius:6px;
               cursor:default;transition:border-color 120ms,background 120ms;${zoneBorder[uploadState] || zoneBorder.idle}">
        ${zoneLabel}
      </div>
      ${terminalBlock ? `<div style="margin-bottom:16px;">${terminalBlock}</div>` : ""}
    `;

    if (!firms) {
      return `
        <div class="table-shell" style="padding:16px 24px;">
          ${uploadZone}
          <div class="view-placeholder" style="padding:32px 0;">
            <span>BBG Extraction</span><p>Loading firms…</p>
          </div>
        </div>
      `;
    }

    const totalConfirmed     = firms.reduce((s, f) => s + (f.confirmed_count    || 0), 0);
    const totalDiscrepancies = firms.reduce((s, f) => s + (f.discrepancy_count  || 0), 0);
    const totalAdditions     = firms.reduce((s, f) => s + (f.addition_count     || 0), 0);

    const statTiles = `
      <div class="bbg-stat-row" style="margin-bottom:12px;">
        <div class="meta-item"><div class="meta-label">Firms</div><div class="meta-value">${firms.length}</div></div>
        <div class="meta-item"><div class="meta-label">Confirmed</div><div class="meta-value">${totalConfirmed.toLocaleString()}</div></div>
        <div class="meta-item"><div class="meta-label">Discrepancies</div><div class="meta-value">${totalDiscrepancies.toLocaleString()}</div></div>
        <div class="meta-item"><div class="meta-label">Additions</div><div class="meta-value">${totalAdditions.toLocaleString()}</div></div>
      </div>
    `;

    const firmRow = (f) => {
      const pct     = (f.tracking_pct || 0).toFixed(1);
      const runDate = f.run_at ? new Date(f.run_at).toLocaleDateString() : "—";
      return `
        <div class="table-row-wrap">
          <div class="table-row-grid bbg-firms-grid">
            <button class="cell-link" data-open-bbg-firm="${escapeHtml(f.firm_id)}" data-firm-name="${escapeHtml(f.firm_name)}">${escapeHtml(f.firm_name)}</button>
            <div class="cell-mono">${(f.confirmed_count || 0).toLocaleString()}</div>
            <div class="cell-mono">${(f.discrepancy_count || 0).toLocaleString()}</div>
            <div class="cell-mono">${(f.addition_count || 0).toLocaleString()}</div>
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="flex:1;height:4px;background:var(--surface-2,rgba(255,255,255,.08));border-radius:2px;overflow:hidden;">
                  <div style="width:${pct}%;height:100%;background:var(--accent,#4a90d9);border-radius:2px;"></div>
                </div>
                <span class="cell-mono" style="min-width:36px;">${pct}%</span>
              </div>
            </div>
            <div class="cell-mono">${runDate}</div>
          </div>
        </div>
      `;
    };

    const sorted = [...firms].sort((a, b) => (b.tracking_pct || 0) - (a.tracking_pct || 0));

    return `
      <div class="table-shell" style="padding-top:16px;">
        <div style="padding:0 24px;">
          ${uploadZone}
        </div>
        ${statTiles}
        <div class="table-header-grid bbg-firms-grid">
          <div>Firm</div>
          <div>Confirmed</div>
          <div>Discrepancies</div>
          <div>Additions</div>
          <div>Tracking %</div>
          <div>Last Run</div>
        </div>
        ${sorted.map(firmRow).join("")}
      </div>
    `;
  },
  onActivate: async (tab) => {
    if (fetchingTabs.has(tab.id)) return;
    if (tab.state?.data) return;
    fetchingTabs.add(tab.id);
    try {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}/i;
      const all  = await mappingGet("/bbg/firms");
      const data = all.filter(f => UUID_RE.test(f.firm_id));
      updateActiveTabState({ data }, tab.id);
    } catch (e) {
      console.error("[bbg.firms] fetch failed:", e);
    } finally {
      fetchingTabs.delete(tab.id);
    }
  },
});

// ---------------------------------------------------------------------------
// BBG Extraction — Firm Detail
// ---------------------------------------------------------------------------
// BBG inline SVG chart helpers
// ---------------------------------------------------------------------------

function _bbgTrendChart(runs) {
  if (!runs || runs.length < 2) {
    return `<p style="opacity:.5;font-size:11px;padding:12px 0;">Need at least 2 runs to show trends.</p>`;
  }
  const data = [...runs].reverse(); // oldest → newest
  const W = 580, H = 190, PL = 46, PR = 52, PT = 14, PB = 38;
  const iW = W - PL - PR, iH = H - PT - PB;
  const n = data.length;
  const xOf = i => PL + (i / Math.max(n - 1, 1)) * iW;

  const series = [
    { key: "confirmed_count",   color: "#4ade80", label: "Confirmed" },
    { key: "discrepancy_count", color: "#f87171", label: "Discrepancies" },
    { key: "addition_count",    color: "#60a5fa", label: "Additions" },
  ];
  const maxVal = Math.max(...series.flatMap(s => data.map(d => d[s.key] || 0)), 1);
  const yOf  = v   => PT + (1 - v / maxVal) * iH;
  const yPct = pct => PT + (1 - pct / 100) * iH;

  // Grid lines + left Y axis
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = PT + f * iH, v = Math.round(maxVal * (1 - f));
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.05)" stroke-width="1"/>` +
           `<text x="${PL - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-faint)">${v}</text>`;
  }).join("");

  // Right Y axis — tracking %
  const rightAxis = [0, 25, 50, 75, 100].map(pct => {
    const y = yPct(pct);
    return `<text x="${W - PR + 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="start" font-size="9" fill="#a78bfa" opacity=".5">${pct}%</text>`;
  }).join("");

  // Area fills (subtle gradient effect)
  const areas = series.map(s => {
    const pts = data.map((row, i) => `${xOf(i).toFixed(1)},${yOf(row[s.key] || 0).toFixed(1)}`).join(" ");
    return `<polygon points="${xOf(0).toFixed(1)},${(PT + iH).toFixed(1)} ${pts} ${xOf(n - 1).toFixed(1)},${(PT + iH).toFixed(1)}" fill="${s.color}" opacity=".05"/>`;
  }).join("");

  // Lines
  const paths = series.map(s => {
    const d = data.map((row, i) =>
      `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(row[s.key] || 0).toFixed(1)}`
    ).join(" ");
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>`;
  }).join("");

  // Tracking % dashed line
  const trackPath = data.map((row, i) =>
    `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yPct(row.tracking_pct || 0).toFixed(1)}`
  ).join(" ");
  const trackLine = `<path d="${trackPath}" fill="none" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="5,3" stroke-linejoin="round" opacity=".75"/>`;

  // Dots at every data point
  const dots = series.flatMap(s =>
    data.map((row, i) => `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(row[s.key] || 0).toFixed(1)}" r="2.2" fill="${s.color}" opacity=".85"/>`)
  ).join("");
  const trackDots = data.map((row, i) =>
    `<circle cx="${xOf(i).toFixed(1)}" cy="${yPct(row.tracking_pct || 0).toFixed(1)}" r="2.2" fill="#a78bfa" opacity=".7"/>`
  ).join("");

  // X-axis labels
  const step = Math.max(1, Math.ceil(n / 6));
  const xLabels = data.filter((_, i) => i % step === 0 || i === n - 1).map(row => {
    const i = data.indexOf(row);
    const dt = new Date(row.run_at);
    const time = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `<text x="${xOf(i).toFixed(1)}" y="${H - 18}" text-anchor="middle" font-size="9" fill="var(--text-faint)">${dt.getMonth() + 1}/${dt.getDate()}</text>` +
           `<text x="${xOf(i).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="8" fill="var(--text-faint)" opacity=".5">${time}</text>`;
  }).join("");

  // Legend
  const allSeries = [...series, { color: "#a78bfa", label: "Track %" }];
  const legend = allSeries.map((s, i) =>
    `<g transform="translate(${PL + i * 108}, ${H + 8})">` +
    `<rect x="0" y="1" width="8" height="8" rx="1.5" fill="${s.color}" opacity=".9"/>` +
    `<text x="13" y="8.5" font-size="9" fill="var(--text-muted)">${s.label}</text></g>`
  ).join("");

  return `<svg viewBox="0 0 ${W} ${H + 24}" style="width:100%;display:block;overflow:visible;">${gridLines}${rightAxis}${areas}${paths}${trackLine}${dots}${trackDots}${xLabels}${legend}</svg>`;
}

function _bbgLocationChart(confirmed) {
  if (!confirmed?.length) return `<p style="opacity:.5;font-size:11px;padding:12px 0;">No confirmed records.</p>`;
  const counts = {};
  for (const r of confirmed) {
    const loc = (r.location || "Unknown").trim() || "Unknown";
    counts[loc] = (counts[loc] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!sorted.length) return "";
  const maxCount = sorted[0][1];
  const BAR_H = 15, GAP = 5, LABEL_W = 110, BAR_MAX = 190, NUM_W = 30;
  const W = LABEL_W + BAR_MAX + NUM_W;
  const H = sorted.length * (BAR_H + GAP) - GAP;
  const bars = sorted.map(([loc, count], i) => {
    const y  = i * (BAR_H + GAP);
    const bw = Math.max(2, (count / maxCount) * BAR_MAX);
    const lbl = loc.length > 17 ? loc.slice(0, 16) + "…" : loc;
    return `<text x="${LABEL_W - 6}" y="${y + BAR_H - 2}" text-anchor="end" font-size="9.5" fill="var(--text-muted)">${escapeHtml(lbl)}</text>` +
           `<rect x="${LABEL_W}" y="${y}" width="${bw.toFixed(1)}" height="${BAR_H}" rx="2" fill="var(--interactive-accent)" opacity=".6"/>` +
           `<text x="${(LABEL_W + bw + 5).toFixed(1)}" y="${y + BAR_H - 2}" font-size="9.5" fill="var(--text-faint)">${count}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;">${bars}</svg>`;
}

function _bbgFieldChart(discrepancies) {
  if (!discrepancies?.length) return `<p style="opacity:.5;font-size:11px;padding:12px 0;">No discrepancies in current run.</p>`;
  const counts = {};
  for (const d of discrepancies) {
    const f = d.discrepancy_field || "unknown";
    counts[f] = (counts[f] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!sorted.length) return "";
  const maxCount = sorted[0][1];
  const BAR_H = 14, GAP = 5, LABEL_W = 80, BAR_MAX = 190, NUM_W = 28;
  const W = LABEL_W + BAR_MAX + NUM_W;
  const H = sorted.length * (BAR_H + GAP) - GAP;
  const bars = sorted.map(([field, count], i) => {
    const y  = i * (BAR_H + GAP);
    const bw = Math.max(2, (count / maxCount) * BAR_MAX);
    const lbl = field.length > 12 ? field.slice(0, 11) + "…" : field;
    return `<text x="${LABEL_W - 6}" y="${y + BAR_H - 2}" text-anchor="end" font-size="9.5" fill="var(--text-muted)">${escapeHtml(lbl)}</text>` +
           `<rect x="${LABEL_W}" y="${y}" width="${bw.toFixed(1)}" height="${BAR_H}" rx="2" fill="#f87171" opacity=".55"/>` +
           `<text x="${(LABEL_W + bw + 5).toFixed(1)}" y="${y + BAR_H - 2}" font-size="9.5" fill="var(--text-faint)">${count}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;">${bars}</svg>`;
}

function _bbgRunHistoryTable(runs, selectedRunId) {
  if (!runs?.length) return "";
  const esc = escapeHtml;
  const rows = runs.map(r => {
    const dt   = new Date(r.run_at);
    const date = `${dt.getMonth() + 1}/${dt.getDate()} ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    const pct  = (r.tracking_pct || 0).toFixed(1);
    const hot  = r.run_id === selectedRunId ? " table-row-grid--hot" : "";
    return `
      <div class="table-row-wrap">
        <div class="table-row-grid bbg-runs-hist-grid${hot}">
          <div class="cell-mono">${date}</div>
          <div>${esc(r.csv_filename || "")}</div>
          <div class="cell-mono">${(r.rows_processed || 0).toLocaleString()}</div>
          <div class="cell-mono" style="color:#4ade80;">${(r.confirmed_count || 0).toLocaleString()}</div>
          <div class="cell-mono" style="color:#f87171;">${(r.discrepancy_count || 0).toLocaleString()}</div>
          <div class="cell-mono" style="color:#60a5fa;">${(r.addition_count || 0).toLocaleString()}</div>
          <div>
            <div style="display:flex;align-items:center;gap:5px;">
              <div style="flex:1;height:3px;background:var(--surface-2);border-radius:2px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:var(--interactive-accent);border-radius:2px;"></div>
              </div>
              <span class="cell-mono" style="font-size:9px;min-width:30px;">${pct}%</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
  return `
    <div class="table-header-grid bbg-runs-hist-grid">
      <div>Date / Time</div><div>File</div><div>Rows</div><div>Conf</div><div>Disc</div><div>Add</div><div>Tracking</div>
    </div>
    ${rows}`;
}

// ---------------------------------------------------------------------------
registerWorkspaceView({
  id: "bbg.firm",
  match: (tab) => tab.type === "bbg.firm",
  toolbar: (tab) => {
    const mode    = tab.state?.mode || "confirmed";
    const runData = tab.state?.runData;
    return {
      left: [
        { id: "bbg.firm.confirmed",    label: `Confirmed${runData ? ` (${runData.confirmed?.length ?? 0})` : ""}`,     active: mode === "confirmed" },
        { id: "bbg.firm.discrepancies",label: `Discrepancies${runData ? ` (${runData.discrepancies?.length ?? 0})` : ""}`, active: mode === "discrepancies" },
        { id: "bbg.firm.additions",    label: `Additions${runData ? ` (${runData.additions?.length ?? 0})` : ""}`,     active: mode === "additions" },
        { id: "bbg.firm.analytics",    label: "Analytics",   active: mode === "analytics" },
        { id: "bbg.firm.delta",        label: "Delta",        active: mode === "delta" },
        { id: "bbg.firm.persistence",  label: "Persistence",  active: mode === "persistence" },
      ],
      right: [],
    };
  },
  render: (tab) => {
    const mode    = tab.state?.mode || "confirmed";
    const runs    = tab.state?.runs;
    const runData = tab.state?.runData;
    const selRunId = tab.state?.selectedRunId;
    const firmName = tab.title || "Firm";

    // Terminal panel — shown during/after upload when this firm's tab is active
    const uploadState = tab.state?.uploadState;
    const uploadLog   = tab.state?.uploadLog;
    let firmTerminal = "";
    if (uploadState === "streaming") {
      firmTerminal = `<div class="bbg-terminal" id="bbg-terminal-${escapeHtml(tab.id)}" style="margin-bottom:12px;"></div>`;
    } else if (uploadLog?.length) {
      firmTerminal = `<div class="bbg-terminal bbg-terminal--done" style="margin-bottom:12px;">${uploadLog.map(l =>
        `<div class="tl tl-${escapeHtml(l.type)}">${escapeHtml(l.msg)}</div>`
      ).join("")}</div>`;
    }

    if (!runs) {
      return `<div class="detail-view-shell view-placeholder"><span>${escapeHtml(firmName)}</span><p>Loading extraction data…</p></div>`;
    }

    // Run selector header
    const runSelector = `
      <div class="detail-header">
        <div>
          <div class="detail-title">${escapeHtml(firmName)}</div>
          <div class="detail-subtitle" style="display:flex;align-items:center;gap:8px;margin-top:4px;">
            <label style="font-size:var(--font-size-label,9px);text-transform:uppercase;opacity:.6;">Run</label>
            <select class="bbg-run-selector" data-tab-id="${escapeHtml(tab.id)}" style="font-size:var(--font-size-data,11px);background:var(--surface-2);border:1px solid var(--border);color:inherit;border-radius:4px;padding:2px 6px;">
              ${(runs || []).map(r => {
                const label = `${new Date(r.run_at).toLocaleDateString()} — ${r.csv_filename} (${r.rows_processed} rows)`;
                return `<option value="${r.run_id}" ${r.run_id === selRunId ? "selected" : ""}>${escapeHtml(label)}</option>`;
              }).join("")}
            </select>
          </div>
        </div>
      </div>
    `;

    if (!runData) {
      return `<div class="detail-view-shell">${runSelector}<p style="opacity:.5">Loading run data…</p></div>`;
    }

    // Stat tiles
    const statRow = `
      <div class="bbg-stat-row">
        <div class="meta-item"><div class="meta-label">Confirmed</div><div class="meta-value">${(runData.confirmed?.length || 0).toLocaleString()}</div></div>
        <div class="meta-item"><div class="meta-label">Discrepancies</div><div class="meta-value">${(runData.discrepancies?.length || 0).toLocaleString()}</div></div>
        <div class="meta-item"><div class="meta-label">Additions</div><div class="meta-value">${(runData.additions?.length || 0).toLocaleString()}</div></div>
        <div class="meta-item"><div class="meta-label">Rows Processed</div><div class="meta-value">${(runs.find(r => r.run_id === selRunId)?.rows_processed || 0).toLocaleString()}</div></div>
      </div>
    `;

    // Search input
    const searchInput = `
      <div style="padding:0 24px;">
        <input class="bbg-search-input" data-tab-id="${escapeHtml(tab.id)}" data-mode="${mode}" type="text" placeholder="Filter by name…"
          style="width:100%;max-width:300px;font-size:var(--font-size-data,11px);padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface-2);color:inherit;"
          value="${escapeHtml(tab.state?.searchQuery || "")}" />
      </div>
    `;

    const q = (tab.state?.searchQuery || "").toLowerCase();
    const filterByName = (arr) => q ? arr.filter(r => (r.name || "").toLowerCase().includes(q)) : arr;
    const esc = escapeHtml;

    let tableHtml = "";

    if (mode === "confirmed") {
      const rows = filterByName(runData.confirmed || []);
      tableHtml = `
        <div class="table-header-grid bbg-confirmed-grid">
          <div>Name</div><div>Firm</div><div>Title</div><div>Function</div><div>Strategy</div><div>Products</div><div>Location</div>
        </div>
        ${rows.map(r => `
          <div class="table-row-wrap">
            <div class="table-row-grid bbg-confirmed-grid">
              <div>${esc(r.name || "")}</div>
              <div>${esc(r.firm || "")}</div>
              <div>${esc(r.title || "")}</div>
              <div>${esc(r.function || "")}</div>
              <div>${esc(r.strategy || "")}</div>
              <div>${esc(r.products || "")}</div>
              <div>${esc(r.location || "")}</div>
            </div>
          </div>
        `).join("")}
        ${rows.length === 0 ? `<div style="padding:16px;opacity:.5;">No records match filter.</div>` : ""}
      `;
    } else if (mode === "discrepancies") {
      const rows = filterByName(runData.discrepancies || []);
      tableHtml = `
        <div class="table-header-grid bbg-disc-grid">
          <div>Name</div><div>Field</div><div>BBG Value</div><div>Master Value</div><div>Alias Info</div><div>Status</div><div>First Seen</div>
        </div>
        ${rows.map(r => `
          <div class="table-row-wrap">
            <div class="table-row-grid bbg-disc-grid">
              <div>${esc(r.name || "")}</div>
              <div class="cell-mono">${esc(r.discrepancy_field || "")}</div>
              <div>${esc(r.new_file_value || "")}</div>
              <div>${esc(r.master_file_values || "")}</div>
              <div style="font-size:10px;opacity:.7;">${esc(r.alias_check_info || "")}</div>
              <div><span class="alias-tag ${r.status === "Active" ? "" : "alias-tag--platform"}">${esc(r.status || "")}</span></div>
              <div class="cell-mono">${r.first_seen ? new Date(r.first_seen).toLocaleDateString() : "—"}</div>
            </div>
          </div>
        `).join("")}
        ${rows.length === 0 ? `<div style="padding:16px;opacity:.5;">No discrepancies match filter.</div>` : ""}
      `;
    } else if (mode === "additions") {
      const rows = filterByName(runData.additions || []);
      tableHtml = `
        <div class="table-header-grid bbg-add-grid">
          <div>Name</div><div>BBG Company</div><div>Canonical</div><div>Title</div><div>Location</div><div>First Seen</div>
        </div>
        ${rows.map(r => `
          <div class="table-row-wrap">
            <div class="table-row-grid bbg-add-grid">
              <div>${esc(r.name || "")}</div>
              <div>${esc(r.company || "")}</div>
              <div>${esc(r.canonical_company || "")}</div>
              <div>${esc(r.title || "")}</div>
              <div>${esc(r.location || "")}</div>
              <div class="cell-mono">${r.first_seen ? new Date(r.first_seen).toLocaleDateString() : "—"}</div>
            </div>
          </div>
        `).join("")}
        ${rows.length === 0 ? `<div style="padding:16px;opacity:.5;">No additions match filter.</div>` : ""}
      `;
    }

    // ── Delta view ────────────────────────────────────────────────────────────
    if (mode === "delta") {
      if (!runs || runs.length < 2) {
        return `<div class="detail-view-shell view-placeholder"><span>Delta</span><p>Need at least 2 runs to compare.</p></div>`;
      }

      const deltaRunA  = tab.state?.deltaRunA  ?? runs[1]?.run_id;
      const deltaRunB  = tab.state?.deltaRunB  ?? runs[0]?.run_id;
      const deltaData  = tab.state?.deltaData;

      const runOpts = (selectedId) => runs.map(r => {
        const label = `${new Date(r.run_at).toLocaleDateString()} — run #${r.run_id} (${r.rows_processed} rows)`;
        return `<option value="${r.run_id}" ${r.run_id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
      }).join("");

      const selectors = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;opacity:.5;">From</label>
            <select class="bbg-delta-run-a" data-tab-id="${esc(tab.id)}"
              style="font-size:11px;background:var(--surface-2);border:1px solid var(--border);color:inherit;border-radius:4px;padding:2px 6px;">
              ${runOpts(deltaRunA)}
            </select>
          </div>
          <span style="opacity:.4;font-size:12px;">→</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;opacity:.5;">To</label>
            <select class="bbg-delta-run-b" data-tab-id="${esc(tab.id)}"
              style="font-size:11px;background:var(--surface-2);border:1px solid var(--border);color:inherit;border-radius:4px;padding:2px 6px;">
              ${runOpts(deltaRunB)}
            </select>
          </div>
          ${!deltaData ? `<span style="font-size:11px;opacity:.4;">Select runs above to compare</span>` : ""}
        </div>
      `;

      if (!deltaData) {
        return `<div class="detail-view-shell">${firmTerminal}${selectors}</div>`;
      }

      const { confirmed, discrepancies, additions, run_a, run_b } = deltaData;

      const deltaSection = (title, color, rows, cols, rowFn) => {
        if (!rows?.length) return `
          <div class="delta-section" style="margin-bottom:16px;">
            <div class="delta-section-header" style="color:${color};">${title} <span class="delta-zero">0</span></div>
          </div>`;
        return `
          <div class="delta-section" style="margin-bottom:16px;">
            <div class="delta-section-header" style="color:${color};">${title} <span class="delta-count">${rows.length}</span></div>
            <div class="table-header-grid ${cols}">${Object.keys(rowFn(rows[0])).map(k => `<div>${escapeHtml(k)}</div>`).join("")}</div>
            ${rows.map(r => `
              <div class="table-row-wrap">
                <div class="table-row-grid ${cols}">${Object.values(rowFn(r)).map(v => `<div>${esc(v || "")}</div>`).join("")}</div>
              </div>`).join("")}
          </div>`;
      };

      return `
        <div class="detail-view-shell detail-view-shell--compact">
          ${firmTerminal}
          <div class="detail-header">
            <div class="detail-title">${esc(firmName)} — Run Delta</div>
            <div class="detail-subtitle" style="margin-top:4px;font-size:11px;opacity:.6;">
              Run #${run_a.run_id} (${new Date(run_a.run_at).toLocaleDateString()})
              → Run #${run_b.run_id} (${new Date(run_b.run_at).toLocaleDateString()})
            </div>
          </div>
          ${selectors}
          ${deltaSection("New Confirmations",   "#4ade80", confirmed.added,   "bbg-delta-conf-grid",
            r => ({ Name: r.name, Firm: r.firm, Title: r.title, Location: r.location }))}
          ${deltaSection("Lost Confirmations",  "#f87171", confirmed.removed, "bbg-delta-conf-grid",
            r => ({ Name: r.name, Firm: r.firm, Title: r.title, Location: r.location }))}
          ${deltaSection("New Discrepancies",   "#fb923c", discrepancies.added,   "bbg-delta-disc-grid",
            r => ({ Name: r.name, Field: r.discrepancy_field, "BBG Value": r.new_file_value, "Master Value": r.master_file_values }))}
          ${deltaSection("Resolved Discrepancies", "#60a5fa", discrepancies.resolved, "bbg-delta-disc-grid",
            r => ({ Name: r.name, Field: r.discrepancy_field, "BBG Value": r.new_file_value, "Master Value": r.master_file_values }))}
          ${deltaSection("New Additions",       "#a78bfa", additions.added,   "bbg-delta-add-grid",
            r => ({ Name: r.name, Company: r.company, "Canonical": r.canonical_company, Location: r.location }))}
          ${deltaSection("Resolved Additions",  "#94a3b8", additions.resolved, "bbg-delta-add-grid",
            r => ({ Name: r.name, Company: r.company, "Canonical": r.canonical_company, Location: r.location }))}
        </div>
      `;
    }

    // ── Persistence view ──────────────────────────────────────────────────────
    if (mode === "persistence") {
      const pd = tab.state?.persistenceData;

      if (!pd) {
        return `<div class="detail-view-shell view-placeholder"><span>Persistence</span><p>Loading…</p></div>`;
      }
      if (!pd.length) {
        return `<div class="detail-view-shell view-placeholder"><span>Persistence</span><p>No discrepancies recorded yet.</p></div>`;
      }

      const persistBadge = (n) => {
        const cls = n >= 4 ? "persist-high" : n >= 2 ? "persist-mid" : "persist-low";
        return `<span class="persist-badge ${cls}">${n} run${n !== 1 ? "s" : ""}</span>`;
      };

      return `
        <div class="detail-view-shell detail-view-shell--compact">
          ${firmTerminal}
          <div class="detail-header">
            <div class="detail-title">${esc(firmName)} — Discrepancy Persistence</div>
            <div class="detail-subtitle" style="margin-top:4px;font-size:11px;opacity:.6;">
              ${pd.length} unique discrepancy${pd.length !== 1 ? "ies" : ""} across all runs —
              signals with 4+ runs are high-confidence
            </div>
          </div>
          <div class="table-header-grid bbg-persist-grid">
            <div>Name</div><div>Field</div><div>BBG Value</div><div>Master Value</div><div>First Seen</div><div>Last Seen</div><div>Runs</div>
          </div>
          ${pd.map(r => `
            <div class="table-row-wrap">
              <div class="table-row-grid bbg-persist-grid">
                <div>${esc(r.name || "")}</div>
                <div class="cell-mono">${esc(r.discrepancy_field || "")}</div>
                <div>${esc(r.new_file_value || "")}</div>
                <div style="opacity:.7;">${esc(r.master_file_values || "")}</div>
                <div class="cell-mono">${new Date(r.first_seen).toLocaleDateString()}</div>
                <div class="cell-mono">${new Date(r.last_seen).toLocaleDateString()}</div>
                <div>${persistBadge(r.run_count)}</div>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    }

    if (mode === "analytics") {
      const sec = (label, content) => `
        <div class="bbg-analytics-section">
          <div class="bbg-analytics-label">${label}</div>
          ${content}
        </div>`;
      const currentRun = runs?.find(r => r.run_id === selRunId) || runs?.[0];
      const analyticsStats = currentRun ? `
        <div class="bbg-stat-row">
          <div class="meta-item"><div class="meta-label">Confirmed</div><div class="meta-value meta-value--lg" style="color:#4ade80;">${(currentRun.confirmed_count || 0).toLocaleString()}</div></div>
          <div class="meta-item"><div class="meta-label">Discrepancies</div><div class="meta-value meta-value--lg" style="color:#f87171;">${(currentRun.discrepancy_count || 0).toLocaleString()}</div></div>
          <div class="meta-item"><div class="meta-label">Additions</div><div class="meta-value meta-value--lg" style="color:#60a5fa;">${(currentRun.addition_count || 0).toLocaleString()}</div></div>
          <div class="meta-item"><div class="meta-label">Tracking</div><div class="meta-value meta-value--lg" style="color:#a78bfa;">${currentRun.tracking_pct?.toFixed(1) ?? "—"}%</div></div>
        </div>` : "";
      return `
        <div class="detail-view-shell detail-view-shell--analytics">
          ${firmTerminal}
          ${runSelector}
          ${analyticsStats}
          ${sec("Extraction Trends — All Runs", _bbgTrendChart(runs))}
          <div class="bbg-analytics-2col">
            ${sec("Location Distribution — Current Run",
              runData ? _bbgLocationChart(runData.confirmed) : `<p style="opacity:.5;font-size:11px;">Loading…</p>`)}
            ${sec("Discrepancy Fields — Current Run",
              runData ? _bbgFieldChart(runData.discrepancies) : `<p style="opacity:.5;font-size:11px;">Loading…</p>`)}
          </div>
          ${sec("Run History", _bbgRunHistoryTable(runs, selRunId))}
        </div>
      `;
    }

    return `
      <div class="detail-view-shell detail-view-shell--compact">
        ${firmTerminal}
        ${runSelector}
        ${statRow}
        ${searchInput}
        <div>${tableHtml}</div>
      </div>
    `;
  },
  onActivate: async (tab) => {
    if (fetchingTabs.has(tab.id)) return;
    if (tab.state?.runs) return;
    fetchingTabs.add(tab.id);
    try {
      const runs = await mappingGet(`/bbg/firms/${tab.entityId}/runs`);
      if (!runs || runs.length === 0) {
        updateActiveTabState({ runs: [] }, tab.id);
        return;
      }
      const latestRunId = runs[0].run_id;
      const [confirmed, discrepancies, additions] = await Promise.all([
        mappingGet(`/bbg/runs/${latestRunId}/confirmed`),
        mappingGet(`/bbg/runs/${latestRunId}/discrepancies`),
        mappingGet(`/bbg/runs/${latestRunId}/additions`),
      ]);
      updateActiveTabState({
        runs,
        selectedRunId: latestRunId,
        runData: { confirmed, discrepancies, additions },
        mode: "confirmed",
      }, tab.id);
    } catch (e) {
      console.error("[bbg.firm] fetch failed:", e);
    } finally {
      fetchingTabs.delete(tab.id);
    }
  },
});

// ── View: encore.sync ──────────────────────────────────────────────────────────

const ENCORE_STATUS_CFG = {
  found:     { label: "Found",     color: "#4ade80" },
  possible:  { label: "Possible",  color: "#fbbf24" },
  ambiguous: { label: "Ambiguous", color: "#f97316" },
  not_found: { label: "Not Found", color: "#f87171" },
  error:     { label: "Error",     color: "#ef4444" },
};

function encoreStatusBadge(status) {
  const cfg = ENCORE_STATUS_CFG[status] || { label: status || "Pending", color: "var(--text-faint)" };
  return `<span style="display:inline-block;font-family:var(--font-data);font-size:10px;font-weight:600;border-radius:4px;padding:2px 6px;background:${cfg.color}22;color:${cfg.color};">${escapeHtml(cfg.label)}</span>`;
}

function encoreFilterCandidates(candidates, filter, query) {
  let list = candidates;
  if      (filter === "needs_review") list = list.filter(c => c.encore_status === "possible" || c.encore_status === "ambiguous");
  else if (filter === "not_found")    list = list.filter(c => c.encore_status === "not_found");
  else if (filter === "found")        list = list.filter(c => c.encore_status === "found");
  else if (filter === "error")        list = list.filter(c => c.encore_status === "error");
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(c =>
      c.candidate_name?.toLowerCase().includes(q) ||
      c.obsidian_firm?.toLowerCase().includes(q) ||
      c.encore_match_name?.toLowerCase().includes(q) ||
      c.encore_match_company?.toLowerCase().includes(q)
    );
  }
  return list;
}

// ── View: context.ingest ──────────────────────────────────────────────────────

const MOCK_INGEST_PROPOSAL = {
  sourceText: "Kai Lu spoke to Dan Gottlander about joining the high yield desk. He is currently a quantitative strategist that reports to Dan.",
  sourceType: "call_note",
  entities: [
    {
      id: "entity-kai-lu",
      detectedName: "Kai Lu",
      detectedContext: "Quantitative Strategist · reports to Dan Gottlander",
      match: {
        confidence: 0.94,
        person_id: "kai-lu-001",
        display_name: "Kai Lu",
        current_firm: "Barclays",
        current_title: "Quantitative Strategist",
        function: "Rates",
        reasoning: "Name + firm match confirmed. Role and reporting structure consistent with Barclays rates desk.",
      },
      diffs: [
        {
          id: "diff-kai-manager",
          table: "work_history",
          field: "manager",
          label: "Reports To",
          proposed: "Dan Gottlander",
          action: "update",
          enabled: true,
        },
        {
          id: "diff-kai-note",
          table: "person_notes",
          field: "content",
          label: "Note",
          proposed: "Expressed interest in high yield desk. Currently quant strat reporting to Dan Gottlander.",
          action: "insert",
          enabled: true,
        },
      ],
    },
    {
      id: "entity-dan-g",
      detectedName: "Dan Gottlander",
      detectedContext: "Senior role · Kai Lu reports to him · High yield desk",
      match: {
        confidence: 0.91,
        person_id: "dan-g-001",
        display_name: "Dan Gottlander",
        current_firm: "Barclays",
        current_title: "Managing Director, Rates",
        function: "Rates",
        reasoning: "Co-occurrence with Kai Lu (Barclays rates) confirms rates MD. Disambiguates from other records.",
      },
      diffs: [
        {
          id: "diff-dan-note",
          table: "person_notes",
          field: "content",
          label: "Note",
          proposed: "Spoke with Kai Lu (quant strat) re: high yield desk opportunity.",
          action: "insert",
          enabled: true,
        },
      ],
    },
  ],
};

function triggerIngestProcess(text) {
  updateActiveTabState({ phase: "processing", sourceText: text, proposal: null });
  // Simulated delay — replace with real backend call
  setTimeout(() => {
    updateActiveTabState({ phase: "proposal", proposal: MOCK_INGEST_PROPOSAL });
  }, 1800);
}

registerWorkspaceView({
  id: "context.ingest",
  hasContext: true,
  match: (tab) => tab.type === "context.ingest",
  toolbar: () => ({
    left:  [{ id: "context.ingest.view", label: "Context Drop", active: true }],
    right: [],
  }),
  render: (tab) => {
    const phase    = tab.state?.phase    || "idle";
    const proposal = tab.state?.proposal || null;

    if (phase === "idle") {
      return `
        <div class="ingest-view">
          <div class="ingest-drop-zone" id="contextDropZone">
            <div class="ingest-drop-icon">↓</div>
            <div class="ingest-drop-title">Drop context here</div>
            <div class="ingest-drop-sub">Call notes, CVs, LinkedIn profiles, emails — any text</div>
            <div class="ingest-drop-hint">Ctrl+V to paste · drag a file · or use the sample below</div>
            <button class="ingest-btn-discard" id="ingestLoadSample" style="margin-top:14px;">Try sample</button>
          </div>
        </div>`;
    }

    if (phase === "processing") {
      return `
        <div class="ingest-view">
          <div class="ingest-processing">
            <div class="ingest-processing-spinner"></div>
            <div class="ingest-processing-label">Resolving entities…</div>
            <div class="ingest-processing-steps">Reading context<br>Searching profiles<br>Building proposal</div>
          </div>
          <div class="ingest-drop-zone ingest-drop-zone--compact" id="contextDropZone">
            <div class="ingest-drop-compact-label">Drop another</div>
          </div>
        </div>`;
    }

    if (phase === "confirmed") {
      const count = (proposal?.entities || []).reduce((n, e) => n + e.diffs.filter(d => d.enabled).length, 0);
      const names = (proposal?.entities || []).map(e => e.match.display_name).join(" · ");
      return `
        <div class="ingest-view">
          <div class="ingest-processing">
            <div class="ingest-processing-label" style="color:#4ade80;">Written to Core DB</div>
            <div class="ingest-processing-steps">
              ${count} field${count !== 1 ? "s" : ""} written<br>
              ${escapeHtml(names)}
            </div>
            <button class="ingest-btn-discard" id="ingestReset" style="margin-top:18px;">Drop another</button>
          </div>
          <div class="ingest-drop-zone ingest-drop-zone--compact" id="contextDropZone">
            <div class="ingest-drop-compact-label">Drop another</div>
          </div>
        </div>`;
    }

    // phase === "proposal"
    if (!proposal) return `<div class="ingest-view"><div class="ingest-processing"><div class="ingest-processing-label">No proposal data.</div></div></div>`;

    const totalEnabled = proposal.entities.reduce((n, e) => n + e.diffs.filter(d => d.enabled).length, 0);

    const entityRows = proposal.entities.map(e => `
      <div class="ingest-entity-row">
        <div>
          <div class="ingest-entity-detected">${escapeHtml(e.detectedName)}</div>
          <div class="ingest-entity-context">${escapeHtml(e.detectedContext)}</div>
        </div>
        <div class="ingest-match-card">
          <div class="ingest-match-header">
            <div class="ingest-match-name">${escapeHtml(e.match.display_name)}</div>
            <div class="ingest-match-confidence">${Math.round(e.match.confidence * 100)}%</div>
          </div>
          <div class="ingest-match-meta">${escapeHtml(e.match.current_firm)} · ${escapeHtml(e.match.current_title)}</div>
          <div class="ingest-match-reasoning">${escapeHtml(e.match.reasoning)}</div>
        </div>
      </div>
    `).join("");

    const diffGroups = proposal.entities.map(e => `
      <div class="ingest-diff-entity">${escapeHtml(e.match.display_name)}</div>
      ${e.diffs.map(d => `
        <div class="ingest-diff-row${d.enabled ? "" : " is-disabled"}">
          <div class="ingest-diff-table">${escapeHtml(d.table)}</div>
          <div class="ingest-diff-field">${escapeHtml(d.field)}</div>
          <div class="ingest-diff-value" title="${escapeHtml(d.proposed)}">${escapeHtml(d.proposed)}</div>
          <div class="ingest-diff-action ingest-diff-action--${d.action}">${d.action}</div>
          <button class="ingest-diff-toggle${d.enabled ? " is-active" : ""}"
            data-toggle-diff="${escapeHtml(d.id)}"
            data-entity-id="${escapeHtml(e.id)}"
            title="${d.enabled ? "Exclude this field" : "Include this field"}">✓</button>
        </div>
      `).join("")}
    `).join("");

    return `
      <div class="ingest-view">
        <div class="ingest-proposal">
          <div class="ingest-section">
            <div class="ingest-section-label">Detected Entities</div>
            ${entityRows}
          </div>
          <div class="ingest-section">
            <div class="ingest-section-label">Proposed Changes</div>
            ${diffGroups}
          </div>
          <div class="ingest-source-preview" id="ingestSourcePreview">
            <button class="ingest-source-toggle" id="ingestSourceToggle">▶ source text</button>
            <div class="ingest-source-text">${escapeHtml(proposal.sourceText)}</div>
          </div>
        </div>
        <div class="ingest-actions">
          <button class="ingest-btn-confirm" id="ingestConfirm">Confirm &amp; Write</button>
          <button class="ingest-btn-discard" id="ingestDiscard">Discard</button>
          <div class="ingest-field-count" id="ingestFieldCount">${totalEnabled} field${totalEnabled !== 1 ? "s" : ""} selected</div>
        </div>
        <div class="ingest-drop-zone ingest-drop-zone--compact" id="contextDropZone">
          <div class="ingest-drop-compact-label">Drop another</div>
        </div>
      </div>`;
  },

  onActivate: async (tab) => {
    const phase    = tab.state?.phase    || "idle";
    const proposal = tab.state?.proposal || null;

    // Wire drop zone
    const dropZone = document.getElementById("contextDropZone");
    if (dropZone) {
      dropZone.addEventListener("dragover",  (e) => { e.preventDefault(); dropZone.classList.add("ingest-drop-zone--over"); });
      dropZone.addEventListener("dragleave", ()  => { dropZone.classList.remove("ingest-drop-zone--over"); });
      dropZone.addEventListener("drop",      (e) => {
        e.preventDefault();
        dropZone.classList.remove("ingest-drop-zone--over");
        const text = e.dataTransfer.getData("text/plain");
        const file = e.dataTransfer.files?.[0];
        if (text)      triggerIngestProcess(text);
        else if (file) triggerIngestProcess(`[File dropped: ${file.name}]`);
      });
    }

    // Paste handler — only fires once per activation, only when this tab is active and not in proposal review
    document.addEventListener("paste", function onPaste(e) {
      const active = getActiveTab();
      if (active?.type !== "context.ingest") { document.removeEventListener("paste", onPaste); return; }
      if (active?.state?.phase === "proposal") return;
      const text = e.clipboardData?.getData("text/plain");
      if (text?.trim()) { document.removeEventListener("paste", onPaste); triggerIngestProcess(text.trim()); }
    });

    // Sample button
    const sampleBtn = document.getElementById("ingestLoadSample");
    if (sampleBtn) sampleBtn.addEventListener("click", () => triggerIngestProcess(MOCK_INGEST_PROPOSAL.sourceText));

    // Reset button (confirmed state)
    const resetBtn = document.getElementById("ingestReset");
    if (resetBtn) resetBtn.addEventListener("click", () => updateActiveTabState({ phase: "idle", proposal: null }));

    if (phase !== "proposal" || !proposal) return;

    // Diff toggles
    document.querySelectorAll("[data-toggle-diff]").forEach(btn => {
      btn.addEventListener("click", () => {
        const diffId   = btn.dataset.toggleDiff;
        const entityId = btn.dataset.entityId;
        const updated  = {
          ...proposal,
          entities: proposal.entities.map(e => {
            if (e.id !== entityId) return e;
            return { ...e, diffs: e.diffs.map(d => d.id === diffId ? { ...d, enabled: !d.enabled } : d) };
          }),
        };
        updateActiveTabState({ proposal: updated });
      });
    });

    // Source toggle
    const srcToggle  = document.getElementById("ingestSourceToggle");
    const srcPreview = document.getElementById("ingestSourcePreview");
    if (srcToggle && srcPreview) {
      srcToggle.addEventListener("click", () => {
        const open = srcPreview.classList.toggle("is-expanded");
        srcToggle.textContent = (open ? "▼" : "▶") + " source text";
      });
    }

    // Confirm
    const confirmBtn = document.getElementById("ingestConfirm");
    if (confirmBtn) confirmBtn.addEventListener("click", () => updateActiveTabState({ phase: "confirmed" }));

    // Discard
    const discardBtn = document.getElementById("ingestDiscard");
    if (discardBtn) discardBtn.addEventListener("click", () => updateActiveTabState({ phase: "idle", proposal: null }));
  },
});

registerWorkspaceView({
  id: "encore.sync",
  hasContext: false,
  match: (tab) => tab.type === "encore.sync",
  toolbar: () => ({
    left:  [{ id: "encore.sync.view", label: "Encore Sync", active: true }],
    right: [{ id: "encore.sync.refresh", label: "Refresh" }],
  }),
  onActivate: async (tab) => {
    if (Array.isArray(tab.state?.candidates) || fetchingTabs.has(tab.id)) return;
    fetchingTabs.add(tab.id);
    try {
      const [stats, candidates] = await Promise.all([
        encoreGet("/stats"),
        encoreGet("/candidates"),
      ]);
      updateActiveTabState({ stats, candidates }, tab.id);
    } catch (e) {
      updateActiveTabState({ stats: null, candidates: null, error: e.message }, tab.id);
    } finally {
      fetchingTabs.delete(tab.id);
    }
    const input = document.getElementById("encoreSearchInput");
    if (input) {
      input.addEventListener("input", debounce((ev) => {
        const t = getActiveTab();
        if (t?.type === "encore.sync") updateActiveTabState({ query: ev.target.value }, t.id);
      }, 150));
    }
  },
  render: (tab) => {
    const candidates = tab.state?.candidates;
    const stats      = tab.state?.stats;
    const filter     = tab.state?.filter || "all";
    const query      = tab.state?.query  || "";
    const error      = tab.state?.error;

    if (error) return `
      <div class="table-shell view-placeholder">
        <span>Encore Sync</span>
        <p style="color:var(--text-error,#f87171);">${escapeHtml(error)}</p>
        <p style="font-size:11px;color:var(--text-faint);">Is the encore_scraper API running?<br><code style="font-family:var(--font-data);font-size:10px;">uvicorn api:app --port 5050</code></p>
      </div>`;

    const loading = !candidates;

    const statsBar = stats ? `
      <div class="bbg-stat-row" style="grid-template-columns:repeat(5,1fr);margin-bottom:12px;">
        <div class="meta-item"><div class="meta-label">Total</div><div class="meta-value cell-mono">${stats.total}</div></div>
        <div class="meta-item"><div class="meta-label">Found</div><div class="meta-value cell-mono" style="color:#4ade80;">${stats.found}</div></div>
        <div class="meta-item"><div class="meta-label">Needs Review</div><div class="meta-value cell-mono" style="color:#fbbf24;">${stats.needs_review}</div></div>
        <div class="meta-item"><div class="meta-label">Not Found</div><div class="meta-value cell-mono" style="color:#f87171;">${stats.not_found}</div></div>
        <div class="meta-item"><div class="meta-label">Error</div><div class="meta-value cell-mono" style="color:#ef4444;">${stats.error}</div></div>
      </div>` : "";

    const filterDefs = [
      { key: "all",          label: "All" },
      { key: "needs_review", label: `Needs Review${stats?.needs_review ? ` · ${stats.needs_review}` : ""}` },
      { key: "not_found",    label: `Not Found${stats?.not_found ? ` · ${stats.not_found}` : ""}` },
      { key: "found",        label: `Found${stats?.found ? ` · ${stats.found}` : ""}` },
    ];

    const filterBtns = filterDefs.map(f => {
      const active = filter === f.key;
      return `<button class="encore-filter-btn" data-encore-filter="${f.key}"
        style="font-family:var(--font-interface);font-size:11px;font-weight:${active ? "600" : "400"};
               padding:4px 10px;border-radius:4px;cursor:pointer;white-space:nowrap;
               border:1px solid ${active ? "var(--interactive-accent)" : "var(--border-subtle)"};
               background:${active ? "rgba(0,115,255,.12)" : "transparent"};
               color:${active ? "var(--interactive-accent)" : "var(--text-muted)"};">
        ${escapeHtml(f.label)}
      </button>`;
    }).join("");

    const visible = loading ? [] : encoreFilterCandidates(candidates, filter, query);
    const countLabel = loading ? "" : `${visible.length.toLocaleString()} candidate${visible.length !== 1 ? "s" : ""}`;

    const filterBar = `
      <div style="display:flex;align-items:center;gap:8px;padding:0 24px;margin-bottom:12px;flex-wrap:wrap;">
        ${filterBtns}
        <input id="encoreSearchInput" class="encore-search-input" type="text"
          value="${escapeHtml(query)}" placeholder="Search name, firm, match…" autocomplete="off" spellcheck="false"
          style="margin-left:8px;max-width:260px;height:28px;padding:0 10px;font-family:var(--font-interface);
                 font-size:12px;border-radius:4px;background:var(--surface-2,rgba(255,255,255,.05));
                 border:1px solid var(--border-subtle);color:var(--text-normal);" />
        <span style="font-family:var(--font-data);font-size:10px;color:var(--text-faint);margin-left:auto;">${countLabel}</span>
      </div>`;

    if (loading) {
      return `
        <div class="table-shell" style="padding:16px 0;">
          <div style="padding:0 24px;">${statsBar}</div>
          ${filterBar}
          ${skeletonGrid(7, "encore-sync-grid")}
        </div>`;
    }

    const rows = visible.map(c => {
      const status      = c.encore_status;
      const matchName   = c.encore_match_name   ? escapeHtml(c.encore_match_name)   : `<span style="color:var(--text-faint)">—</span>`;
      const matchCo     = c.encore_match_company ? ` · <span style="color:var(--text-muted)">${escapeHtml(c.encore_match_company)}</span>` : "";
      const guidDisplay = c.encore_guid
        ? `<span class="cell-mono" style="font-size:10px;color:var(--text-muted);" title="${escapeHtml(c.encore_guid)}">${escapeHtml(c.encore_guid.slice(0, 8))}…</span>`
        : `<span style="color:var(--text-faint)">—</span>`;
      const lastProbed  = c.last_probe_at ? new Date(c.last_probe_at).toLocaleDateString() : "—";
      const needsAction = status === "possible" || status === "ambiguous" || status === "not_found";
      const actionBtn   = needsAction
        ? `<button class="encore-match-btn" data-encore-match="${escapeHtml(c.candidate_name)}" data-current-guid="${escapeHtml(c.encore_guid || "")}"
             style="font-family:var(--font-interface);font-size:10px;font-weight:600;letter-spacing:.04em;
                    text-transform:uppercase;color:var(--interactive-accent);background:none;border:none;cursor:pointer;padding:0;">
             Set GUID
           </button>`
        : "";
      return `
        <div class="table-row-wrap">
          <div class="table-row-grid encore-sync-grid">
            <div style="font-family:var(--font-interface);font-size:12px;font-weight:500;">${escapeHtml(c.candidate_name || "")}</div>
            <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(c.obsidian_firm || "—")}</div>
            <div>${encoreStatusBadge(status)}</div>
            <div style="font-size:11px;">${matchName}${matchCo}</div>
            <div>${guidDisplay}</div>
            <div class="cell-mono" style="font-size:10px;color:var(--text-faint);">${escapeHtml(lastProbed)}</div>
            <div>${actionBtn}</div>
          </div>
        </div>`;
    }).join("");

    const empty = visible.length === 0
      ? `<div style="padding:32px 24px;color:var(--text-faint);font-size:12px;">No candidates match this filter.</div>`
      : "";

    return `
      <div class="table-shell" style="padding:16px 0;">
        <div style="padding:0 24px;">${statsBar}</div>
        ${filterBar}
        <div class="table-header-grid encore-sync-grid" style="padding-left:24px;padding-right:24px;">
          <div>Name</div>
          <div>Firm</div>
          <div>Status</div>
          <div>Encore Match</div>
          <div>GUID</div>
          <div>Last Probed</div>
          <div></div>
        </div>
        ${rows}${empty}
      </div>`;
  },
});
