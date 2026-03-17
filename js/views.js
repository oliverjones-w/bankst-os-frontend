import { registerWorkspaceView, updateActiveTabState, getActiveTab, fetchingTabs } from "./workspace.js";
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

// ── View: hf.table ─────────────────────────────────────────────────────────────

function hfRows(records, query) {
  const q = (query || "").toLowerCase();
  const filtered = q
    ? records.filter(r => [r.name, r.firm, r.title, r.function, r.strategy, r.location]
        .some(v => (v || "").toLowerCase().includes(q)))
    : records;
  if (!filtered.length)
    return `<div class="master-empty">No matches${q ? ` for "${escapeHtml(query)}"` : ""}.</div>`;
  return filtered.map(r => `
    <div class="master-table-row-grid" data-select-map-record="${escapeHtml(r.id)}" data-map-source="hf" style="cursor:pointer;">
      <div style="color:var(--text-normal);font-weight:500;">${escapeHtml(r.name || "—")}</div>
      <div class="truncate">${escapeHtml(r.firm || "—")}</div>
      <div class="truncate">${escapeHtml(r.title || "—")}</div>
      <div>${escapeHtml(r.function || "—")}</div>
      <div>${escapeHtml(r.strategy || "—")}</div>
      <div>${escapeHtml(r.location || "—")}</div>
      <div>
        <button class="master-import-btn"
          data-master-import="${escapeHtml(r.id)}"
          data-map-source="hf"
          title="Import ${escapeHtml(r.name || "")} into BankSt OS">Import</button>
      </div>
    </div>
  `).join("");
}

registerWorkspaceView({
  id: "hf.table",
  hasContext: true,
  match: (tab) => tab.type === "hf.table",
  toolbar: () => ({
    left:  [{ id: "hf.table.mode.table", label: "HF Map", active: true }],
    right: [{ id: "hf.table.refresh", label: "Refresh" }],
  }),
  onActivate: async (tab) => {
    // Fetch if needed
    if (!tab.state?.records && !fetchingTabs.has(tab.id)) {
      fetchingTabs.add(tab.id);
      try {
        const [records, allChanges, dailyChanges] = await Promise.all([
          mappingGet("/hf/records"),
          mappingGet("/hf/changes?limit=200"),
          mappingGet("/hf/daily-changes?days=60"),
        ]);
        updateActiveTabState({ records, allChanges, dailyChanges, error: null }, tab.id);
      } catch (e) {
        updateActiveTabState({ records: null, allChanges: null, error: e.message }, tab.id);
      } finally {
        fetchingTabs.delete(tab.id);
      }
    }
    // Wire search input
    const input = document.getElementById("hfSearchInput");
    if (!input || input._wired) return;
    input._wired = true;
    input.focus();
    input.addEventListener("input", debounce((e) => {
      const q = e.target.value;
      const activeTab = getActiveTab();
      if (activeTab) activeTab.state.query = q;
      const results = document.getElementById("hfSearchResults");
      const count   = document.getElementById("hfSearchCount");
      if (!results) return;
      const recs = activeTab?.state?.records || [];
      results.innerHTML = hfRows(recs, q);
      if (count) count.textContent = q ? `${results.querySelectorAll(".master-table-row-grid").length} results` : `${recs.length} records`;
    }, 200));
  },
  render: (tab) => {
    if (tab.state?.error)
      return `<div class="table-shell view-placeholder"><span>HF Map</span><p class="text-error">Error: ${escapeHtml(tab.state.error)}</p></div>`;

    const records = tab.state?.records;
    const query   = tab.state?.query || "";

    const skeletonRows = Array(14).fill(0).map(() => `
      <div class="master-table-row-grid">
        ${Array(7).fill(`<div class="skeleton skeleton-text"></div>`).join("")}
      </div>
    `).join("");

    const bodyHTML = records
      ? hfRows(records, query)
      : skeletonRows;

    return `
      <div class="master-search-shell">
        <div class="master-search-bar">
          <input id="hfSearchInput" class="master-search-input" type="text"
            placeholder="Search ${records ? records.length.toLocaleString() : "…"} HF records by name, firm, title, strategy…"
            value="${escapeHtml(query)}" autocomplete="off" spellcheck="false" />
          <span id="hfSearchCount" class="master-search-count">${records && !query ? `${records.length} records` : ""}</span>
        </div>
        <div id="hfSearchResults" class="master-search-results">
          <div class="master-table-header-grid">
            <div>Name</div><div>Firm</div><div>Title</div>
            <div>Function</div><div>Strategy</div><div>Location</div><div></div>
          </div>
          ${bodyHTML}
        </div>
      </div>
    `;
  },
});

// ── View: ir.table ─────────────────────────────────────────────────────────────

function irRows(records, query) {
  const q = (query || "").toLowerCase();
  const filtered = q
    ? records.filter(r => [r.name, r.current_firm, r.current_title, r.function, r.group, r.current_location]
        .some(v => (v || "").toLowerCase().includes(q)))
    : records;
  if (!filtered.length)
    return `<div class="master-empty">No matches${q ? ` for "${escapeHtml(query)}"` : ""}.</div>`;
  return filtered.map(r => `
    <div class="master-table-row-grid" data-select-map-record="${escapeHtml(r.id)}" data-map-source="ir" style="cursor:pointer;">
      <div style="color:var(--text-normal);font-weight:500;">${escapeHtml(r.name || "—")}</div>
      <div class="truncate">${escapeHtml(r.current_firm || "—")}</div>
      <div class="truncate">${escapeHtml(r.current_title || "—")}</div>
      <div>${escapeHtml(r.function || "—")}</div>
      <div>${escapeHtml(r.group || "—")}</div>
      <div>${escapeHtml(r.current_location || "—")}</div>
      <div>
        <button class="master-import-btn"
          data-master-import="${escapeHtml(r.id)}"
          data-map-source="ir"
          title="Import ${escapeHtml(r.name || "")} into BankSt OS">Import</button>
      </div>
    </div>
  `).join("");
}

registerWorkspaceView({
  id: "ir.table",
  hasContext: true,
  match: (tab) => tab.type === "ir.table",
  toolbar: () => ({
    left:  [{ id: "ir.table.mode.table", label: "IR Map", active: true }],
    right: [{ id: "ir.table.refresh", label: "Refresh" }],
  }),
  onActivate: async (tab) => {
    // Fetch if needed
    if (!tab.state?.records && !fetchingTabs.has(tab.id)) {
      fetchingTabs.add(tab.id);
      try {
        const [records, allChanges, dailyChanges] = await Promise.all([
          mappingGet("/ir/records"),
          mappingGet("/ir/changes?limit=200"),
          mappingGet("/ir/daily-changes?days=60"),
        ]);
        updateActiveTabState({ records, allChanges, dailyChanges, error: null }, tab.id);
      } catch (e) {
        updateActiveTabState({ records: null, allChanges: null, error: e.message }, tab.id);
      } finally {
        fetchingTabs.delete(tab.id);
      }
    }
    // Wire search input
    const input = document.getElementById("irSearchInput");
    if (!input || input._wired) return;
    input._wired = true;
    input.focus();
    input.addEventListener("input", debounce((e) => {
      const q = e.target.value;
      const activeTab = getActiveTab();
      if (activeTab) activeTab.state.query = q;
      const results = document.getElementById("irSearchResults");
      const count   = document.getElementById("irSearchCount");
      if (!results) return;
      const recs = activeTab?.state?.records || [];
      results.innerHTML = irRows(recs, q);
      if (count) count.textContent = q ? `${results.querySelectorAll(".master-table-row-grid").length} results` : `${recs.length} records`;
    }, 200));
  },
  render: (tab) => {
    if (tab.state?.error)
      return `<div class="table-shell view-placeholder"><span>IR Map</span><p class="text-error">Error: ${escapeHtml(tab.state.error)}</p></div>`;

    const records = tab.state?.records;
    const query   = tab.state?.query || "";

    const skeletonRows = Array(14).fill(0).map(() => `
      <div class="master-table-row-grid">
        ${Array(7).fill(`<div class="skeleton skeleton-text"></div>`).join("")}
      </div>
    `).join("");

    const bodyHTML = records
      ? irRows(records, query)
      : skeletonRows;

    return `
      <div class="master-search-shell">
        <div class="master-search-bar">
          <input id="irSearchInput" class="master-search-input" type="text"
            placeholder="Search ${records ? records.length.toLocaleString() : "…"} IR records by name, firm, title, group…"
            value="${escapeHtml(query)}" autocomplete="off" spellcheck="false" />
          <span id="irSearchCount" class="master-search-count">${records && !query ? `${records.length} records` : ""}</span>
        </div>
        <div id="irSearchResults" class="master-search-results">
          <div class="master-table-header-grid">
            <div>Name</div><div>Current Firm</div><div>Title</div>
            <div>Function</div><div>Group</div><div>Location</div><div></div>
          </div>
          ${bodyHTML}
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
