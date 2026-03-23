import { WORKSPACE_STORAGE_KEY, WORKSPACE_SNAPSHOTS_KEY } from "./config.js";
import { entityData, contextData } from "./mock-data.js";
import { escapeHtml } from "./utils.js";

// ── Rail renderer injection (breaks workspace ↔ widgets cycle) ────────────────
let _renderRightRail = () => {};
export function setRailRenderer(fn) { _renderRightRail = fn; }

// ── Fetch guard ────────────────────────────────────────────────────────────────
export const fetchingTabs = new Set();

// ── DOM refs ───────────────────────────────────────────────────────────────────
const workspaceContainer = document.querySelector(".workspace");
const workspaceRow       = document.querySelector(".workspace-shell");

// ── View registry ──────────────────────────────────────────────────────────────
export const workspaceViews = [];

export function registerWorkspaceView(view) {
  workspaceViews.push(view);
}

export function resolveWorkspaceView(tab) {
  if (!tab) return null;
  return workspaceViews.find((v) => v.match(tab)) || null;
}

// ── Workspace state ────────────────────────────────────────────────────────────
// tabs   — flat registry of all tab objects, keyed by position (searched by .find)
// panes  — layout: each pane holds an ordered list of tab IDs + its own activeTabId
export const workspaceState = {
  activePaneId: null,
  panes: [],
  tabs:  [],
};

// ── Pane helpers ───────────────────────────────────────────────────────────────
function makePaneId() { return `pane-${crypto.randomUUID()}`; }

function getPaneById(paneId) {
  return workspaceState.panes.find((p) => p.id === paneId) || null;
}

export function getActivePane() {
  return getPaneById(workspaceState.activePaneId) || workspaceState.panes[0] || null;
}

function findPaneForTab(tabId) {
  return workspaceState.panes.find((p) => p.tabs.includes(tabId)) || null;
}

// ── Tab helpers ────────────────────────────────────────────────────────────────
function findTab(tabId) {
  return workspaceState.tabs.find((t) => t.id === tabId) || null;
}

export function getActiveTab() {
  const pane = getActivePane();
  if (!pane) return null;
  return findTab(pane.activeTabId);
}

// ── Toolbar HTML builder ───────────────────────────────────────────────────────
export function renderToolbarGroup(items = []) {
  return items.map((item) => `
    <button
      class="toolbar-button${item.active ? " is-active" : ""}"
      data-toolbar-action="${item.id}"
      ${item.disabled ? "disabled" : ""}
      type="button"
    >${item.label}</button>
  `).join("");
}

// ── Per-pane HTML renderers ────────────────────────────────────────────────────
function renderPaneTabs(pane) {
  return pane.tabs.map((tabId) => {
    const tab      = findTab(tabId);
    if (!tab) return "";
    const isActive = tabId === pane.activeTabId;
    return `
      <div class="tab-wrap${isActive ? " is-active" : ""}" draggable="true" data-tab-id="${tabId}" data-pane-id="${pane.id}">
        <button class="tab${isActive ? " is-active" : ""}"
                data-tab-id="${tabId}" data-pane-id="${pane.id}"
        >${escapeHtml(tab.title)}</button>
        <button class="tab-close" data-close-tab="${tabId}" aria-label="Close tab">×</button>
      </div>
    `;
  }).join("");
}

function renderPaneHTML(pane) {
  const tab          = findTab(pane.activeTabId);
  const resolvedView = resolveWorkspaceView(tab);
  const isFocused    = pane.id === workspaceState.activePaneId;

  const toolbarDef = tab && resolvedView
    ? (typeof resolvedView.toolbar === "function"
        ? resolvedView.toolbar(tab)
        : (resolvedView.toolbar || { left: [], right: [] }))
    : { left: [], right: [] };

  const viewHTML = tab && resolvedView
    ? resolvedView.render(tab)
    : `<div class="table-shell">No active tab.</div>`;

  return `
    <div class="pane${isFocused ? " is-focused" : ""}" data-pane-id="${pane.id}">
      <div class="tabbar">${renderPaneTabs(pane)}</div>
      <div class="pane-toolbar">
        <div class="pane-toolbar-left">${renderToolbarGroup(toolbarDef.left || [])}</div>
        <div class="pane-toolbar-right">${renderToolbarGroup(toolbarDef.right || [])}</div>
      </div>
      <section class="view">${viewHTML}</section>
    </div>
  `;
}

// ── Tab state ──────────────────────────────────────────────────────────────────
// tabId is optional — defaults to the active pane's active tab.
// Views should pass tab.id explicitly so background-pane fetches update the right tab.
export function updateActiveTabState(patch, tabId) {
  const id  = tabId || getActiveTab()?.id;
  const tab = id ? findTab(id) : null;
  if (!tab) return;
  tab.state = { ...(tab.state || {}), ...patch };
  renderWorkspace();
  saveWorkspaceState();
}

export function updateTabTitle(tabId, title) {
  const tab = findTab(tabId);
  if (!tab || !title) return;
  tab.title = title;
  renderWorkspace();
  saveWorkspaceState();
}

// ── Master render cycle ────────────────────────────────────────────────────────
function syncSidebarState(tab) {
  if (!workspaceRow) return;
  const view = resolveWorkspaceView(tab);
  const hide = !view || view.hasContext === false;
  workspaceRow.classList.toggle("is-context-hidden", hide);
}

// Maps a tab type to its "root" nav section — so detail/child tabs
// keep the parent section highlighted (Option B: rail as sense of place)
const NAV_ROOT = {
  "person.detail":  "people.table",
  "firm.detail":    "firms.table",
  "bbg.firm":       "bbg.firms",
};

function syncNavActive(tab) {
  document.querySelectorAll("[data-open-nav-tab], [data-open-finra-tab]")
    .forEach(el => el.classList.remove("is-active"));

  if (!tab) return;

  const root = NAV_ROOT[tab.type] ?? tab.type;

  const match =
    document.querySelector(`[data-open-nav-tab="${root}"]`) ||
    document.querySelector(`[data-open-finra-tab="${root}"]`);

  match?.classList.add("is-active");
}

export function renderWorkspace() {
  if (!workspaceContainer) return;

  workspaceContainer.innerHTML = workspaceState.panes.map(renderPaneHTML).join("");

  // Fire onActivate for each pane's active tab (guarded by fetchingTabs)
  workspaceState.panes.forEach((pane) => {
    const tab  = findTab(pane.activeTabId);
    const view = resolveWorkspaceView(tab);
    if (view?.onActivate && tab && !fetchingTabs.has(tab.id)) {
      view.onActivate(tab);
    }
  });

  syncSidebarState(getActiveTab());
  syncNavActive(getActiveTab());
  updateBreadcrumbs(getActiveTab());
  _renderRightRail();
}

// ── Breadcrumbs ────────────────────────────────────────────────────────────────
// Topbar removed — breadcrumb rendering is a no-op for now
function updateBreadcrumbs(_activeTab) {}

// ── Context engine ─────────────────────────────────────────────────────────────
export function getActiveContext() {
  const activeTab = getActiveTab();
  if (!activeTab) return { type: "empty" };
  if (activeTab.type === "people.table")   return { type: "people.table",   tab: activeTab };
  if (activeTab.type === "firms.table")    return { type: "firms.table",    tab: activeTab };
  if (activeTab.type === "master.search")  return { type: "master.search",  tab: activeTab };
  if (activeTab.type === "hf.table")       return { type: "hf.table",       tab: activeTab };
  if (activeTab.type === "ir.table")       return { type: "ir.table",       tab: activeTab };
  if (activeTab.type === "ir.firm")        return { type: "ir.firm",        tab: activeTab, firmName: activeTab.state?.firmName };
  if (activeTab.type === "perf.dashboard") return { type: "perf.dashboard", tab: activeTab };
  if (activeTab.type === "person.detail") return {
    type:     "person",
    entityId: activeTab.entityId,
    entity:   entityData[activeTab.entityId],
    ...(contextData.person[activeTab.entityId] || {}),
  };
  if (activeTab.type === "firm.detail") return {
    type:     "firm",
    entityId: activeTab.entityId,
    entity:   entityData[activeTab.entityId],
    ...(contextData.firm[activeTab.entityId] || {}),
  };
  if (activeTab.type.startsWith("finra.")) return {
    type:      "finra",
    finraType: activeTab.type,
    tab:       activeTab,
  };
  if (activeTab.type === "bbg.firms") return { type: "bbg.firms", tab: activeTab };
  if (activeTab.type === "bbg.firm")  return { type: "bbg.firm",  tab: activeTab, firmId: activeTab.entityId, firmName: activeTab.title };
  return { type: "unknown", tab: activeTab };
}

// ── Tab operations ─────────────────────────────────────────────────────────────
export function focusTab(tabId, paneId) {
  const pane = (paneId ? getPaneById(paneId) : null) || findPaneForTab(tabId);
  if (!pane) return;
  pane.activeTabId = tabId;
  workspaceState.activePaneId = pane.id;
  renderWorkspace();
  saveWorkspaceState();
}

export function openTab(tab, paneId) {
  // If tab already open anywhere, just focus it
  const existingPane = findPaneForTab(tab.id);
  if (existingPane) { focusTab(tab.id, existingPane.id); return; }

  // Register tab
  if (!findTab(tab.id)) workspaceState.tabs.push(tab);

  // Target pane: explicit → active → create first pane
  let target = (paneId ? getPaneById(paneId) : null) || getActivePane();
  if (!target) {
    target = { id: makePaneId(), activeTabId: null, tabs: [] };
    workspaceState.panes.push(target);
  }

  target.tabs.push(tab.id);
  target.activeTabId = tab.id;
  workspaceState.activePaneId = target.id;
  renderWorkspace();
  saveWorkspaceState();
}

export function closeTab(tabId) {
  const pane = findPaneForTab(tabId);
  if (!pane) return;

  const idx = pane.tabs.indexOf(tabId);
  pane.tabs.splice(idx, 1);

  // Remove from global registry
  const tabIdx = workspaceState.tabs.findIndex((t) => t.id === tabId);
  if (tabIdx !== -1) workspaceState.tabs.splice(tabIdx, 1);

  if (pane.activeTabId === tabId) {
    pane.activeTabId = pane.tabs[idx] || pane.tabs[idx - 1] || null;
  }

  // Remove empty panes (keep at least one)
  if (!pane.tabs.length && workspaceState.panes.length > 1) {
    const paneIdx = workspaceState.panes.indexOf(pane);
    workspaceState.panes.splice(paneIdx, 1);
    if (workspaceState.activePaneId === pane.id) {
      workspaceState.activePaneId =
        workspaceState.panes[paneIdx]?.id ||
        workspaceState.panes[paneIdx - 1]?.id ||
        workspaceState.panes[0]?.id;
    }
  }

  renderWorkspace();
  saveWorkspaceState();
}

// ── Reorder tabs within a pane (called after DOM drag settles) ────────────────
export function reorderTabsInPane(paneId, orderedTabIds) {
  const pane = workspaceState.panes.find((p) => p.id === paneId);
  if (!pane) return;
  // Filter to only IDs that actually belong to this pane, preserving drag order
  pane.tabs = orderedTabIds.filter((id) => pane.tabs.includes(id));
  saveWorkspaceState();
}

// ── Move tab between panes ────────────────────────────────────────────────────
export function moveTab(tabId, fromPaneId, toPaneId) {
  const fromPane = workspaceState.panes.find((p) => p.id === fromPaneId);
  const toPane   = workspaceState.panes.find((p) => p.id === toPaneId);
  if (!fromPane || !toPane || fromPaneId === toPaneId) return;

  fromPane.tabs = fromPane.tabs.filter((id) => id !== tabId);
  if (fromPane.activeTabId === tabId) {
    fromPane.activeTabId = fromPane.tabs[0] || null;
  }

  // Remove empty source pane (keep at least one)
  if (!fromPane.tabs.length && workspaceState.panes.length > 1) {
    const idx = workspaceState.panes.indexOf(fromPane);
    workspaceState.panes.splice(idx, 1);
    if (workspaceState.activePaneId === fromPaneId) {
      workspaceState.activePaneId = toPane.id;
    }
  }

  toPane.tabs.push(tabId);
  toPane.activeTabId = tabId;
  workspaceState.activePaneId = toPaneId;
  renderWorkspace();
  saveWorkspaceState();
}

// ── Split pane ─────────────────────────────────────────────────────────────────
export function splitPane(tabId) {
  const source = findPaneForTab(tabId);
  if (!source) return;

  source.tabs = source.tabs.filter((id) => id !== tabId);
  if (source.activeTabId === tabId) {
    source.activeTabId = source.tabs[0] || null;
  }

  const newPane = { id: makePaneId(), activeTabId: tabId, tabs: [tabId] };
  workspaceState.panes.push(newPane);
  workspaceState.activePaneId = newPane.id;
  renderWorkspace();
  saveWorkspaceState();
}

// ── Toolbar action dispatch ────────────────────────────────────────────────────
export function handleToolbarAction(actionId) {
  switch (actionId) {
    case "people.table.mode.table":    updateActiveTabState({ mode: "table" });    break;
    case "people.table.mode.timeline": updateActiveTabState({ mode: "timeline" }); break;
    case "people.table.mode.graph":    updateActiveTabState({ mode: "graph" });    break;
    case "people.table.filter":  console.log("[toolbar] open filter UI");  break;
    case "people.table.sort":    console.log("[toolbar] open sort UI");    break;
    case "people.table.columns": console.log("[toolbar] open columns UI"); break;
    case "person.detail.profile":  updateActiveTabState({ mode: "profile" });  break;
    case "person.detail.timeline": updateActiveTabState({ mode: "timeline" }); break;
    case "person.detail.graph":    updateActiveTabState({ mode: "graph" });    break;
    case "person.detail.note":     console.log("[toolbar] add person note");        break;
    case "person.detail.reminder": console.log("[toolbar] create person reminder"); break;
    case "firm.detail.profile": updateActiveTabState({ mode: "profile" }); break;
    case "firm.detail.funds":   updateActiveTabState({ mode: "funds" });   break;
    case "firm.detail.related": updateActiveTabState({ mode: "related" }); break;
    case "firm.detail.note":     console.log("[toolbar] add firm note");        break;
    case "firm.detail.reminder": console.log("[toolbar] create firm reminder"); break;
    case "firms.table.mode.table": break;
    case "firms.table.refresh":    updateActiveTabState({ firms: undefined, error: null }); break;
    case "hf.table.refresh": updateActiveTabState({ records: undefined, recordsComplete: undefined, allChanges: undefined, dailyChanges: undefined, recordHistory: undefined, selectedRecord: undefined, error: null }); break;
    case "ir.table.refresh": updateActiveTabState({ records: undefined, recordsComplete: undefined, allChanges: undefined, dailyChanges: undefined, recordHistory: undefined, selectedRecord: undefined, error: null }); break;
    case "hf.table.save-view":
    case "ir.table.save-view": {
      const tab = getActiveTab();
      if (!tab) break;
      const f = tab.state?.filters || {};
      const q = tab.state?.query || "";
      const label = tab.type === "hf.table" ? "HF Map" : "IR Map";
      const parts = [label];
      if (f.firm)     parts.push(f.firm);
      if (f.function) parts.push(f.function);
      if (f.group)    parts.push(f.group);
      if (f.strategy) parts.push(f.strategy);
      if (f.location) parts.push(f.location);
      if (q && parts.length === 1) parts.push(`"${q}"`);
      const name = parts.join(" · ");
      createWorkspaceSnapshot(name);
      renderWorkspaceSnapshots();
      break;
    }
    case "bbg.firm.confirmed":     updateActiveTabState({ mode: "confirmed",     searchQuery: "" }); break;
    case "bbg.firm.discrepancies": updateActiveTabState({ mode: "discrepancies", searchQuery: "" }); break;
    case "bbg.firm.additions":     updateActiveTabState({ mode: "additions",     searchQuery: "" }); break;
    case "bbg.firm.analytics":     updateActiveTabState({ mode: "analytics" });                      break;
    case "bbg.firm.delta": {
      updateActiveTabState({ mode: "delta", deltaData: null });
      const _dt = getActiveTab();
      if (_dt) document.dispatchEvent(new CustomEvent("bankst:bbgDeltaFetch", { detail: { tabId: _dt.id } }));
      break;
    }
    case "bbg.firm.persistence": {
      updateActiveTabState({ mode: "persistence", persistenceData: null });
      const _pt = getActiveTab();
      if (_pt) document.dispatchEvent(new CustomEvent("bankst:bbgPersistenceFetch", { detail: { tabId: _pt.id, firmId: _pt.entityId } }));
      break;
    }
    case "bbg.firms.refresh":      updateActiveTabState({ data: undefined }); break;
    case "encore.sync.refresh":    updateActiveTabState({ candidates: undefined, stats: undefined }); break;
    case "finra.monitor.mode.overview":    updateActiveTabState({ mode: "overview" });    break;
    case "finra.monitor.mode.changes":     updateActiveTabState({ mode: "changes" });     break;
    case "finra.monitor.mode.individuals": updateActiveTabState({ mode: "individuals" }); break;
    case "trending.refresh":
    case "finra.monitor.refresh":
    case "finra.changes.refresh":
    case "finra.dashboard.refresh":
    case "finra.individuals.refresh":
      updateActiveTabState({ data: undefined, error: null, _fetching: false });
      break;
    case "perf-refresh":
      updateActiveTabState({ tick: Date.now() });
      break;
    case "perf-clear-log":
      window.perf_log = [];
      updateActiveTabState({ tick: Date.now() });
      break;
    default: console.log("[toolbar] unhandled action:", actionId);
  }
}

// ── Persistence ────────────────────────────────────────────────────────────────
export function serializeWorkspaceState() {
  return {
    version:      2,
    activePaneId: workspaceState.activePaneId,
    panes:        workspaceState.panes.map((p) => ({ ...p })),
    tabs: workspaceState.tabs.map((tab) => ({
      id:         tab.id,
      type:       tab.type,
      entityType: tab.entityType || null,
      entityId:   tab.entityId   || null,
      title:      tab.title,
      state:      tab.state || {},
    })),
  };
}

export function saveWorkspaceState() {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(serializeWorkspaceState()));
  } catch (err) {
    console.error("[workspace] Failed to save state:", err);
  }
}

export function loadWorkspaceState() {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("[workspace] Failed to load state:", err);
    return null;
  }
}

export function isValidRestoredTab(tab) {
  return tab && typeof tab.id === "string" && typeof tab.type === "string";
}

export function restoreWorkspaceState(snapshot) {
  if (!snapshot) return false;
  const validTabs = (snapshot.tabs || []).filter(isValidRestoredTab);
  if (!validTabs.length) return false;

  workspaceState.tabs = validTabs;
  const tabIds = new Set(validTabs.map((t) => t.id));

  if (snapshot.version === 2 && Array.isArray(snapshot.panes) && snapshot.panes.length) {
    // v2: restore pane layout, filtering orphaned tab refs
    workspaceState.panes = snapshot.panes
      .map((p) => ({ ...p, tabs: (p.tabs || []).filter((id) => tabIds.has(id)) }))
      .filter((p) => p.tabs.length > 0);

    if (!workspaceState.panes.length) {
      const pid = "pane-primary";
      workspaceState.panes = [{ id: pid, activeTabId: validTabs[0].id, tabs: validTabs.map((t) => t.id) }];
      workspaceState.activePaneId = pid;
    } else {
      workspaceState.activePaneId = snapshot.activePaneId || workspaceState.panes[0].id;
      if (!getPaneById(workspaceState.activePaneId)) {
        workspaceState.activePaneId = workspaceState.panes[0].id;
      }
    }
  } else {
    // v1 migration: all tabs into a single primary pane
    const pid      = "pane-primary";
    const activeId = validTabs.find((t) => t.id === snapshot.activeTabId)?.id || validTabs[0].id;
    workspaceState.panes = [{ id: pid, activeTabId: activeId, tabs: validTabs.map((t) => t.id) }];
    workspaceState.activePaneId = pid;
  }

  return true;
}

// ── Snapshots ──────────────────────────────────────────────────────────────────
export function loadWorkspaceSnapshots() {
  try {
    const raw = localStorage.getItem(WORKSPACE_SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[snapshots] Failed to load:", err);
    return [];
  }
}

export function saveWorkspaceSnapshots(items) {
  try {
    localStorage.setItem(WORKSPACE_SNAPSHOTS_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("[snapshots] Failed to save:", err);
  }
}

export function createWorkspaceSnapshot(name) {
  const now       = new Date().toISOString();
  const snapshots = loadWorkspaceSnapshots();
  const item = {
    id:        `ws-${crypto.randomUUID()}`,
    name:      name.trim(),
    createdAt: now,
    updatedAt: now,
    snapshot:  serializeWorkspaceState(),
  };
  snapshots.unshift(item);
  saveWorkspaceSnapshots(snapshots);
  return item;
}

export function deleteWorkspaceSnapshot(id) {
  saveWorkspaceSnapshots(loadWorkspaceSnapshots().filter((s) => s.id !== id));
}

export function loadWorkspaceSnapshotById(id) {
  return loadWorkspaceSnapshots().find((s) => s.id === id) || null;
}

export function applyWorkspaceSnapshot(snapshotItem) {
  if (!snapshotItem?.snapshot) return false;
  const restored = restoreWorkspaceState(snapshotItem.snapshot);
  if (!restored) return false;
  renderWorkspace();
  saveWorkspaceState();
  return true;
}

export function renderWorkspaceSnapshots() {
  const list = document.getElementById("workspaceSnapshotList");
  if (!list) return;
  const snapshots = loadWorkspaceSnapshots();
  if (!snapshots.length) {
    list.innerHTML = `<div class="saved-item is-muted">No saved workspaces</div>`;
    return;
  }
  list.innerHTML = snapshots.map((item) => `
    <div class="workspace-snapshot-row">
      <button class="saved-item" data-load-workspace-snapshot="${item.id}" title="${item.name}">${item.name}</button>
      <button class="tab-close" data-delete-workspace-snapshot="${item.id}" aria-label="Delete snapshot">×</button>
    </div>
  `).join("");
}

// ── Dev helper ─────────────────────────────────────────────────────────────────
export function resetWorkspaceState() {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  location.reload();
}
window.resetWorkspaceState = resetWorkspaceState;
