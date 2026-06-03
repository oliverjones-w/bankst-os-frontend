/**
 * ui.js — shared HTML helper functions for modular views.
 *
 * All functions return HTML strings, consistent with the view render pattern.
 * Import escapeHtml from utils.js whenever rendering user/DB-sourced content.
 *
 * Usage in a view module:
 *   import { badge, emptyState, loadingView, tabBar } from "../ui.js";
 */

import { escapeHtml } from "./utils.js";

// ── Badge ─────────────────────────────────────────────────────────────────────

/**
 * Returns a `.badge` span.
 * variant maps to `.badge--{variant}` in css/components.css.
 *
 * Semantic variants: neutral, success, error, warning, info
 * Domain variants:   mandate, pool, pipeline, activity
 * Confidence:        high, medium, low
 */
export function badge(text, variant = "neutral") {
  return `<span class="badge badge--${escapeHtml(variant)}">${escapeHtml(text)}</span>`;
}

// ── Empty / loading states ────────────────────────────────────────────────────

/** Standard empty-state message. Wraps in .view-empty styled by tables.css. */
export function emptyState(message = "No items found.") {
  return `<div class="view-empty">${escapeHtml(message)}</div>`;
}

/** Full-view loading wrapper. Matches the pattern used by all existing views. */
export function loadingView() {
  return `<div class="view-wrapper"><div class="view-empty">Loading…</div></div>`;
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

/**
 * Renders a row of tab buttons styled with .tab-bar / .tab-bar-btn classes
 * defined in css/components.css.
 *
 * @param {Array<{id: string, label: string, count?: number}>} tabs
 * @param {string} activeId  — id of the currently active tab
 * @param {string} dataAttr  — data-* attribute name, e.g. "data-mf-tab"
 *
 * Example:
 *   tabBar([{id:"all",label:"All",count:12},{id:"pending",label:"Pending",count:3}],
 *          "pending", "data-mf-tab")
 */
export function tabBar(tabs, activeId, dataAttr) {
  const buttons = tabs.map(({ id, label, count }) => {
    const isActive = id === activeId;
    const countHtml = count != null
      ? `<span class="tab-bar-count">${count}</span>`
      : "";
    return `<button class="tab-bar-btn${isActive ? " is-active" : ""}"
                    ${escapeHtml(dataAttr)}="${escapeHtml(id)}">
              ${escapeHtml(label)}${countHtml}
            </button>`;
  });
  return `<div class="tab-bar">${buttons.join("")}</div>`;
}

// ── Detail row ────────────────────────────────────────────────────────────────

/**
 * A label + value pair for detail / metadata panels.
 * value is rendered as-is — escape it before passing if it comes from the DB.
 */
export function detailRow(label, value) {
  const safeLabel = escapeHtml(label);
  const displayValue = value != null && value !== "" ? value : `<span style="color:var(--text-faint)">—</span>`;
  return `<div class="detail-row">
            <span class="detail-row-label">${safeLabel}</span>
            <span class="detail-row-value">${displayValue}</span>
          </div>`;
}
