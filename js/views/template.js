/**
 * template.js — scaffold for new modular views.
 *
 * HOW TO USE THIS FILE
 * --------------------
 * 1. Copy it to js/views/my-feature.js
 * 2. Replace MY_FEATURE → MY_FEATURE (rename the constant)
 *    Replace "my-feature" → "your-view-id"
 *    Replace "mf" → your 2-4 char CSS/data-* prefix
 *    Replace createMyFeatureView → createYourFeatureView
 * 3. Create css/views/my-feature.css with your view-specific styles
 * 4. In app-os.js add:
 *      a. import { createMyFeatureView, MY_FEATURE_VIEW_ID } from "./views/my-feature.js";
 *      b. createMyFeatureView(opsGet, opsPost) in the VIEWS array
 *      c. A handleClick block in wireMainActions — OR rely on the generic
 *         dispatch at the bottom of wireMainActions if you define handleClick on the view.
 * 5. Add <link rel="stylesheet" href="./css/views/my-feature.css?v=1" /> to index.html
 *
 * DO NOT import this file or register it in VIEWS.
 * DO NOT add it to index.html.
 * This file is documentation that runs.
 */

import { escapeHtml } from "../utils.js";
import { badge, emptyState, loadingView, tabBar } from "../ui.js";

// ── View ID ───────────────────────────────────────────────────────────────────
// Convention: "{slug}.view" — must be unique across VIEWS array.
// Export so app-os.js can reference it without a magic string.

export const MY_FEATURE_VIEW_ID = "my-feature.view";

// ── Constants ─────────────────────────────────────────────────────────────────
// Define enums and label maps here, not inline in render functions.

const TABS = [
  { id: "all",    label: "All"    },
  { id: "active", label: "Active" },
  { id: "closed", label: "Closed" },
];

// ── Factory ───────────────────────────────────────────────────────────────────
// The factory receives API functions injected from app-os.js.
// This keeps the module testable and the API surface explicit.

export function createMyFeatureView(opsGet, opsPost) {
  return {
    id:       MY_FEATURE_VIEW_ID,
    label:    "My Feature",       // shown in command palette
    section:  "Views",            // palette group: "Views" | "Monitors" | "Intake" | "Intelligence"
    endpoint: "/api/ops/my-endpoint", // shown in view meta bar

    // ── load ──────────────────────────────────────────────────────────────
    // Called once when the view opens (and again on Refresh).
    // Return a plain object. ALL view state lives here — never on global state.
    // The same object is mutated by handlers and passed back into render().

    load: async () => {
      const items = await opsGet("/my-endpoint");
      return {
        // fetched data
        items,

        // interaction state — initialise everything the view needs here
        activeTab: "all",
        expandedId: null,
        busy: new Set(),   // ids of items currently being actioned
        error: null,
      };
    },

    // ── render ────────────────────────────────────────────────────────────
    // Called synchronously on every state change. Must be a pure function of data.
    // data is null while the initial load is in flight — handle it.

    render: (data) => data ? renderRoot(data) : loadingView(),

    // ── handleClick ───────────────────────────────────────────────────────
    // Called by the generic dispatch at the bottom of wireMainActions().
    // The active view guard is already applied before this is called.
    // event.target is the raw DOM element — use .closest() to walk up.
    // Always return after handling so lower handlers don't fire.

    handleClick(event, data, rerender) {
      // Tab switching
      const tabBtn = event.target.closest("[data-mf-tab]");
      if (tabBtn) {
        data.activeTab = tabBtn.dataset.mfTab;
        rerender();
        return;
      }

      // Row expand/collapse
      const expandBtn = event.target.closest("[data-mf-expand]");
      if (expandBtn) {
        const id = Number(expandBtn.dataset.mfExpand);
        data.expandedId = data.expandedId === id ? null : id;
        rerender();
        return;
      }

      // Async action (e.g. approve/reject)
      const actionBtn = event.target.closest("[data-mf-action]");
      if (actionBtn) {
        const id     = Number(actionBtn.dataset.mfAction);
        const action = actionBtn.dataset.mfDecision;
        _handleAction(id, action, data, rerender, opsPost);
        return;
      }
    },
  };
}

// ── Async action helper ───────────────────────────────────────────────────────
// Extracted so it is not recreated on every handleClick call.

async function _handleAction(id, action, data, rerender, opsPost) {
  if (data.busy.has(id)) return;
  data.busy.add(id);
  rerender();
  try {
    await opsPost(`/my-endpoint/${id}/action`, { action });
    const item = data.items.find(i => i.id === id);
    if (item) item.status = action;
    data.error = null;
  } catch (err) {
    data.error = err.message;
  } finally {
    data.busy.delete(id);
    rerender();
  }
}

// ── Render functions ──────────────────────────────────────────────────────────
// Keep render functions pure — no side effects, no async, no DOM reads.
// Use template literals. Use escapeHtml() on every DB/user-sourced string.
// Use helpers from ui.js (badge, emptyState, tabBar, detailRow) where possible.

function renderRoot(data) {
  const { items, activeTab, expandedId, busy, error } = data;

  const tabsWithCounts = TABS.map(t => ({
    ...t,
    count: t.id === "all" ? items.length : items.filter(i => i.status === t.id).length,
  }));

  const filtered = activeTab === "all"
    ? items
    : items.filter(i => i.status === activeTab);

  return `
    <div class="view-wrapper mf-view">

      ${error ? `<div class="view-error">${escapeHtml(error)}</div>` : ""}

      ${tabBar(tabsWithCounts, activeTab, "data-mf-tab")}

      ${filtered.length === 0
        ? emptyState("No items found.")
        : `<table class="data-table">
             <thead>
               <tr>
                 <th>Name</th>
                 <th>Status</th>
                 <th>Type</th>
                 <th></th>
               </tr>
             </thead>
             <tbody>
               ${filtered.map(item => renderRow(item, expandedId, busy)).join("")}
             </tbody>
           </table>`}
    </div>`;
}

function renderRow(item, expandedId, busy) {
  const isExpanded = expandedId === item.id;
  const isbusy     = busy.has(item.id);

  return `
    <tr>
      <td>
        <button class="row-toggle" data-mf-expand="${item.id}">
          ${escapeHtml(item.name)}
        </button>
      </td>
      <td>${badge(item.status, item.status)}</td>
      <td>${badge(item.type, "neutral")}</td>
      <td>
        <button class="mf-action-btn"
                data-mf-action="${item.id}"
                data-mf-decision="approve"
                ${isbusy ? "disabled" : ""}>
          ${isbusy ? "…" : "Approve"}
        </button>
      </td>
    </tr>
    ${isExpanded ? renderDetail(item) : ""}`;
}

function renderDetail(item) {
  return `
    <tr class="mf-detail-row">
      <td colspan="4">
        <div class="mf-detail">
          <p>${escapeHtml(item.notes || "No notes.")}</p>
        </div>
      </td>
    </tr>`;
}
