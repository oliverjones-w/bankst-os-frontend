// ── Imports ────────────────────────────────────────────────────────────────────
import { toggleTheme } from "./theme.js";
import { initShell, toggleLeftRail, toggleRightRail, toggleZenMode, zoomIn, zoomOut, resetZoom } from "./shell.js";
import {
  workspaceState, openTab, closeTab, focusTab, renderWorkspace,
  restoreWorkspaceState, loadWorkspaceState,
  renderWorkspaceSnapshots, loadWorkspaceSnapshotById,
  applyWorkspaceSnapshot, deleteWorkspaceSnapshot,
  createWorkspaceSnapshot, handleToolbarAction, setRailRenderer,
  getActivePane, splitPane,
} from "./workspace.js";
import { renderRightRail } from "./widgets.js";
import { setNavHandlers, closeTopCard, openCard } from "./cards.js";
import { openPersonTab, openFirmTab, openFirmCard, openFinraTab } from "./nav.js";
import { loadFirmsIndex, loadRecentlyViewed, loadTrending, setApiRailRenderer } from "./api.js";
import { togglePalette, closePalette, paletteIsOpen, handlePaletteKeydown } from "./palette.js";
import { actions } from "./actions.js";
import { initTabDragHandlers } from "./drag.js";
import { initRailGroups, setGroupState } from "./ui-prefs.js";

// Side-effect imports: registers all views and widgets at module init
import "./views.js";
// widgets.js already imported above; re-importing is a no-op (same module instance)

// ── Wire injections ────────────────────────────────────────────────────────────
setRailRenderer(renderRightRail);
setApiRailRenderer(renderRightRail);
setNavHandlers({ openPersonTab, openFirmTab });

// ── Shell: rail toggles ────────────────────────────────────────────────────────
document.getElementById("leftRailToggle")?.addEventListener("click", toggleLeftRail);
document.getElementById("rightRailToggle")?.addEventListener("click", toggleRightRail);
document.getElementById("rightRailClose")?.addEventListener("click", toggleRightRail);
document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);

// Allow nav.js runCommand to trigger rail toggle via CustomEvent
document.addEventListener("bankst:toggleRightRail", toggleRightRail);

// Workspace snapshot save button
document.getElementById("saveWorkspaceSnapshotBtn")?.addEventListener("click", () => {
  const name = window.prompt("Name this workspace:");
  if (!name || !name.trim()) return;
  createWorkspaceSnapshot(name);
  renderWorkspaceSnapshots();
});

// ── Global delegated click handler ────────────────────────────────────────────
document.addEventListener("click", (e) => {
  const railGroupHeader     = e.target.closest(".rail-group-header");
  const closeTabTrigger     = e.target.closest("[data-close-tab]");
  const tabTrigger          = e.target.closest("[data-tab-id]");
  const personTrigger       = e.target.closest("[data-open-person]");
  const firmTrigger         = e.target.closest("[data-open-firm]");
  const firmIdTrigger       = e.target.closest("[data-open-firm-id]");
  const navTabTrigger       = e.target.closest("[data-open-nav-tab]");
  const finraTabTrigger     = e.target.closest("[data-open-finra-tab]");
  const toolbarTrigger      = e.target.closest("[data-toolbar-action]");
  const recentTrigger       = e.target.closest("[data-open-recent]");
  const loadSnapshotTrigger = e.target.closest("[data-load-workspace-snapshot]");
  const delSnapshotTrigger  = e.target.closest("[data-delete-workspace-snapshot]");
  const actionTrigger       = e.target.closest(".action-btn");

  if (railGroupHeader) {
    const group = railGroupHeader.closest(".rail-group[data-group-id]");
    if (group) {
      const next = group.dataset.state === "open" ? "closed" : "open";
      group.dataset.state = next;
      setGroupState(group.dataset.groupId, next);
    }
    return;
  }

  if (closeTabTrigger) { e.stopPropagation(); closeTab(closeTabTrigger.dataset.closeTab); return; }
  if (tabTrigger) {
    const paneEl = tabTrigger.closest("[data-pane-id]");
    focusTab(tabTrigger.dataset.tabId, paneEl?.dataset.paneId);
    return;
  }
  if (personTrigger)   { openCard(personTrigger.dataset.openPerson); return; }
  if (firmTrigger)     { openCard(firmTrigger.dataset.openFirm);     return; }

  if (firmIdTrigger) {
    openFirmCard(firmIdTrigger.dataset.openFirmId, firmIdTrigger.dataset.firmName);
    return;
  }

  if (navTabTrigger) {
    const t = navTabTrigger.dataset.openNavTab;
    if (t === "firms.table")   openTab({ id: "tab-firms-table",   type: "firms.table",   title: "Firms Table",   state: {} });
    if (t === "people.table")  openTab({ id: "tab-people-table",  type: "people.table",  title: "People Table",  state: { mode: "table" } });
    if (t === "master.search") openTab({ id: "tab-master-search", type: "master.search", title: "Reference",     state: {} });
    return;
  }

  if (finraTabTrigger) { openFinraTab(finraTabTrigger.dataset.openFinraTab); return; }
  if (toolbarTrigger)  { handleToolbarAction(toolbarTrigger.dataset.toolbarAction); return; }

  if (recentTrigger) {
    const { openRecent, recentType, recentLabel } = recentTrigger.dataset;
    if (recentType === "person") openPersonTab(openRecent);
    else openFirmTab(openRecent, recentLabel);
    return;
  }

  if (loadSnapshotTrigger) {
    const item = loadWorkspaceSnapshotById(loadSnapshotTrigger.dataset.loadWorkspaceSnapshot);
    if (item) applyWorkspaceSnapshot(item);
    return;
  }

  if (delSnapshotTrigger) {
    deleteWorkspaceSnapshot(delSnapshotTrigger.dataset.deleteWorkspaceSnapshot);
    renderWorkspaceSnapshots();
    return;
  }

  if (actionTrigger) {
    const { action, entityId, entityType } = actionTrigger.dataset;
    const entityLabel = actionTrigger.closest('.detail-view-shell')?.querySelector('.detail-title')?.textContent;
    actions.execute(action, { entityId, entityType, entityLabel });
  }
});


// ── Close palette on outside click ────────────────────────────────────────────
document.addEventListener("pointerdown", (e) => {
  if (!paletteIsOpen()) return;
  if (!e.target.closest("#commandPalette") && !e.target.closest("#commandTrigger")) {
    closePalette();
  }
});

document.getElementById("commandTrigger")?.addEventListener("click", togglePalette);

// ── Ctrl+scroll zoom interception ─────────────────────────────────────────────
// Must be { passive: false } to call preventDefault on a wheel event.
// Without this, Ctrl+scroll bypasses keydown entirely and zooms the whole page.
document.addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  if (e.deltaY < 0) zoomIn();
  else              zoomOut();
}, { passive: false });

// ── Global keyboard ────────────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); togglePalette(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); toggleLeftRail(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "\\")              { e.preventDefault(); toggleRightRail(); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); toggleZenMode(); return; }

  // Workspace zoom — intercepts browser zoom shortcuts
  if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomIn();    return; }
  if ((e.ctrlKey || e.metaKey) &&  e.key === "-")                   { e.preventDefault(); zoomOut();   return; }
  if ((e.ctrlKey || e.metaKey) &&  e.key === "0")                   { e.preventDefault(); resetZoom(); return; }

  if (e.altKey && e.key.toLowerCase() === "w") {
    e.preventDefault();
    const ap = getActivePane();
    if (ap?.activeTabId) closeTab(ap.activeTabId);
    return;
  }
  if (e.altKey && e.key === "]") {
    e.preventDefault();
    const ap = getActivePane();
    if (ap) {
      const idx = ap.tabs.indexOf(ap.activeTabId);
      if (idx !== -1 && idx < ap.tabs.length - 1) focusTab(ap.tabs[idx + 1], ap.id);
    }
    return;
  }
  if (e.altKey && e.key === "[") {
    e.preventDefault();
    const ap = getActivePane();
    if (ap) {
      const idx = ap.tabs.indexOf(ap.activeTabId);
      if (idx > 0) focusTab(ap.tabs[idx - 1], ap.id);
    }
    return;
  }

  if (e.key === "Escape") {
    if (paletteIsOpen()) { closePalette(); return; }
    closeTopCard();
    return;
  }

  handlePaletteKeydown(e);
});

// ── Electron IPC ───────────────────────────────────────────────────────────────
if (window.electron) {
  window.electron.onTabCloseActive(() => {
    const ap = getActivePane();
    if (ap?.activeTabId) closeTab(ap.activeTabId);
  });
  window.electron.onTabNext(() => {
    const ap = getActivePane();
    if (ap) {
      const idx = ap.tabs.indexOf(ap.activeTabId);
      if (idx !== -1 && idx < ap.tabs.length - 1) focusTab(ap.tabs[idx + 1], ap.id);
    }
  });
  window.electron.onTabPrev(() => {
    const ap = getActivePane();
    if (ap) {
      const idx = ap.tabs.indexOf(ap.activeTabId);
      if (idx > 0) focusTab(ap.tabs[idx - 1], ap.id);
    }
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────────
initShell();
const restored = restoreWorkspaceState(loadWorkspaceState());

if (restored && workspaceState.panes.length) {
  renderWorkspace();
} else {
  openTab({
    id:    "tab-people-table",
    type:  "people.table",
    title: "People Table",
    state: { mode: "table", sort: null, filters: {}, columns: ["name", "firm", "title", "strategy", "location", "updated"] },
  });
}

initRailGroups();
initTabDragHandlers();
renderWorkspaceSnapshots();
loadFirmsIndex();
loadRecentlyViewed();
loadTrending();
