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
