import { registerWorkspaceView, updateActiveTabState, getActiveTab, fetchingTabs } from "./workspace.js";
import { finraGet, bankstGet, setFinraChangesCache } from "./api.js";
import { escapeHtml, debounce, metaHTML } from "./utils.js";
import { entityData } from "./mock-data.js";

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
        finraGet("/api/summary"),
        finraGet("/api/firms/arrivals?limit=12"),
        finraGet("/api/firms/departures?limit=12"),
        finraGet("/api/runs"),
        finraGet("/api/changes?limit=100"),
        finraGet("/api/individuals"),
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
