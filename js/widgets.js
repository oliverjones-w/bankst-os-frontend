import { getActiveContext, workspaceState } from "./workspace.js";
import { contextData } from "./mock-data.js";
import { escapeHtml } from "./utils.js";
import { getTrendingCache, getFinraChangesCache } from "./api.js";

// ── Render helpers ─────────────────────────────────────────────────────────────
export function renderContextCard(title, bodyHtml) {
  return `
    <div class="context-card">
      <div class="context-card-title">${title}</div>
      ${bodyHtml}
    </div>
  `;
}

function renderStackList(items) {
  return `<div class="stack-list">${items.map(item => `<div class="stack-item">${item}</div>`).join("")}</div>`;
}

function renderFeed(items) {
  return `
    <div class="feed-list">
      ${items.map(item => `
        <div class="feed-item">
          <div class="feed-item-title">${item.title}</div>
          <div class="feed-item-meta">${item.meta}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// ── Widget registry ────────────────────────────────────────────────────────────
const rightRailWidgets = [];

// ── Widget: context.ingest ────────────────────────────────────────────────────

export function registerRightRailWidget(widget) {
  rightRailWidgets.push(widget);
}

registerRightRailWidget({
  id: "context-ingest-entities",
  order: 5,
  when: (ctx) => ctx.type === "context.ingest",
  render: (ctx) => {
    const phase    = ctx.tab?.state?.phase    || "idle";
    const proposal = ctx.tab?.state?.proposal || null;

    if (phase === "idle") {
      return renderContextCard("Context Drop", `
        <div class="ingest-rail-hint">Drop call notes, CVs, or any text into the center view. The AI will resolve which profiles are referenced and propose structured updates.</div>
      `);
    }

    if (phase === "processing") {
      return renderContextCard("Resolving…", `
        <div class="ingest-rail-hint">Searching profiles · Building proposal…</div>
      `);
    }

    if (phase === "confirmed") {
      return renderContextCard("Written", `
        <div class="ingest-rail-hint">Changes confirmed and written to Core DB.</div>
      `);
    }

    if (!proposal) return "";

    const cards = proposal.entities.map(e => `
      <div class="ingest-rail-entity">
        <div class="ingest-rail-entity-name">${escapeHtml(e.match.display_name)}</div>
        <div class="ingest-rail-entity-meta">${escapeHtml(e.match.current_firm)}</div>
        <div class="ingest-rail-entity-meta">${escapeHtml(e.match.current_title)}</div>
        <div class="ingest-rail-entity-confidence">${Math.round(e.match.confidence * 100)}% match · ${escapeHtml(e.match.function)}</div>
      </div>
    `).join("");

    return renderContextCard("Matched Profiles", cards);
  },
});

// ── Widgets: people.table ──────────────────────────────────────────────────────
registerRightRailWidget({
  id: "people-table-trending",
  order: 5,
  when: (ctx) => ctx.type === "people.table",
  render: () => {
    const cache = getTrendingCache();
    if (!cache.length) return "";
    return renderContextCard("Trending", `
      <div class="feed-list">
        ${cache.map((item) => `
          <div class="feed-item">
            <div class="feed-item-title"><span class="trending-indicator"></span>${escapeHtml(item.entity_label || item.entity_id)}</div>
            <div class="feed-item-meta">${item.entity_type} · ${item.view_count} view${item.view_count !== 1 ? "s" : ""} / 48h</div>
          </div>
        `).join("")}
      </div>
    `);
  },
});

registerRightRailWidget({
  id: "people-table-activity",
  order: 10,
  when: (ctx) => ctx.type === "people.table",
  render: () => renderContextCard("Recent Activity", renderFeed([
    { title: "David Flowerdew updated", meta: "2 hours ago" },
    { title: "BNP Paribas note added",  meta: "Today" },
    { title: "Reminder due",            meta: "This afternoon" },
  ])),
});

registerRightRailWidget({
  id: "people-table-saved-views",
  order: 20,
  when: (ctx) => ctx.type === "people.table",
  render: () => renderContextCard("Saved Views", renderStackList([
    "Top Macro PMs", "Agency MBS", "Rates RV", "West Coast Crypto",
  ])),
});

registerRightRailWidget({
  id: "people-table-reminders",
  order: 30,
  when: (ctx) => ctx.type === "people.table",
  render: () => renderContextCard("Reminders", renderStackList([
    "Call candidate Thursday",
    "Review extracted strategies",
    "Update firm mapping",
  ])),
});

// ── Widgets: firms.table ───────────────────────────────────────────────────────
registerRightRailWidget({
  id: "firms-table-stats",
  order: 10,
  when: (ctx) => ctx.type === "firms.table",
  render: (ctx) => {
    const firms = ctx.tab?.state?.firms;
    if (!firms) return "";
    const withPlatforms = firms.filter(f => f.platform_count > 0).length;
    const withBlacklist = firms.filter(f => f.blacklist_count > 0).length;
    return renderContextCard("Coverage", `
      <div class="meta-grid">
        <div class="meta-block"><div class="meta-label">Firms</div><div class="meta-value">${firms.length}</div></div>
        <div class="meta-block"><div class="meta-label">w/ Platforms</div><div class="meta-value">${withPlatforms}</div></div>
        <div class="meta-block"><div class="meta-label">w/ Blacklist</div><div class="meta-value">${withBlacklist}</div></div>
      </div>
    `);
  },
});

// ── Widgets: person ────────────────────────────────────────────────────────────
registerRightRailWidget({
  id: "person-activity",
  order: 10,
  when: (ctx) => ctx.type === "person",
  render: (ctx) => renderContextCard("Recent Activity",
    renderFeed(contextData.person[ctx.entityId]?.activity || [])),
});

registerRightRailWidget({
  id: "person-strategies",
  order: 20,
  when: (ctx) => ctx.type === "person" && ctx.strategies?.length > 0,
  render: (ctx) => renderContextCard("Investment Focus", `
    <div class="tag-cloud">
      ${ctx.strategies.map(s => `
        <span class="pill" title="Confidence: ${s.confidence ?? "N/A"}">${s.strategy_name || s.strategy_free_text}</span>
      `).join("")}
    </div>
  `),
});

registerRightRailWidget({
  id: "person-performance-preview",
  order: 35,
  when: (ctx) => ctx.type === "person" && ctx.performance?.length > 0,
  render: (ctx) => {
    const latest = ctx.performance[0];
    const pnlFormatted = new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", notation: "compact",
    }).format(latest.pnl_usd);
    return renderContextCard("Latest Performance", `
      <div class="pnl-grid">
        <div class="pnl-stat"><label>${latest.year} PnL</label><span class="value">${pnlFormatted}</span></div>
        <div class="pnl-stat"><label>Return</label><span class="value">${latest.return_pct}%</span></div>
      </div>
    `);
  },
});

registerRightRailWidget({
  id: "person-notes",
  order: 50,
  when: (ctx) => ctx.type === "person",
  render: (ctx) => renderContextCard("Notes",
    renderStackList(contextData.person[ctx.entityId]?.notes || [])),
});

registerRightRailWidget({
  id: "person-reminders",
  order: 60,
  when: (ctx) => ctx.type === "person",
  render: (ctx) => renderContextCard("Reminders",
    renderStackList(contextData.person[ctx.entityId]?.reminders || [])),
});

registerRightRailWidget({
  id: "person-related",
  order: 70,
  when: (ctx) => ctx.type === "person",
  render: (ctx) => renderContextCard("Related",
    renderStackList(contextData.person[ctx.entityId]?.related || [])),
});

// ── Widgets: firm ──────────────────────────────────────────────────────────────
registerRightRailWidget({
  id: "firm-activity",
  order: 10,
  when: (ctx) => ctx.type === "firm",
  render: (ctx) => renderContextCard("Recent Activity",
    renderFeed(contextData.firm[ctx.entityId]?.activity || [])),
});

registerRightRailWidget({
  id: "firm-funds-preview",
  order: 25,
  when: (ctx) => ctx.type === "firm" && ctx.funds?.length > 0,
  render: (ctx) => renderContextCard("Active Funds", `
    <div class="meta-grid">
      ${ctx.funds.slice(0, 3).map(f => `
        <div class="meta-block">
          <div class="meta-label">${f.name}</div>
          <div class="meta-value">
            ${f.aum_usd
              ? (f.aum_usd / 1e9 >= 1
                  ? (f.aum_usd / 1e9).toFixed(1) + "B"
                  : (f.aum_usd / 1e6).toFixed(0) + "M")
              : "AUM N/A"}
            <span class="pill">${f.fund_type}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `),
});

registerRightRailWidget({
  id: "firm-notes",
  order: 50,
  when: (ctx) => ctx.type === "firm",
  render: (ctx) => renderContextCard("Notes",
    renderStackList(contextData.firm[ctx.entityId]?.notes || [])),
});

registerRightRailWidget({
  id: "firm-reminders",
  order: 60,
  when: (ctx) => ctx.type === "firm",
  render: (ctx) => renderContextCard("Reminders",
    renderStackList(contextData.firm[ctx.entityId]?.reminders || [])),
});

registerRightRailWidget({
  id: "firm-related",
  order: 70,
  when: (ctx) => ctx.type === "firm",
  render: (ctx) => renderContextCard("Related",
    renderStackList(contextData.firm[ctx.entityId]?.related || [])),
});

// ── Widgets: FINRA ─────────────────────────────────────────────────────────────
registerRightRailWidget({
  id: "finra-run-history",
  order: 10,
  when: (ctx) => ctx.type === "finra",
  render: (ctx) => {
    const runs = ctx.tab?.state?.data?.runs;
    if (!runs?.length) return renderContextCard("Run History", `
      <div class="feed-item" style="color:var(--text-faint)">No runs loaded yet.</div>
    `);
    return renderContextCard("Run History", `
      <div class="stack-list">
        ${runs.slice(0, 12).map(r => {
          const ts = r.completed_at?.slice(0, 16).replace("T", " ") || "—";
          const hasChanges = r.changes_detected > 0;
          return `
            <div class="feed-item">
              <div class="feed-item-title" style="font-family:var(--font-data);font-size:11px;">
                ${ts}
                ${hasChanges ? `<span style="color:var(--color-green);margin-left:6px;">+${r.changes_detected}</span>` : ""}
              </div>
              <div class="feed-item-meta">${r.total_checked} checked</div>
            </div>
          `;
        }).join("")}
      </div>
    `);
  },
});

registerRightRailWidget({
  id: "finra-activity-feed",
  order: 20,
  when: (ctx) => ctx.type === "finra",
  render: (ctx) => {
    const changes = ctx.tab?.state?.data?.changes;
    if (!changes?.length) return renderContextCard("Scraper Activity", `
      <div class="feed-item" style="color:var(--text-faint)">No activity captured yet.</div>
    `);
    return renderContextCard("Scraper Activity", `
      <div class="feed-list">
        ${changes.map(r => {
          const s = (r.new_status || "").toUpperCase();
          const isActive   = !s.includes("INACTIVE") && !s.includes("NOT FOUND") && s !== "" && s !== "ERROR";
          const isInactive = s.includes("INACTIVE");
          const dotClass   = isActive ? "dot--active" : isInactive ? "dot--inactive" : "dot--null";
          return `
            <div class="feed-item">
              <div class="feed-item-title">
                <span class="status-dot ${dotClass}" style="display:inline-block;"></span>
                ${r.name || "—"}
              </div>
              <div class="feed-item-meta">${r.old_status || "—"} → ${r.new_status || "—"}</div>
              <div class="feed-item-meta" style="font-family:var(--font-data);">${r.detected_at?.slice(0, 16).replace("T", " ") || ""}</div>
            </div>
          `;
        }).join("")}
      </div>
    `);
  },
});

// ── Widgets: HF / IR map ───────────────────────────────────────────────────────
const MAP_TYPE_COLOR = {
  ADDED:    "var(--color-green)",
  MODIFIED: "var(--color-yellow)",
  REMOVED:  "var(--color-red)",
  RESTORED: "var(--text-accent)",
};

function mapChangeEntry(entry, prev) {
  const dateStr = (entry.synced_at || "").slice(0, 16).replace("T", " ") || "—";
  const color   = MAP_TYPE_COLOR[entry.change_type] || "var(--text-faint)";

  let diffs = "";
  if (entry.change_type === "MODIFIED" && Array.isArray(entry.changed_fields) && prev) {
    diffs = entry.changed_fields.map(field => {
      const oldVal = prev[field]  != null ? String(prev[field])  : "—";
      const newVal = entry[field] != null ? String(entry[field]) : "—";
      return `
        <div style="font-size:10px;padding:2px 0;border-left:2px solid var(--divider-subtle);padding-left:6px;margin-top:3px;">
          <span style="color:var(--text-faint);font-family:var(--font-data);">${escapeHtml(field)}</span><br>
          <span style="color:var(--text-muted);text-decoration:line-through;">${escapeHtml(oldVal)}</span>
          <span style="color:var(--text-faint);margin:0 3px;">→</span>
          <span style="color:var(--text-normal);">${escapeHtml(newVal)}</span>
        </div>
      `;
    }).join("");
  }

  return `
    <div class="feed-item">
      <div class="feed-item-title">
        <span style="color:${color};font-size:10px;font-weight:700;font-family:var(--font-data);">${entry.change_type}</span>
        <span style="color:var(--text-faint);font-size:10px;font-family:var(--font-data);margin-left:6px;">${dateStr}</span>
      </div>
      ${diffs}
    </div>
  `;
}

registerRightRailWidget({
  id: "map-record-history",
  order: 10,
  when: (ctx) => ctx.type === "hf.table" || ctx.type === "ir.table",
  render: (ctx) => {
    const selected = ctx.tab?.state?.selectedRecord;

    // ── No row selected: show all chronological changes ──────────────────────
    if (!selected) {
      const allChanges = ctx.tab?.state?.allChanges;
      if (!allChanges) return renderContextCard("Recent Changes", `
        <p style="font-size:11px;color:var(--text-faint);margin:0;">Loading…</p>
      `);
      if (!allChanges.length) return renderContextCard("Recent Changes", `
        <p style="font-size:11px;color:var(--text-faint);margin:0;">No changes recorded yet.</p>
      `);
      const rows = allChanges.map(entry => {
        const dateStr = (entry.synced_at || "").slice(0, 16).replace("T", " ") || "—";
        const color   = MAP_TYPE_COLOR[entry.change_type] || "var(--text-faint)";
        const fields  = Array.isArray(entry.changed_fields) && entry.changed_fields.length
          ? `<div style="font-size:10px;color:var(--text-faint);margin-top:2px;">${entry.changed_fields.map(f => escapeHtml(f)).join(", ")}</div>`
          : "";
        return `
          <div class="feed-item">
            <div class="feed-item-title" style="font-weight:500;">${escapeHtml(entry.name || entry.record_id || "—")}</div>
            <div class="feed-item-meta">
              <span style="color:${color};font-weight:700;font-family:var(--font-data);font-size:10px;">${entry.change_type}</span>
              <span style="font-family:var(--font-data);margin-left:6px;">${dateStr}</span>
            </div>
            ${fields}
          </div>
        `;
      }).join("");
      return renderContextCard("Recent Changes", `<div class="feed-list">${rows}</div>`);
    }

    // ── Row selected: show record-specific history with diffs ─────────────────
    const name    = escapeHtml(ctx.tab.state.recordName || selected.id);
    const history = ctx.tab?.state?.recordHistory;

    if (history === undefined) return renderContextCard(name, `
      <p style="font-size:11px;color:var(--text-faint);margin:0;">Loading…</p>
    `);
    if (history === null) return renderContextCard(name, `
      <p style="font-size:11px;color:var(--color-red);margin:0;">Failed to load history.</p>
    `);
    if (!history.length) return renderContextCard(name, `
      <p style="font-size:11px;color:var(--text-faint);margin:0;">No history recorded.</p>
    `);

    const entries = history.map((entry, i) => mapChangeEntry(entry, history[i + 1])).join("");
    return renderContextCard(name, `<div class="feed-list">${entries}</div>`);
  },
});

registerRightRailWidget({
  id: "map-daily-activity",
  order: 40,
  when: (ctx) => ctx.type === "hf.table" || ctx.type === "ir.table",
  render: (ctx) => {
    const data = ctx.tab?.state?.dailyChanges;
    if (!data?.length) return "";

    const max   = Math.max(1, ...data.map(d => d.count));
    const total = data.reduce((s, d) => s + d.count, 0);
    const BAR_H = 36; // px — max bar height

    const bars = data.map(d => {
      const h       = d.count === 0 ? 2 : Math.max(3, Math.round((d.count / max) * BAR_H));
      const color   = d.count === 0 ? "var(--divider-subtle)" : "var(--border-accent)";
      const label   = d.day.slice(5); // MM-DD
      return `<div title="${label}: ${d.count} change${d.count !== 1 ? "s" : ""}"
                   style="flex:1;height:${h}px;background:${color};border-radius:1px;min-width:0;"></div>`;
    }).join("");

    // Month boundary labels — show month name at first day of each month
    const months = [];
    data.forEach((d, i) => {
      if (d.day.slice(8) === "01" || i === 0) {
        const pct = Math.round((i / data.length) * 100);
        const mon = new Date(d.day + "T00:00:00").toLocaleString("en", { month: "short" });
        months.push(`<span style="position:absolute;left:${pct}%;font-size:9px;color:var(--text-faint);font-family:var(--font-data);white-space:nowrap;">${mon}</span>`);
      }
    });

    return renderContextCard("Daily Changes", `
      <div style="font-size:10px;color:var(--text-faint);margin-bottom:6px;font-family:var(--font-data);">
        ${total} change${total !== 1 ? "s" : ""} over 60 days
        &nbsp;·&nbsp; peak ${max}/day
      </div>
      <div style="display:flex;align-items:flex-end;gap:1px;height:${BAR_H}px;">
        ${bars}
      </div>
      <div style="position:relative;height:14px;margin-top:2px;">
        ${months.join("")}
      </div>
    `);
  },
});

registerRightRailWidget({
  id: "map-table-stats",
  order: 50,
  when: (ctx) => ctx.type === "hf.table" || ctx.type === "ir.table",
  render: (ctx) => {
    const records = ctx.tab?.state?.records;
    if (!records) return "";

    const label     = ctx.type === "hf.table" ? "HF Map" : "IR Map";
    const firmField = ctx.type === "hf.table" ? "firm" : "current_firm";
    const filters   = ctx.tab?.state?.filters || {};
    const query     = ctx.tab?.state?.query   || "";
    const hasFilters = Object.values(filters).some(Boolean) || !!query;

    // Compute filtered set using same logic as views.js
    let filtered = records;
    const q = query.toLowerCase();
    if (q) {
      if (ctx.type === "hf.table") {
        filtered = filtered.filter(r =>
          [r.name, r.firm, r.title, r.function, r.strategy, r.location, r.products, r.reports_to]
            .some(v => (v || "").toLowerCase().includes(q)));
      } else {
        filtered = filtered.filter(r =>
          [r.name, r.current_firm, r.current_title, r.function, r.group, r.current_location]
            .some(v => (v || "").toLowerCase().includes(q)));
      }
    }
    if (filters.firm)     filtered = filtered.filter(r => (r[firmField]  || "") === filters.firm);
    if (filters.function) filtered = filtered.filter(r => (r.function    || "") === filters.function);
    if (filters.strategy) filtered = filtered.filter(r => (r.strategy    || "") === filters.strategy);
    if (filters.group)    filtered = filtered.filter(r => (r.group       || "") === filters.group);
    if (filters.location) {
      const locField = ctx.type === "hf.table" ? "location" : "current_location";
      filtered = filtered.filter(r => (r[locField] || "") === filters.location);
    }

    const activeFilters = [
      filters.firm, filters.function, filters.strategy, filters.group, filters.location,
    ].filter(Boolean);

    // Filter tag pills
    const filterPills = activeFilters.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
          ${activeFilters.map(v => `
            <span style="font-size:10px;font-family:var(--font-data);padding:2px 6px;border-radius:3px;background:var(--background-accent-faint);color:var(--text-accent);border:1px solid var(--border-accent);">${escapeHtml(v)}</span>
          `).join("")}
         </div>`
      : "";

    // Firm breakdown of filtered set (only when something is filtered)
    let firmBreakdown = "";
    if (hasFilters && filtered.length > 0 && !filters.firm) {
      const counts = {};
      filtered.forEach(r => {
        const f = r[firmField] || "—";
        counts[f] = (counts[f] || 0) + 1;
      });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const max = top[0]?.[1] || 1;
      firmBreakdown = `
        <div style="margin-top:10px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px;">By Firm</div>
          ${top.map(([firm, count]) => `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <div class="truncate" style="flex:1;font-size:11px;color:var(--text-normal);">${escapeHtml(firm)}</div>
              <div style="width:${Math.round((count / max) * 52)}px;height:3px;background:var(--border-accent);border-radius:2px;flex-shrink:0;"></div>
              <div style="font-size:10px;font-family:var(--font-data);color:var(--text-faint);min-width:18px;text-align:right;">${count}</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    const showingText = hasFilters
      ? `${filtered.length.toLocaleString()} of ${records.length.toLocaleString()}`
      : records.length.toLocaleString();
    const totalFirms = new Set(filtered.map(r => r[firmField]).filter(Boolean)).size;

    return renderContextCard(label, `
      <div class="meta-grid">
        <div class="meta-block">
          <div class="meta-label">${hasFilters ? "Showing" : "Records"}</div>
          <div class="meta-value">${showingText}</div>
        </div>
        <div class="meta-block">
          <div class="meta-label">Firms</div>
          <div class="meta-value">${totalFirms}</div>
        </div>
      </div>
      ${filterPills}
      ${firmBreakdown}
    `);
  },
});

// ── Widgets: ir.firm ───────────────────────────────────────────────────────────

registerRightRailWidget({
  id: "ir-firm-rail",
  order: 10,
  when: (ctx) => ctx.type === "ir.firm",
  render: (ctx) => {
    const firmName = ctx.tab?.state?.firmName;
    if (!firmName) return "";

    // Pull records from loaded ir.table tab
    const irTab = workspaceState.tabs.find(t => t.type === "ir.table" && t.state?.records);
    const allRecords = irTab?.state?.records || [];
    const firm = allRecords.filter(r => r.current_firm === firmName);
    if (!firm.length) return renderContextCard(firmName, `
      <p style="font-size:11px;color:var(--text-faint);margin:0;">No records loaded. Open IR Map first.</p>
    `);

    // Function distribution mini bars
    const fnCounts = {};
    firm.forEach(r => { const f = r.function || "Unknown"; fnCounts[f] = (fnCounts[f] || 0) + 1; });
    const fnEntries = Object.entries(fnCounts).sort((a, b) => b[1] - a[1]);
    const fnMax = fnEntries[0]?.[1] || 1;
    const fnBars = fnEntries.slice(0, 6).map(([label, count]) => `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <div class="truncate" style="flex:1;font-size:11px;color:var(--text-normal);">${escapeHtml(label)}</div>
        <div style="width:${Math.round(count / fnMax * 48)}px;height:3px;background:var(--border-accent);border-radius:2px;flex-shrink:0;"></div>
        <div style="font-size:10px;font-family:var(--font-data);color:var(--text-faint);min-width:16px;text-align:right;">${count}</div>
      </div>`).join("");

    // Top groups
    const grpCounts = {};
    firm.forEach(r => { const g = r.group; if (g && g !== "--") grpCounts[g] = (grpCounts[g] || 0) + 1; });
    const grpEntries = Object.entries(grpCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const grpRows = grpEntries.map(([label, count]) => `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <div class="truncate" style="flex:1;font-size:11px;color:var(--text-muted);">${escapeHtml(label)}</div>
        <div style="font-size:10px;font-family:var(--font-data);color:var(--text-faint);">${count}</div>
      </div>`).join("");

    return renderContextCard(firmName, `
      <div class="meta-grid" style="margin-bottom:8px;">
        <div class="meta-block"><div class="meta-label">People</div><div class="meta-value">${firm.length}</div></div>
        <div class="meta-block"><div class="meta-label">Groups</div><div class="meta-value">${grpEntries.length}</div></div>
      </div>
      ${fnBars ? `
        <div style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-faint);margin:8px 0 6px;">By Function</div>
        ${fnBars}` : ""}
      ${grpRows ? `
        <div style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-faint);margin:10px 0 6px;">Top Groups</div>
        ${grpRows}` : ""}
    `);
  },
});

// ── Widget: shared quick actions ───────────────────────────────────────────────
registerRightRailWidget({
  id: "quick-actions",
  order: 100,
  when: (ctx) => ctx.entityId !== undefined,
  render: (ctx) => renderContextCard("Quick Actions", `
    <div class="action-grid">
      <button class="action-btn" data-action="interaction" data-entity-id="${ctx.entityId}" data-entity-type="${ctx.type}" title="Log Interaction"><span>Log</span></button>
      <button class="action-btn" data-action="note"        data-entity-id="${ctx.entityId}" data-entity-type="${ctx.type}" title="Add Note"><span>Note</span></button>
      <button class="action-btn" data-action="reminder"    data-entity-id="${ctx.entityId}" data-entity-type="${ctx.type}" title="Set Reminder"><span>Remind</span></button>
      <button class="action-btn" data-action="pipeline"    data-entity-id="${ctx.entityId}" data-entity-type="${ctx.type}" title="Move Stage"><span>Stage</span></button>
    </div>
  `),
});

// ── Render right rail ──────────────────────────────────────────────────────────
const rightRailTitle   = document.getElementById("rightRailTitle");
const rightRailContent = document.getElementById("rightRailContent");

export function renderRightRail() {
  if (!rightRailTitle || !rightRailContent) return;

  const context = getActiveContext();

  if (!context || context.type === "empty") {
    rightRailTitle.textContent = "";
    rightRailContent.innerHTML = "";
    return;
  }

  if      (context.type === "person")       rightRailTitle.textContent = context.entity?.title || "Person";
  else if (context.type === "firm")         rightRailTitle.textContent = context.entity?.title || "Firm";
  else if (context.type === "people.table") rightRailTitle.textContent = "People Table";
  else if (context.type === "firms.table")  rightRailTitle.textContent = "Firms Table";
  else if (context.type === "master.search") rightRailTitle.textContent = "Reference";
  else if (context.type === "hf.table")     rightRailTitle.textContent = "HF Map";
  else if (context.type === "ir.table")     rightRailTitle.textContent = "IR Map";
  else if (context.type === "ir.firm")      rightRailTitle.textContent = context.firmName || "IR Firm";
  else if (context.type === "finra")        rightRailTitle.textContent = "FINRA Monitor";
  else if (context.type === "bbg.firms")    rightRailTitle.textContent = "BBG Extraction";
  else if (context.type === "bbg.firm")     rightRailTitle.textContent = context.firmName || "BBG Firm";
  else rightRailTitle.textContent = "Context";

  const widgets = rightRailWidgets
    .filter((w) => w.when(context))
    .sort((a, b) => a.order - b.order);

  rightRailContent.innerHTML = widgets.length
    ? widgets.map((w) => w.render(context)).join("")
    : `<div class="context-card" style="border:none;">
        <div class="context-card-title" style="opacity:0.3;">Signals</div>
        <p style="font-size:11px;color:var(--text-faint);font-style:italic;margin:0;">No active signals for this context.</p>
      </div>`;
}

// ── Widget: BBG firm run history ───────────────────────────────────────────────

registerRightRailWidget({
  id: "bbg-firm-run-history",
  order: 10,
  when: (context) => context.type === "bbg.firm",
  render: (context) => {
    const tab      = context.tab;
    const runs     = tab.state?.runs;
    const selRunId = tab.state?.selectedRunId;

    if (!runs) {
      return `<div class="context-card">
        <div class="context-card-title">Run History</div>
        <p style="font-size:11px;color:var(--text-faint);margin:0;">Loading…</p>
      </div>`;
    }
    if (!runs.length) {
      return `<div class="context-card">
        <div class="context-card-title">Run History</div>
        <p style="font-size:11px;color:var(--text-faint);margin:0;">No runs recorded yet.</p>
      </div>`;
    }

    const items = runs.map(r => {
      const dt       = new Date(r.run_at);
      const isActive = r.run_id === selRunId;
      const tracking = r.rows_processed > 0
        ? Math.round((r.confirmed_count / r.rows_processed) * 100) : 0;
      const dateStr = dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
      const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `
        <button class="bbg-run-history-item${isActive ? " is-active" : ""}"
          data-select-bbg-run="${r.run_id}" data-tab-id="${escapeHtml(tab.id)}">
          <div class="rh-header">
            <span class="rh-date">${escapeHtml(dateStr)}</span>
            <span class="rh-time">${escapeHtml(timeStr)}</span>
            <span class="rh-tracking">${tracking}%</span>
          </div>
          <div class="rh-filename">${escapeHtml(r.csv_filename)}</div>
          <div class="rh-stats">
            <span class="rh-conf">${r.confirmed_count} conf</span>
            <span class="rh-disc">${r.discrepancy_count} disc</span>
            <span class="rh-add">${r.addition_count} add</span>
            <span class="rh-rows">${r.rows_processed} rows</span>
          </div>
        </button>
      `;
    }).join("");

    return `
      <div class="context-card" style="padding-bottom:4px;">
        <div class="context-card-title">Run History (${runs.length})</div>
        <div class="bbg-run-history-list">${items}</div>
      </div>
    `;
  },
});
