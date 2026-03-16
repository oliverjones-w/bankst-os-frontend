import { getActiveContext } from "./workspace.js";
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

export function registerRightRailWidget(widget) {
  rightRailWidgets.push(widget);
}

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
    const label = ctx.type === "hf.table" ? "HF Map" : "IR Map";
    const firms  = new Set(records.map(r => r.firm || r.current_firm).filter(Boolean)).size;
    return renderContextCard(label, `
      <div class="meta-grid">
        <div class="meta-block"><div class="meta-label">Records</div><div class="meta-value">${records.length.toLocaleString()}</div></div>
        <div class="meta-block"><div class="meta-label">Firms</div><div class="meta-value">${firms}</div></div>
      </div>
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
  else if (context.type === "finra")        rightRailTitle.textContent = "FINRA Monitor";
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
