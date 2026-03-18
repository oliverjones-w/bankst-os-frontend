// ── Imports ────────────────────────────────────────────────────────────────────
import { startFrameMonitor } from "./utils.js";
import { toggleTheme } from "./theme.js";
import { initShellState, toggleLeftRail, toggleRightRail, toggleZenMode } from "./shell.js";
import {
  workspaceState, openTab, closeTab, focusTab, renderWorkspace,
  restoreWorkspaceState, loadWorkspaceState,
  renderWorkspaceSnapshots, loadWorkspaceSnapshotById,
  applyWorkspaceSnapshot, deleteWorkspaceSnapshot,
  createWorkspaceSnapshot, handleToolbarAction, setRailRenderer,
  getActivePane, splitPane, getActiveTab, updateActiveTabState,
} from "./workspace.js";
import { renderRightRail } from "./widgets.js";
import { setNavHandlers, closeTopCard, openCard } from "./cards.js";
import { openPersonTab, openFirmTab, openFirmCard, openFinraTab, openBbgFirmsTab, openBbgFirmTab } from "./nav.js";
import { loadFirmsIndex, loadRecentlyViewed, loadTrending, setApiRailRenderer, mappingGet, mappingUpload } from "./api.js";
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
document.getElementById("railCollapseBtn")?.addEventListener("click", toggleLeftRail);
document.getElementById("rightRailToggle")?.addEventListener("click", toggleRightRail);
document.getElementById("rightRailClose")?.addEventListener("click", toggleRightRail);
document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);

// Allow nav.js runCommand to trigger rail toggle via CustomEvent
document.addEventListener("bankst:toggleRightRail", toggleRightRail);

// ── BBG run selector ───────────────────────────────────────────────────────────
document.addEventListener("change", (e) => {
  const sel = e.target.closest(".bbg-run-selector");
  if (!sel) return;
  const tabId = sel.dataset.tabId;
  const runId = parseInt(sel.value, 10);
  document.dispatchEvent(new CustomEvent("bankst:bbgRunChange", { detail: { tabId, runId } }));
});

// ── BBG search input ───────────────────────────────────────────────────────────
document.addEventListener("input", (e) => {
  const inp = e.target.closest(".bbg-search-input");
  if (!inp) return;
  const tabId = inp.dataset.tabId;
  updateActiveTabState({ searchQuery: inp.value }, tabId);
});

// ── BBG CSV drag-and-drop upload ───────────────────────────────────────────────
document.addEventListener("dragover", (e) => {
  const zone = e.target.closest(".bbg-upload-zone");
  if (!zone) return;
  e.preventDefault();
  const tabId = zone.dataset.tabId;
  updateActiveTabState({ uploadState: "dragging" }, tabId);
});

document.addEventListener("dragleave", (e) => {
  const zone = e.target.closest(".bbg-upload-zone");
  if (!zone) return;
  // Only reset if leaving the zone entirely (not moving to a child)
  if (zone.contains(e.relatedTarget)) return;
  const tabId = zone.dataset.tabId;
  updateActiveTabState({ uploadState: "idle" }, tabId);
});

document.addEventListener("drop", async (e) => {
  const zone = e.target.closest(".bbg-upload-zone");
  if (!zone) return;
  e.preventDefault();

  const tabId = zone.dataset.tabId;
  const file  = e.dataTransfer?.files?.[0];

  if (!file) {
    updateActiveTabState({ uploadState: "error", uploadMessage: "No file detected." }, tabId);
    return;
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    updateActiveTabState({ uploadState: "error", uploadMessage: "Only CSV files are accepted." }, tabId);
    return;
  }

  updateActiveTabState({ uploadState: "uploading", uploadMessage: "" }, tabId);

  try {
    const form = new FormData();
    form.append("file", file);
    const result = await mappingUpload("/bbg/upload", form);

    const msg = `${result.firm_name} — ${result.confirmed_count} confirmed, `
      + `${result.discrepancy_count} discrepancies, ${result.addition_count} additions`;

    // Bust the firms cache so the view re-fetches with updated data
    updateActiveTabState({ uploadState: "success", uploadMessage: msg, data: undefined }, tabId);
  } catch (err) {
    const detail = err.detail || err.message || "Upload failed.";
    updateActiveTabState({ uploadState: "error", uploadMessage: detail }, tabId);
  }
});

// ── BBG run change ─────────────────────────────────────────────────────────────
document.addEventListener("bankst:bbgRunChange", async (e) => {
  const { tabId, runId } = e.detail;
  updateActiveTabState({ selectedRunId: runId, runData: null }, tabId);
  try {
    const [confirmed, discrepancies, additions] = await Promise.all([
      mappingGet(`/bbg/runs/${runId}/confirmed`),
      mappingGet(`/bbg/runs/${runId}/discrepancies`),
      mappingGet(`/bbg/runs/${runId}/additions`),
    ]);
    updateActiveTabState({ runData: { confirmed, discrepancies, additions } }, tabId);
  } catch (err) {
    console.error("[bbgRunChange] fetch failed:", err);
  }
});

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
  const importTrigger       = e.target.closest("[data-master-import]");
  const hfRecordTrigger     = e.target.closest("[data-open-hf-record]");
  const irFirmTrigger       = e.target.closest("[data-open-ir-firm]");
  const mapRowTrigger       = e.target.closest("[data-select-map-record]");

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
    if (t === "hf.table")       openTab({ id: "tab-hf-table",       type: "hf.table",       title: "HF Map",     state: {} });
    if (t === "ir.table")       openTab({ id: "tab-ir-table",       type: "ir.table",       title: "IR Map",     state: {} });
    if (t === "perf.dashboard") openTab({ id: "tab-perf-dashboard", type: "perf.dashboard", title: "Performance", state: {} });
    if (t === "bbg.firms") { openBbgFirmsTab(); return; }
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

  const bbgFirmBtn = e.target.closest("[data-open-bbg-firm]");
  if (bbgFirmBtn) {
    const firmId   = bbgFirmBtn.dataset.openBbgFirm;
    const firmName = bbgFirmBtn.dataset.firmName || firmId;
    openBbgFirmTab(firmId, firmName);
    return;
  }

  if (irFirmTrigger) {
    const firmName = irFirmTrigger.dataset.openIrFirm;
    const tabId    = `tab-ir-firm-${firmName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40)}`;
    openTab({ id: tabId, type: "ir.firm", title: firmName, state: { firmName } });
    return;
  }

  if (hfRecordTrigger) {
    openTab({ id: "tab-hf-table", type: "hf.table", title: "HF Map", state: {} });
    return;
  }

  if (mapRowTrigger && !e.target.closest("[data-master-import]") && !hfRecordTrigger) {
    const { selectMapRecord: id, mapSource: source } = mapRowTrigger.dataset;
    const tab = getActiveTab();
    if (!tab) return;

    // Visual selection
    document.querySelectorAll("[data-select-map-record].is-selected")
      .forEach(el => el.classList.remove("is-selected"));
    mapRowTrigger.classList.add("is-selected");

    // Update tab state and show loading in right rail immediately
    tab.state.selectedRecord = { id, source };
    tab.state.recordHistory  = undefined; // undefined = loading
    tab.state.recordName     = undefined;
    renderRightRail();

    // Fetch history async
    mappingGet(`/${source}/records/${id}`)
      .then(data => {
        tab.state.recordHistory = data.history || [];
        tab.state.recordName    = data.name || data.current_name || id;
        renderRightRail();
      })
      .catch(() => {
        tab.state.recordHistory = null; // null = error
        renderRightRail();
      });
    return;
  }

  if (importTrigger) {
    const { masterImport: id, mapSource: source } = importTrigger.dataset;
    const name = importTrigger.title.replace("Import ", "").replace(" into BankSt OS", "");
    actions.execute("master-import", { id, source, name });
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

// ── Global keyboard ────────────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); togglePalette(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); toggleLeftRail(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "\\")              { e.preventDefault(); toggleRightRail(); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); toggleZenMode(); return; }

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
initShellState();
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
startFrameMonitor();
