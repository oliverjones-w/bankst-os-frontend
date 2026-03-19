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
  getActivePane, getActiveTab, updateActiveTabState,
} from "./workspace.js";
import { renderRightRail } from "./widgets.js";
import { setNavHandlers, closeTopCard, openCard } from "./cards.js";
import { openPersonTab, openFirmTab, openFirmCard, openFinraTab, openBbgFirmsTab, openBbgFirmTab, openEncoreSyncTab } from "./nav.js";
import { loadFirmsIndex, loadRecentlyViewed, loadTrending, setApiRailRenderer, mappingGet, mappingUpload, mappingUploadStream, encorePatch } from "./api.js";
import { togglePalette, closePalette, paletteIsOpen, handlePaletteKeydown } from "./palette.js";
import { actions } from "./actions.js";
import { initDragHandlers } from "./drag.js";
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

// ── BBG run selector + delta selectors ────────────────────────────────────────
document.addEventListener("change", (e) => {
  const sel = e.target.closest(".bbg-run-selector");
  if (sel) {
    document.dispatchEvent(new CustomEvent("bankst:bbgRunChange", {
      detail: { tabId: sel.dataset.tabId, runId: parseInt(sel.value, 10) },
    }));
    return;
  }

  const da = e.target.closest(".bbg-delta-run-a");
  if (da) {
    updateActiveTabState({ deltaRunA: parseInt(da.value, 10), deltaData: null }, da.dataset.tabId);
    document.dispatchEvent(new CustomEvent("bankst:bbgDeltaFetch", { detail: { tabId: da.dataset.tabId } }));
    return;
  }

  const db_ = e.target.closest(".bbg-delta-run-b");
  if (db_) {
    updateActiveTabState({ deltaRunB: parseInt(db_.value, 10), deltaData: null }, db_.dataset.tabId);
    document.dispatchEvent(new CustomEvent("bankst:bbgDeltaFetch", { detail: { tabId: db_.dataset.tabId } }));
    return;
  }
});

// ── BBG search input ───────────────────────────────────────────────────────────
document.addEventListener("input", (e) => {
  const bbgInp = e.target.closest(".bbg-search-input");
  if (bbgInp) {
    updateActiveTabState({ searchQuery: bbgInp.value }, bbgInp.dataset.tabId);
    return;
  }
  const encoreInp = e.target.closest(".encore-search-input");
  if (encoreInp) {
    const encoreTab = workspaceState.tabs.find(t => t.type === "encore.sync");
    if (encoreTab) updateActiveTabState({ query: encoreInp.value }, encoreTab.id);
  }
});

// ── BBG CSV upload — shared handler ───────────────────────────────────────────

async function handleBbgCsvUpload(file, tabId) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    updateActiveTabState({ uploadState: "error", uploadMessage: "Only CSV files are accepted.", uploadLog: null }, tabId);
    setTimeout(() => updateActiveTabState({ uploadState: "idle", uploadMessage: "" }, tabId), 12000);
    return;
  }

  // Switch to streaming state — renders the terminal container in the view
  updateActiveTabState({ uploadState: "streaming", uploadLog: null, uploadMessage: "" }, tabId);

  const logLines = [];

  const appendLine = (type, msg) => {
    logLines.push({ type, msg });
    const el = document.getElementById(`bbg-terminal-${tabId}`);
    if (el) {
      const div = document.createElement("div");
      div.className = `tl tl-${type}`;
      div.textContent = msg;
      el.appendChild(div);
      el.scrollTop = el.scrollHeight;
    }
  };

  const form = new FormData();
  form.append("file", file);

  try {
    let finalResult = null;

    await mappingUploadStream("/bbg/upload/stream", form, (event) => {
      if (event.type === "log") {
        appendLine("log", event.payload);
      } else if (event.type === "done") {
        finalResult = event.payload;
        const r = finalResult;
        appendLine("done", `Run #${r.run_id} complete — ${r.confirmed_count} confirmed / ${r.discrepancy_count} disc / ${r.addition_count} additions`);
      } else if (event.type === "error") {
        appendLine("error", event.payload);
      }
    });

    if (finalResult) {
      updateActiveTabState({ uploadState: "success", uploadResult: finalResult, uploadLog: logLines, data: undefined }, tabId);
      // Bust the runs cache on the firm detail tab so onActivate re-fetches the new run
      updateActiveTabState({ runs: undefined, runData: null, selectedRunId: undefined }, `tab-bbg-firm-${finalResult.firm_id}`);
      openBbgFirmTab(finalResult.firm_id, finalResult.firm_name);
      setTimeout(() => updateActiveTabState({ uploadState: "idle", uploadResult: null, uploadLog: null }, tabId), 30000);
    } else {
      updateActiveTabState({ uploadState: "error", uploadMessage: "Extraction failed — see terminal output above.", uploadLog: logLines }, tabId);
      setTimeout(() => updateActiveTabState({ uploadState: "idle", uploadLog: null }, tabId), 30000);
    }
  } catch (err) {
    appendLine("error", err.detail || err.message || "Upload failed.");
    updateActiveTabState({ uploadState: "error", uploadMessage: err.detail || err.message || "Upload failed.", uploadLog: logLines }, tabId);
    setTimeout(() => updateActiveTabState({ uploadState: "idle", uploadLog: null }, tabId), 30000);
  }
}

// ── BBG upload zone drag events ────────────────────────────────────────────────
document.addEventListener("dragover", (e) => {
  const zone = e.target.closest(".bbg-upload-zone");
  if (!zone) return;
  e.preventDefault();
  updateActiveTabState({ uploadState: "dragging" }, zone.dataset.tabId);
});

document.addEventListener("dragleave", (e) => {
  const zone = e.target.closest(".bbg-upload-zone");
  if (!zone || zone.contains(e.relatedTarget)) return;
  updateActiveTabState({ uploadState: "idle" }, zone.dataset.tabId);
});

document.addEventListener("drop", async (e) => {
  const zone = e.target.closest(".bbg-upload-zone");
  if (!zone) return;
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) {
    updateActiveTabState({ uploadState: "error", uploadMessage: "No file detected." }, zone.dataset.tabId);
    return;
  }
  await handleBbgCsvUpload(file, zone.dataset.tabId);
});

// ── BBG full-pane CSV drop (dispatched by drag.js) ────────────────────────────
document.addEventListener("bankst:bbgCsvDrop", async (e) => {
  const { file, tabId } = e.detail;
  await handleBbgCsvUpload(file, tabId);
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

// ── BBG delta fetch ────────────────────────────────────────────────────────────
document.addEventListener("bankst:bbgDeltaFetch", async (e) => {
  const { tabId } = e.detail;
  const tab = workspaceState.tabs?.find(t => t.id === tabId);
  if (!tab) return;
  const runA = tab.state?.deltaRunA ?? tab.state?.runs?.[1]?.run_id;
  const runB = tab.state?.deltaRunB ?? tab.state?.runs?.[0]?.run_id;
  if (!runA || !runB || runA === runB) return;
  try {
    const delta = await mappingGet(`/bbg/delta?run_a=${runA}&run_b=${runB}`);
    updateActiveTabState({ deltaData: delta, deltaRunA: runA, deltaRunB: runB }, tabId);
  } catch (err) {
    console.error("[bbgDeltaFetch] failed:", err);
  }
});

// ── BBG persistence fetch (triggered when entering persistence mode) ───────────
document.addEventListener("bankst:bbgPersistenceFetch", async (e) => {
  const { tabId, firmId } = e.detail;
  try {
    const data = await mappingGet(`/bbg/firms/${firmId}/discrepancy-persistence`);
    updateActiveTabState({ persistenceData: data }, tabId);
  } catch (err) {
    console.error("[bbgPersistenceFetch] failed:", err);
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
    if (t === "encore.sync") { openEncoreSyncTab(); return; }
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

  const bbgRunBtn = e.target.closest("[data-select-bbg-run]");
  if (bbgRunBtn) {
    const runId = parseInt(bbgRunBtn.dataset.selectBbgRun, 10);
    const tabId = bbgRunBtn.dataset.tabId;
    document.dispatchEvent(new CustomEvent("bankst:bbgRunChange", { detail: { tabId, runId } }));
    return;
  }

  // ── Encore Sync: filter buttons ──────────────────────────────────────────────
  const encoreFilterBtn = e.target.closest(".encore-filter-btn");
  if (encoreFilterBtn) {
    updateActiveTabState({ filter: encoreFilterBtn.dataset.encoreFilter });
    return;
  }

  // ── Encore Sync: open GUID match form ────────────────────────────────────────
  const encoreMatchBtn = e.target.closest("[data-encore-match]");
  if (encoreMatchBtn) {
    const row = encoreMatchBtn.closest(".table-row-wrap");
    if (!row) return;
    const existing = row.querySelector(".encore-match-form");
    if (existing) { existing.remove(); return; }
    document.querySelectorAll(".encore-match-form").forEach(f => f.remove());
    const name        = encoreMatchBtn.dataset.encoreMatch;
    const currentGuid = encoreMatchBtn.dataset.currentGuid || "";
    const form = document.createElement("div");
    form.className = "encore-match-form";
    form.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 24px 8px;border-top:1px solid var(--border-subtle);background:rgba(0,115,255,.04);";
    form.innerHTML = `
      <input class="encore-guid-input" type="text" value="${currentGuid}"
        placeholder="Paste Encore GUID…" autocomplete="off" spellcheck="false"
        style="flex:1;max-width:360px;height:28px;padding:0 10px;font-family:var(--font-data);font-size:11px;
               background:var(--surface-2,rgba(255,255,255,.06));border:1px solid var(--border-subtle);
               border-radius:4px;color:var(--text-normal);" />
      <button class="encore-guid-confirm" data-candidate="${name}"
        style="font-family:var(--font-interface);font-size:11px;font-weight:600;padding:4px 12px;
               border-radius:4px;border:none;background:var(--interactive-accent);color:#fff;cursor:pointer;">
        Confirm
      </button>
      <button class="encore-guid-cancel"
        style="font-family:var(--font-interface);font-size:11px;color:var(--text-muted);background:none;
               border:none;cursor:pointer;padding:4px 8px;">
        Cancel
      </button>
    `;
    row.appendChild(form);
    form.querySelector(".encore-guid-input").focus();
    return;
  }

  // ── Encore Sync: confirm GUID ─────────────────────────────────────────────────
  const encoreConfirmBtn = e.target.closest(".encore-guid-confirm");
  if (encoreConfirmBtn) {
    const form  = encoreConfirmBtn.closest(".encore-match-form");
    const input = form?.querySelector(".encore-guid-input");
    const guid  = input?.value?.trim();
    const name  = encoreConfirmBtn.dataset.candidate;
    if (!guid || !name) return;
    encoreConfirmBtn.disabled    = true;
    encoreConfirmBtn.textContent = "Saving…";
    encorePatch("/candidates/match", { candidate_name: name, encore_guid: guid })
      .then(() => {
        form.remove();
        const encoreTab = workspaceState.tabs.find(t => t.type === "encore.sync");
        if (encoreTab) updateActiveTabState({ candidates: undefined, stats: undefined }, encoreTab.id);
      })
      .catch((err) => {
        encoreConfirmBtn.disabled    = false;
        encoreConfirmBtn.textContent = "Confirm";
        console.error("[encore:match]", err);
      });
    return;
  }

  // ── Encore Sync: cancel GUID form ────────────────────────────────────────────
  const encoreCancelBtn = e.target.closest(".encore-guid-cancel");
  if (encoreCancelBtn) {
    encoreCancelBtn.closest(".encore-match-form")?.remove();
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
initDragHandlers();
renderWorkspaceSnapshots();
loadFirmsIndex();
loadRecentlyViewed();
loadTrending();
startFrameMonitor();
