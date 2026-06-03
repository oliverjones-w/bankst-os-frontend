import {
  bankstGet,
  pipelineGet,
  mandatesGet,
  clientRequestsGet,
  researchTasksGet,
  finraGet,
  mappingGet,
  encoreGet,
  opsGet,
  outlookGet,
  outlookPost,
} from "./api.js";
import { mandatesPatch, opsPost, eqdGet, eqdPost, eqdPatch } from "./api-os.js?v=3";
import { escapeHtml } from "./utils.js";
import { getTheme, toggleTheme } from "./theme.js";
import { createEqdView, EQD_VIEW_ID } from "./views/eqd.js?v=3";
import { createArticleReviewView, ARTICLE_REVIEW_VIEW_ID } from "./views/article_review.js";
import { createLogIntakeView } from "./views/log_intake.js";
import { createOutlookArticlesView, OUTLOOK_ARTICLES_VIEW_ID } from "./views/outlook_articles.js";
import { createFinraView, FINRA_VIEW_ID } from "./views/finra.js";
import { createEncoreView, ENCORE_VIEW_ID } from "./views/encore.js";
import { createPeopleApprovalView, PEOPLE_APPROVAL_VIEW_ID } from "./views/people_approval.js";

const ACTIVE_VIEW_KEY = "bankst.simple.active-view";
const DEFAULT_VIEW_ID = "platform.overview";
const REFERENCE_VIEW_ID = "reference.unified";
const BBG_VIEW_ID = "bbg.workspace";
const REFERENCE_SOURCES = ["hf", "ir", "commodities", "equities"];
const REFERENCE_SOURCE_LABELS = {
  hf: "HF",
  ir: "IR",
  commodities: "Commodities",
  equities: "Equities",
};
// Canonical mandate candidate stage values — must stay in sync with mandate_candidate_status.py.
const MANDATE_CANDIDATE_STATUSES = [
  "placed", "offer-accepted", "offer-extended", "offer-declined",
  "in-process", "submitted", "submission-pending", "in-discussion",
  "agent-declined", "candidate-declined", "client-declined",
  "on-hold", "off-limits", "carve-out",
];

// Keep this list in desired display order as workflow statuses evolve.
// Add new statuses here (or aliases) instead of relying on alphabetical sorting.
const CANDIDATE_STATUS_SORT_RULES = [
  { key: "placed", aliases: ["placed"] },
  { key: "offer_extended", aliases: ["offer extended", "offer_extended"] },
  { key: "in_process", aliases: ["in process", "in_process", "process"] },
  { key: "live", aliases: ["live", "active"] },
  { key: "new", aliases: ["new"] },
  { key: "declined", aliases: ["declined", "rejected"] },
];

const state = {
  activeViewId: DEFAULT_VIEW_ID,
  isLoading: false,
  error: null,
  requestId: 0,
  cache: new Map(),
  pipeline: {
    expandedRowKey: null,
  },
  mandates: {
    expandedClients: {},
    expandedMandateKey: null,
    candidatesByMandate: {},
  },
  finra: {
    query: "",
    filter: "all",
  },
  reference: {
    query: "",
    includeInactive: false,
    sources: normalizeReferenceSources(),
  },
  bbg: {
    selectedFirmId: null,
  },
  palette: {
    open: false,
    query: "",
    items: [],
    selectedIndex: 0,
  },
};

let referenceSearchTimer = null;
let referenceSearchRequestId = 0;

const elements = {
  viewRoot: document.getElementById("viewRoot"),
  viewTitle: document.getElementById("viewTitle"),
  viewMeta: document.getElementById("viewMeta"),
  refreshBtn: document.getElementById("refreshBtn"),
  commandTrigger: document.getElementById("commandTrigger"),
  themeToggleBtn: document.getElementById("themeToggle"),
  commandPalette: document.getElementById("commandPalette"),
  commandInput: document.getElementById("commandInput"),
  commandResults: document.getElementById("commandResults"),
};

const VIEWS = [
  createPlatformView(),
  createPipelineView(),
  createMandatesView(),
  createTableView({
    id: "client-requests.table",
    label: "Client Requests",
    section: "Views",
    endpoint: "/api/ops/client-requests",
    request: () => clientRequestsGet("/client-requests"),
    columns: [
      col("Request", ["request_name", "title", "request"]),
      col("Firm", ["firm_name", "client_firm_name", "client"]),
      col("Type", ["request_type", "type", "category"]),
      col("Status", ["status"]),
      col("Priority", ["priority"]),
      col("Owner", ["owner_name", "owner", "assignee"]),
      col("Due", ["due_date", "target_date", "deadline"], { format: formatDate }),
    ],
    emptyText: "No client request rows returned.",
  }),
  createTableView({
    id: "research-tasks.table",
    label: "Research Tasks",
    section: "Views",
    endpoint: "/api/ops/research-tasks",
    request: () => researchTasksGet("/research-tasks"),
    columns: [
      col("Task", ["task_name", "title", "task"]),
      col("Firm", ["firm_name", "client_firm_name", "client"]),
      col("Mandate", ["mandate_name", "mandate", "context"]),
      col("Status", ["status"]),
      col("Priority", ["priority"]),
      col("Owner", ["owner_name", "owner", "assignee"]),
      col("Due", ["due_date", "target_date", "deadline"], { format: formatDate }),
    ],
    emptyText: "No research task rows returned.",
  }),
  createTableView({
    id: "followups.queue",
    label: "Follow-ups",
    section: "Views",
    endpoint: "/api/ops/pipeline/follow-ups",
    request: () => pipelineGet("/pipeline/follow-ups"),
    columns: [
      col("Person", ["person", "name"]),
      col("Firm", ["firm", "firm_name"]),
      col("Campaign", ["context"]),
      col("Status", ["status"]),
      col("Follow-up", ["follow_up_date", "due_date"], { format: formatDate }),
      col("Days", ["days_since"]),
      col("Notes", ["notes"]),
    ],
    emptyText: "No follow-up rows returned.",
  }),
  createReferenceView(),
  createFinraView(finraGet),
  createBbgWorkspaceView(),
  createEqdView(eqdGet, eqdPost, eqdPatch),
  createArticleReviewView(opsGet, opsPost),
  createLogIntakeView(opsGet, opsPost),
  createOutlookArticlesView(outlookGet, outlookPost),
  createEncoreView(encoreGet),
  createPeopleApprovalView(opsGet, opsPost),
];

const VIEW_BY_ID = new Map(VIEWS.map((view) => [view.id, view]));
let syncThemeToggleLabel = () => {};

boot();

function boot() {
  if (!elements.viewRoot || !elements.viewTitle || !elements.viewMeta) return;

  const restoredViewId = localStorage.getItem(ACTIVE_VIEW_KEY);
  if (restoredViewId && VIEW_BY_ID.has(restoredViewId)) {
    state.activeViewId = restoredViewId;
  }

  wireMainActions();
  wireThemeToggle();
  wirePalette();
  wireGlobalKeys();
  openView(state.activeViewId, { force: true });
}

function wireMainActions() {
  elements.refreshBtn.addEventListener("click", () => {
    openView(state.activeViewId, { force: true });
  });

  elements.viewRoot.addEventListener("input", (event) => {
    const input = event.target.closest("[data-finra-search]");
    if (!input || state.activeViewId !== FINRA_VIEW_ID) return;
    const cacheEntry = state.cache.get(FINRA_VIEW_ID);
    if (cacheEntry?.data) {
      cacheEntry.data.searchQuery = input.value || "";
      renderActiveView();
    }
  });

  elements.viewRoot.addEventListener("input", (event) => {
    const eqdSearch = event.target.closest("[data-eqd-search]");
    if (eqdSearch && state.activeViewId === EQD_VIEW_ID) {
      const eqdView = VIEW_BY_ID.get(EQD_VIEW_ID);
      const eqdData = state.cache.get(EQD_VIEW_ID)?.data;
      if (eqdView && eqdData) eqdView.onSearch(eqdSearch.value || "", eqdData, renderActiveView);
      return;
    }

    const eqdFnFilter = event.target.closest("[data-eqd-fn-filter]");
    if (eqdFnFilter && state.activeViewId === EQD_VIEW_ID) {
      const eqdView = VIEW_BY_ID.get(EQD_VIEW_ID);
      const eqdData = state.cache.get(EQD_VIEW_ID)?.data;
      if (eqdView && eqdData) eqdView.onFnFilter(eqdFnFilter.value || "", eqdData, renderActiveView);
      return;
    }
  });

  elements.viewRoot.addEventListener("input", (event) => {
    const input = event.target.closest("[data-reference-query]");
    if (!input || state.activeViewId !== REFERENCE_VIEW_ID) return;
    const cacheEntry = state.cache.get(REFERENCE_VIEW_ID);
    if (!cacheEntry?.data) return;
    const nextQuery = input.value || "";
    cacheEntry.data.query = nextQuery;
    state.reference.query = nextQuery;
    scheduleReferenceSearch(250);
  });

  elements.viewRoot.addEventListener("input", (event) => {
    const input = event.target.closest("[data-encore-search]");
    if (!input || state.activeViewId !== ENCORE_VIEW_ID) return;
    const encoreView = VIEW_BY_ID.get(ENCORE_VIEW_ID);
    const encoreData = state.cache.get(ENCORE_VIEW_ID)?.data;
    if (encoreView && encoreData) encoreView.onSearchInput(input.value || "", encoreData, renderActiveView);
  });

  elements.viewRoot.addEventListener("input", (event) => {
    const input = event.target.closest("[data-reviewer-email]");
    if (!input || state.activeViewId !== PEOPLE_APPROVAL_VIEW_ID) return;
    const peopleView = VIEW_BY_ID.get(PEOPLE_APPROVAL_VIEW_ID);
    const peopleData = state.cache.get(PEOPLE_APPROVAL_VIEW_ID)?.data;
    if (peopleView && peopleData) peopleView.onReviewerEmailChange(input.value || "", peopleData, renderActiveView);
  });

  elements.viewRoot.addEventListener("click", (event) => {
    const pipelineToggle = event.target.closest("[data-pipeline-row-key]");
    if (pipelineToggle && state.activeViewId === "pipeline.table") {
      const key = pipelineToggle.dataset.pipelineRowKey || "";
      state.pipeline.expandedRowKey = state.pipeline.expandedRowKey === key ? null : key;
      renderActiveView();
      return;
    }

    const clientToggle = event.target.closest("[data-mandates-client-key]");
    if (clientToggle && state.activeViewId === "mandates.table") {
      const key = clientToggle.dataset.mandatesClientKey || "";
      const next = { ...(state.mandates.expandedClients || {}) };
      next[key] = !next[key];
      state.mandates.expandedClients = next;
      renderActiveView();
      return;
    }

    const mandateToggle = event.target.closest("[data-mandate-row-key]");
    if (mandateToggle && state.activeViewId === "mandates.table") {
      const key = mandateToggle.dataset.mandateRowKey || "";
      const opening = state.mandates.expandedMandateKey !== key;
      state.mandates.expandedMandateKey = opening ? key : null;
      if (opening) {
        const mandateId = mandateToggle.dataset.mandateId || "";
        const cMode = state.cache.get("mandates.table")?.data?.candidatesMode;
        if (mandateId && cMode !== "bulk") {
          ensureMandateCandidatesForMandate(mandateId);
          return;
        }
      }
      renderActiveView();
      return;
    }

    const sourceToggle = event.target.closest("[data-reference-source]");
    if (sourceToggle && state.activeViewId === REFERENCE_VIEW_ID) {
      const source = sourceToggle.dataset.referenceSource || "";
      if (!REFERENCE_SOURCES.includes(source)) return;
      const cacheEntry = state.cache.get(REFERENCE_VIEW_ID);
      if (!cacheEntry?.data) return;

      const sources = normalizeReferenceSources(cacheEntry.data.sources);
      const nextValue = !sources[source];
      sources[source] = nextValue;
      if (!Object.values(sources).some(Boolean)) {
        sources[source] = true;
      }

      cacheEntry.data.sources = sources;
      state.reference.sources = { ...sources };
      renderActiveView();
      if ((cacheEntry.data.query || "").trim()) scheduleReferenceSearch(0);
      return;
    }

    const inactiveToggle = event.target.closest("[data-reference-include-inactive]");
    if (inactiveToggle && state.activeViewId === REFERENCE_VIEW_ID) {
      const cacheEntry = state.cache.get(REFERENCE_VIEW_ID);
      if (!cacheEntry?.data) return;
      const nextValue = !Boolean(cacheEntry.data.includeInactive);
      cacheEntry.data.includeInactive = nextValue;
      state.reference.includeInactive = nextValue;
      renderActiveView();
      if ((cacheEntry.data.query || "").trim()) scheduleReferenceSearch(0);
      return;
    }

    const clearButton = event.target.closest("[data-reference-clear]");
    if (clearButton && state.activeViewId === REFERENCE_VIEW_ID) {
      const cacheEntry = state.cache.get(REFERENCE_VIEW_ID);
      if (!cacheEntry?.data) return;
      if (referenceSearchTimer) clearTimeout(referenceSearchTimer);
      referenceSearchRequestId += 1;
      cacheEntry.data.query = "";
      cacheEntry.data.results = [];
      cacheEntry.data.resultCount = 0;
      cacheEntry.data.sourceErrors = {};
      cacheEntry.data.searched = false;
      cacheEntry.data.searching = false;
      cacheEntry.data.error = null;
      state.reference.query = "";
      renderActiveView();
      return;
    }

    const button = event.target.closest("[data-finra-filter]");
    if (button && state.activeViewId === FINRA_VIEW_ID) {
      const view = VIEW_BY_ID.get(FINRA_VIEW_ID);
      const data = state.cache.get(FINRA_VIEW_ID)?.data;
      if (view && data) {
        view.handleClick(event, data, renderActiveView);
      }
      return;
    }

    const encoreFilter = event.target.closest("[data-filter]");
    if (encoreFilter && state.activeViewId === ENCORE_VIEW_ID) {
      const encoreView = VIEW_BY_ID.get(ENCORE_VIEW_ID);
      const encoreData = state.cache.get(ENCORE_VIEW_ID)?.data;
      if (encoreView && encoreData) {
        encoreView.onStatusFilter(encoreFilter.dataset.filter || "all", encoreData, renderActiveView);
      }
      return;
    }

    const encoreToggle = event.target.closest("[data-encore-toggle]");
    if (encoreToggle && state.activeViewId === ENCORE_VIEW_ID) {
      const encoreView = VIEW_BY_ID.get(ENCORE_VIEW_ID);
      const encoreData = state.cache.get(ENCORE_VIEW_ID)?.data;
      if (encoreView && encoreData) {
        encoreView.onToggleRow(encoreToggle.dataset.encoreToggle, encoreData, renderActiveView);
      }
      return;
    }

    const bbgRefresh = event.target.closest("[data-bbg-refresh]");
    if (bbgRefresh && state.activeViewId === BBG_VIEW_ID) {
      openView(BBG_VIEW_ID, { force: true });
      return;
    }

    const bbgFirmSelect = event.target.closest("[data-bbg-firm-select]");
    if (bbgFirmSelect && state.activeViewId === BBG_VIEW_ID) {
      bbgSelectFirm(bbgFirmSelect.dataset.bbgFirmSelect);
      return;
    }

    const bbgFirmBack = event.target.closest("[data-bbg-firm-back]");
    if (bbgFirmBack && state.activeViewId === BBG_VIEW_ID) {
      bbgClearFirmView();
      return;
    }

    const bbgRunRow = event.target.closest("[data-bbg-run-id]");
    if (bbgRunRow && state.activeViewId === BBG_VIEW_ID) {
      bbgSelectRun(Number(bbgRunRow.dataset.bbgRunId));
      return;
    }

    // ── EQD Command Center ──────────────────────────────────────────────────
    if (state.activeViewId === EQD_VIEW_ID) {
      const eqdView = VIEW_BY_ID.get(EQD_VIEW_ID);
      const eqdData = state.cache.get(EQD_VIEW_ID)?.data;
      if (!eqdView || !eqdData) return;

      const eqdTab = event.target.closest("[data-eqd-tab]");
      if (eqdTab) { eqdView.onTab(eqdTab.dataset.eqdTab, eqdData, renderActiveView); return; }

      const eqdPerson = event.target.closest("[data-eqd-person]");
      if (eqdPerson) { eqdView.onPersonClick(eqdPerson.dataset.eqdPerson, eqdData, renderActiveView); return; }

      const eqdPersonBack = event.target.closest("[data-eqd-person-back]");
      if (eqdPersonBack) { eqdView.onPersonBack(eqdData, renderActiveView); return; }

      const eqdIntelSave = event.target.closest("[data-eqd-intelligence-save]");
      if (eqdIntelSave) {
        eqdView.onIntelligenceSave(eqdIntelSave.dataset.eqdIntelligenceSave, eqdData, renderActiveView);
        return;
      }

      const eqdPersonNote = event.target.closest("[data-eqd-person-note-submit]");
      if (eqdPersonNote) {
        const personId = eqdPersonNote.dataset.eqdPersonNoteSubmit;
        const text     = document.getElementById("eqd-detail-note-text")?.value || "";
        const source   = document.getElementById("eqd-detail-note-source")?.value || "manual";
        eqdView.onPersonNoteSubmit(personId, text, source, eqdData, renderActiveView);
        return;
      }

      const eqdFirm = event.target.closest("[data-eqd-firm]");
      if (eqdFirm) { eqdView.onFirmClick(eqdFirm.dataset.eqdFirm, eqdData, renderActiveView); return; }

      const eqdFirmBack = event.target.closest("[data-eqd-firm-back]");
      if (eqdFirmBack) { eqdView.onFirmBack(eqdData, renderActiveView); return; }

      const eqdFirmView = event.target.closest("[data-eqd-firm-view]");
      if (eqdFirmView) {
        eqdView.onFirmViewMode(eqdFirmView.dataset.eqdFirmView, eqdFirmView.dataset.eqdFirmViewId, eqdData, renderActiveView);
        return;
      }

      const eqdFreeze = event.target.closest("[data-eqd-freeze]");
      if (eqdFreeze) { eqdView.onFreeze(eqdFreeze.dataset.eqdFreeze, eqdData, renderActiveView); return; }

      const canvasUnpin = event.target.closest("[data-canvas-unpin]");
      if (canvasUnpin) { eqdView.onCanvasUnpin(canvasUnpin.dataset.canvasUnpin, eqdData, renderActiveView); return; }

      const canvasSave = event.target.closest("[data-eqd-canvas-save]");
      if (canvasSave) { eqdView.onCanvasSaveToServer(eqdData); return; }

      const eqdGraphBack = event.target.closest("[data-eqd-graph-back]");
      if (eqdGraphBack) { eqdView.onGraphBack(eqdData, renderActiveView); return; }

      const eqdNoteSubmit = event.target.closest("[data-eqd-note-submit]");
      if (eqdNoteSubmit) {
        const text       = document.getElementById("eqd-note-text")?.value || "";
        const entityType = document.getElementById("eqd-note-entity-type")?.value || "general";
        const entityId   = document.getElementById("eqd-note-entity-id")?.value?.trim() || null;
        const source     = document.getElementById("eqd-note-source")?.value || "manual";
        eqdView.onNoteSubmit(text, entityType, entityId, source, eqdData, renderActiveView);
        return;
      }
    }

    // ── Article Review ──────────────────────────────────────────────────────
    if (state.activeViewId === ARTICLE_REVIEW_VIEW_ID) {
      const articleView = VIEW_BY_ID.get(ARTICLE_REVIEW_VIEW_ID);
      const articleData = state.cache.get(ARTICLE_REVIEW_VIEW_ID)?.data;
      if (!articleView || !articleData) return;

      const articleTab = event.target.closest("[data-article-tab]");
      if (articleTab) {
        articleView.onTab(articleTab.dataset.articleTab, articleData, renderActiveView);
        return;
      }

      const articleExcerpt = event.target.closest("[data-article-excerpt]");
      if (articleExcerpt) {
        articleView.onToggleExcerpt(Number(articleExcerpt.dataset.articleExcerpt), articleData, renderActiveView);
        return;
      }

      const articleResolve = event.target.closest("[data-article-run-resolution]");
      if (articleResolve) {
        articleView.onRunResolution(articleData, renderActiveView);
        return;
      }

      const articleDecide = event.target.closest("[data-article-decide]");
      if (articleDecide) {
        articleView.onDecide(
          Number(articleDecide.dataset.articleDecide),
          articleDecide.dataset.articleDecision,
          articleData,
          renderActiveView,
        );
        return;
      }
    }

    // ── People Approval ────────────────────────────────────────────────────
    if (state.activeViewId === PEOPLE_APPROVAL_VIEW_ID) {
      const peopleView = VIEW_BY_ID.get(PEOPLE_APPROVAL_VIEW_ID);
      const peopleData = state.cache.get(PEOPLE_APPROVAL_VIEW_ID)?.data;
      if (!peopleView || !peopleData) return;

      const personSelect = event.target.closest("[data-person-select]");
      if (personSelect) {
        peopleView.onSelectCandidate(Number(personSelect.dataset.personSelect), peopleData, renderActiveView);
        return;
      }

      const approveBtn = event.target.closest("[data-approve-vault]");
      if (approveBtn) {
        peopleView.onApproveMatch(
          peopleData.selectedCandidateId,
          approveBtn.dataset.approveVault,
          peopleData,
          renderActiveView,
        );
        return;
      }

      const dismissBtn = event.target.closest("[data-person-dismiss-modal]");
      if (dismissBtn) {
        peopleView.onDismissModal(peopleData, renderActiveView);
        return;
      }
    }

    // ── Generic modular-view dispatch ───────────────────────────────────────
    // Only reached if no explicit block above claimed the event.
    // New modular views define handleClick(event, data, rerender) and never
    // need to touch wireMainActions.
    {
      const activeView = VIEW_BY_ID.get(state.activeViewId);
      const activeData = state.cache.get(state.activeViewId)?.data;
      if (activeView?.handleClick && activeData) {
        activeView.handleClick(event, activeData, renderActiveView);
      }
    }
  });

  elements.viewRoot.addEventListener("change", (event) => {
    const stageSelect = event.target.closest("[data-mandate-candidate-stage]");
    if (stageSelect && state.activeViewId === "mandates.table") {
      const candidateDbId = stageSelect.dataset.candidateDbId || "";
      const mandateId = stageSelect.dataset.mandateId || "";
      const newStage = stageSelect.value;
      if (!candidateDbId || !newStage) return;

      const ref = getMandateCandidateRef(mandateId, candidateDbId);
      if (!ref) return;
      const prevStage = ref.rows[ref.idx].stage_status;
      ref.rows[ref.idx] = { ...ref.rows[ref.idx], stage_status: newStage };
      renderActiveView();

      const requestId = `stage-${candidateDbId}-${Date.now()}`;
      mandatesPatch(`/mandate-candidates/${candidateDbId}`, {
        candidate_stage: newStage,
        actor: "bankst-frontend",
        source_system: "bankst-os-frontend",
        request_id: requestId,
      }).catch((err) => {
        console.error("[mandates] stage patch failed, reverting:", err?.message || err);
        const revertRef = getMandateCandidateRef(mandateId, candidateDbId);
        if (revertRef) revertRef.rows[revertRef.idx] = { ...revertRef.rows[revertRef.idx], stage_status: prevStage };
        renderActiveView();
      });
      return;
    }
  });

  // EQD canvas drag events emitted from module-level drag system in eqd.js
  document.addEventListener("eqd:canvas-place", (evt) => {
    if (state.activeViewId !== EQD_VIEW_ID) return;
    const eqdView = VIEW_BY_ID.get(EQD_VIEW_ID);
    const eqdData = state.cache.get(EQD_VIEW_ID)?.data;
    if (eqdView && eqdData)
      eqdView.onCanvasPlace(evt.detail.personId, evt.detail.x, evt.detail.y, eqdData, renderActiveView);
  });

  document.addEventListener("eqd:canvas-move", (evt) => {
    if (state.activeViewId !== EQD_VIEW_ID) return;
    const eqdView = VIEW_BY_ID.get(EQD_VIEW_ID);
    const eqdData = state.cache.get(EQD_VIEW_ID)?.data;
    if (eqdView && eqdData)
      eqdView.onCanvasMove(evt.detail.personId, evt.detail.x, evt.detail.y, eqdData);
  });

  // EQD graph: firm-expand event emitted from Cytoscape tap handler in eqd.js
  document.addEventListener("eqd:graph-firm-expand", (evt) => {
    if (state.activeViewId !== EQD_VIEW_ID) return;
    const eqdView = VIEW_BY_ID.get(EQD_VIEW_ID);
    const eqdData = state.cache.get(EQD_VIEW_ID)?.data;
    if (eqdView && eqdData) eqdView.onGraphFirmExpand(evt.detail.firmId, eqdData, renderActiveView);
  });

  document.addEventListener("eqd:person-click", (evt) => {
    if (state.activeViewId !== EQD_VIEW_ID) return;
    const eqdView = VIEW_BY_ID.get(EQD_VIEW_ID);
    const eqdData = state.cache.get(EQD_VIEW_ID)?.data;
    if (eqdView && eqdData) eqdView.onPersonClick(evt.detail.personId, eqdData, renderActiveView);
  });
}

function wireThemeToggle() {
  syncThemeToggleLabel = () => {
    const nextTheme = getTheme() === "dark" ? "Light" : "Dark";
    elements.themeToggleBtn.textContent = nextTheme;
    elements.themeToggleBtn.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    elements.themeToggleBtn.title = `Switch to ${nextTheme} theme`;
  };

  syncThemeToggleLabel();

  elements.themeToggleBtn?.addEventListener("click", () => {
    toggleTheme();
    syncThemeToggleLabel();
  });
}

function wirePalette() {
  elements.commandTrigger?.addEventListener("click", togglePalette);

  document.addEventListener("pointerdown", (event) => {
    if (!state.palette.open) return;
    const insidePalette = event.target.closest("#commandPalette");
    const insideTrigger = event.target.closest("#commandTrigger");
    if (!insidePalette && !insideTrigger) closePalette();
  });

  elements.commandInput.addEventListener("input", () => {
    state.palette.query = elements.commandInput.value;
    state.palette.selectedIndex = 0;
    renderPaletteResults();
  });

  elements.commandResults.addEventListener("click", (event) => {
    const row = event.target.closest("[data-item-index]");
    if (!row) return;
    activatePaletteItem(Number(row.dataset.itemIndex));
  });
}

function wireGlobalKeys() {
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
      event.preventDefault();
      togglePalette();
      return;
    }

    if (!state.palette.open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.palette.selectedIndex = Math.min(
        state.palette.selectedIndex + 1,
        Math.max(state.palette.items.length - 1, 0),
      );
      renderPaletteResults();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      state.palette.selectedIndex = Math.max(state.palette.selectedIndex - 1, 0);
      renderPaletteResults();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      activatePaletteItem(state.palette.selectedIndex);
    }
  });
}

async function openView(viewId, { force = false } = {}) {
  const view = VIEW_BY_ID.get(viewId);
  if (!view) return;

  state.activeViewId = viewId;
  state.error = null;
  state.isLoading = true;
  state.requestId += 1;
  localStorage.setItem(ACTIVE_VIEW_KEY, viewId);

  const requestId = state.requestId;

  if (force) {
    state.cache.delete(viewId);
  }

  renderActiveView();

  if (!force && state.cache.has(viewId)) {
    state.isLoading = false;
    renderActiveView();
    return;
  }

  try {
    const data = await view.load();
    if (requestId !== state.requestId) return;

    state.cache.set(viewId, {
      loadedAt: Date.now(),
      data,
    });

    state.isLoading = false;
    state.error = null;
    renderActiveView();
  } catch (error) {
    if (requestId !== state.requestId) return;

    state.isLoading = false;
    state.error = error?.message || String(error);
    renderActiveView();
  }
}

function renderActiveView() {
  const view = VIEW_BY_ID.get(state.activeViewId);
  if (!view) return;

  const cacheEntry = state.cache.get(state.activeViewId);
  const loadedAt = cacheEntry?.loadedAt ? new Date(cacheEntry.loadedAt) : null;

  elements.viewTitle.textContent = view.label;
  elements.viewMeta.textContent = buildViewMeta(view, loadedAt);

  if (state.isLoading && !cacheEntry) {
    elements.viewRoot.innerHTML = `<div class="loading">Loading ${escapeHtml(view.label)}...</div>`;
    return;
  }

  if (state.error) {
    elements.viewRoot.innerHTML = `
      <div class="error">
        <strong>${escapeHtml(view.label)} failed to load.</strong><br>
        ${escapeHtml(state.error)}
      </div>
    `;
    return;
  }

  // Preserve focus and cursor position across innerHTML replacement.
  // Both the FINRA and Reference search inputs are event-delegated and
  // get recreated on every render; without this the user loses typing focus
  // after each debounce/re-render cycle.
  const activeEl = document.activeElement;
  const focusedSelector =
    activeEl && elements.viewRoot.contains(activeEl) && activeEl.tagName === "INPUT"
      ? (activeEl.hasAttribute("data-reference-query") ? "[data-reference-query]"
        : activeEl.hasAttribute("data-finra-search") ? "[data-finra-search]"
        : activeEl.hasAttribute("data-eqd-search") ? "[data-eqd-search]"
        : null)
      : null;
  const savedCursor = focusedSelector !== null ? activeEl.selectionStart : null;

  const data = cacheEntry?.data;
  elements.viewRoot.innerHTML = view.render(data);
  view.afterRender?.(data);

  if (focusedSelector) {
    const newInput = elements.viewRoot.querySelector(focusedSelector);
    if (newInput) {
      newInput.focus();
      if (savedCursor !== null) {
        try { newInput.setSelectionRange(savedCursor, savedCursor); } catch (_) {}
      }
    }
  }
}

function buildViewMeta(view, loadedAt) {
  const parts = [];
  if (view.endpoint) parts.push(`Source: ${view.endpoint}`);
  if (loadedAt) parts.push(`Updated ${loadedAt.toLocaleTimeString()}`);
  if (state.isLoading && state.cache.has(state.activeViewId)) parts.push("Refreshing...");
  return parts.join(" | ");
}

function togglePalette() {
  if (state.palette.open) closePalette();
  else openPalette();
}

function openPalette() {
  state.palette.open = true;
  state.palette.query = "";
  state.palette.selectedIndex = 0;
  elements.commandPalette.classList.remove("is-hidden");
  elements.commandPalette.classList.remove("has-results");
  elements.commandPalette.dataset.mode = "command";
  elements.commandInput.value = "";
  renderPaletteResults();
  requestAnimationFrame(() => elements.commandInput.focus());
}

function closePalette() {
  state.palette.open = false;
  elements.commandPalette.classList.add("is-hidden");
  elements.commandPalette.classList.remove("has-results");
  delete elements.commandPalette.dataset.mode;
  elements.commandResults.innerHTML = "";
}

function renderPaletteResults() {
  const query = state.palette.query.trim().toLowerCase();

  const viewItems = VIEWS
    .filter((view) => {
      if (!query) return true;
      return view.label.toLowerCase().includes(query) || view.id.toLowerCase().includes(query);
    })
    .map((view) => ({
      kind: "view",
      id: view.id,
      label: view.label,
      sub: view.section,
    }));

  const actionItems = [
    { kind: "action", id: "refresh", label: "Refresh Current View", sub: "Command" },
    { kind: "action", id: "theme", label: "Toggle Theme", sub: "Command" },
  ].filter((item) => !query || item.label.toLowerCase().includes(query));

  state.palette.items = [...viewItems, ...actionItems];

  if (!state.palette.items.length) {
    elements.commandPalette.classList.remove("has-results");
    elements.commandResults.innerHTML = `<div class="empty">No matches</div>`;
    return;
  }

  if (state.palette.selectedIndex >= state.palette.items.length) {
    state.palette.selectedIndex = state.palette.items.length - 1;
  }

  elements.commandPalette.classList.toggle("has-results", true);

  elements.commandResults.innerHTML = state.palette.items
    .map((item, index) => {
      const selectedClass = index === state.palette.selectedIndex ? " is-selected" : "";
      return `
        <button class="command-row${selectedClass}" type="button" data-item-index="${index}">
          <span>${escapeHtml(item.label)}</span>
          <span class="command-type">${escapeHtml(item.sub)}</span>
        </button>
      `;
    })
    .join("");
}

function activatePaletteItem(index) {
  const item = state.palette.items[index];
  if (!item) return;

  if (item.kind === "view") {
    openView(item.id);
  } else if (item.id === "refresh") {
    openView(state.activeViewId, { force: true });
  } else if (item.id === "theme") {
    toggleTheme();
    syncThemeToggleLabel();
  }

  closePalette();
}

function col(label, keys, options = {}) {
  return {
    label,
    keys: Array.isArray(keys) ? keys : [keys],
    ...options,
  };
}

function createTableView(definition) {
  return {
    id: definition.id,
    label: definition.label,
    section: definition.section,
    endpoint: definition.endpoint,
    load: async () => {
      const response = await definition.request();
      return {
        rows: rowsFrom(response),
      };
    },
    render: (data) => {
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      return renderSimpleTable(definition.columns, rows, definition.emptyText);
    },
  };
}

function normalizeReferenceSources(rawSources = null) {
  const normalized = REFERENCE_SOURCES.reduce((acc, source) => {
    acc[source] = true;
    return acc;
  }, {});

  if (rawSources && typeof rawSources === "object") {
    for (const source of REFERENCE_SOURCES) {
      if (source in rawSources) {
        normalized[source] = Boolean(rawSources[source]);
      }
    }
  }

  if (!Object.values(normalized).some(Boolean)) {
    normalized.hf = true;
  }
  return normalized;
}

function selectedReferenceSources(sources) {
  return REFERENCE_SOURCES.filter((source) => Boolean(sources?.[source]));
}

function createReferenceBaseData() {
  return {
    query: state.reference.query || "",
    includeInactive: Boolean(state.reference.includeInactive),
    sources: normalizeReferenceSources(state.reference.sources),
    results: [],
    resultCount: 0,
    sourceErrors: {},
    searched: false,
    searching: false,
    error: null,
  };
}

async function fetchReferenceSearch({ query, sources, includeInactive }) {
  const trimmed = String(query || "").trim();
  const selected = selectedReferenceSources(sources);

  if (!trimmed || !selected.length) {
    return {
      result_count: 0,
      results: [],
      source_errors: {},
    };
  }

  const params = new URLSearchParams({
    q: trimmed,
    sources: selected.join(","),
    limit_per_source: "100",
  });
  if (includeInactive) params.set("include_inactive", "true");

  return mappingGet(`/reference/search?${params.toString()}`);
}

function scheduleReferenceSearch(delayMs = 250) {
  if (referenceSearchTimer) clearTimeout(referenceSearchTimer);
  referenceSearchTimer = setTimeout(() => {
    runReferenceSearch();
  }, delayMs);
}

async function runReferenceSearch() {
  const cacheEntry = state.cache.get(REFERENCE_VIEW_ID);
  if (!cacheEntry?.data) return;

  const data = cacheEntry.data;
  const query = String(data.query || "").trim();
  const selected = selectedReferenceSources(data.sources);

  if (!query) {
    data.results = [];
    data.resultCount = 0;
    data.sourceErrors = {};
    data.searched = false;
    data.searching = false;
    data.error = null;
    if (state.activeViewId === REFERENCE_VIEW_ID) renderActiveView();
    return;
  }

  if (!selected.length) {
    data.results = [];
    data.resultCount = 0;
    data.sourceErrors = {};
    data.searched = true;
    data.searching = false;
    data.error = "Select at least one source.";
    if (state.activeViewId === REFERENCE_VIEW_ID) renderActiveView();
    return;
  }

  const requestId = ++referenceSearchRequestId;
  data.searching = true;
  data.error = null;
  if (state.activeViewId === REFERENCE_VIEW_ID) renderActiveView();

  try {
    const response = await fetchReferenceSearch({
      query: data.query,
      sources: data.sources,
      includeInactive: data.includeInactive,
    });
    if (requestId !== referenceSearchRequestId) return;

    data.results = rowsFrom(response?.results);
    data.resultCount = Number(response?.result_count ?? data.results.length);
    data.sourceErrors = response?.source_errors && typeof response.source_errors === "object"
      ? response.source_errors
      : {};
    data.searched = true;
    data.searching = false;
    data.error = null;
  } catch (error) {
    if (requestId !== referenceSearchRequestId) return;
    data.results = [];
    data.resultCount = 0;
    data.sourceErrors = {};
    data.searched = true;
    data.searching = false;
    data.error = error?.message || String(error);
  }

  if (state.activeViewId === REFERENCE_VIEW_ID) renderActiveView();
}

function createReferenceView() {
  return {
    id: REFERENCE_VIEW_ID,
    label: "Reference Maps",
    section: "Views",
    endpoint: "/api/mapping/reference/search",
    load: async () => {
      const data = createReferenceBaseData();
      const query = String(data.query || "").trim();
      if (!query) return data;

      data.searching = true;
      try {
        const response = await fetchReferenceSearch({
          query: data.query,
          sources: data.sources,
          includeInactive: data.includeInactive,
        });
        data.results = rowsFrom(response?.results);
        data.resultCount = Number(response?.result_count ?? data.results.length);
        data.sourceErrors = response?.source_errors && typeof response.source_errors === "object"
          ? response.source_errors
          : {};
        data.searched = true;
        data.searching = false;
      } catch (error) {
        data.results = [];
        data.resultCount = 0;
        data.sourceErrors = {};
        data.searched = true;
        data.searching = false;
        data.error = error?.message || String(error);
      }
      return data;
    },
    render: (data) => {
      const query = String(data?.query || "");
      const includeInactive = Boolean(data?.includeInactive);
      const sources = normalizeReferenceSources(data?.sources);
      const selectedSources = selectedReferenceSources(sources);
      const searching = Boolean(data?.searching);
      const searched = Boolean(data?.searched);
      const error = data?.error || null;
      const sourceErrors = data?.sourceErrors && typeof data.sourceErrors === "object"
        ? Object.entries(data.sourceErrors)
        : [];
      const results = Array.isArray(data?.results) ? data.results : [];
      const resultCount = Number.isFinite(Number(data?.resultCount))
        ? Number(data.resultCount)
        : results.length;
      const trimmedQuery = query.trim();

      const sourceButtons = REFERENCE_SOURCES.map((source) => `
        <button
          type="button"
          class="finra-filter-btn${sources[source] ? " is-active" : ""}"
          data-reference-source="${source}"
          aria-pressed="${sources[source] ? "true" : "false"}"
        >${REFERENCE_SOURCE_LABELS[source]}</button>
      `).join("");

      // Normalize match scores relative to the top result (top = 100%)
      // so the user sees relative relevance rather than raw weighted sums.
      const maxScore = results.reduce((m, r) => Math.max(m, Number(r?.score ?? 0)), 0);
      const hasScores = maxScore > 0;

      const resultRows = results.map((row) => {
        const source = String(row?.source || "").toLowerCase();
        const sourceLabel = REFERENCE_SOURCE_LABELS[source] || String(source || "unknown").toUpperCase();
        const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
        const name = row?.name ?? raw.name ?? raw.Name ?? raw.person ?? raw.contact;
        const firm = row?.firm ?? raw.firm ?? raw.current_firm ?? raw.Firm ?? raw.company;
        const title = row?.title ?? raw.title ?? raw.current_title ?? raw.Title ?? raw.role;
        const location = row?.location ?? raw.location ?? raw.current_location ?? raw.Location ?? raw.city;
        const recordId = row?.record_id || raw.id || "";
        const rawScore = Number(row?.score ?? 0);
        const matchPct = hasScores && maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : null;

        return `
          <tr>
            <td>
              <span class="reference-source-chip reference-source-chip--${escapeHtml(source || "unknown")}">${escapeHtml(sourceLabel)}</span>
            </td>
            <td>${escapeHtml(toText(name || "—"))}</td>
            <td>${escapeHtml(toText(firm || "—"))}</td>
            <td>${escapeHtml(toText(title || "—"))}</td>
            <td>${escapeHtml(toText(location || "—"))}</td>
            <td class="reference-match-pct">${matchPct !== null ? `${matchPct}%` : "—"}</td>
          </tr>
        `;
      }).join("");

      const statusText = searching
        ? "Searching..."
        : (searched
          ? `${resultCount.toLocaleString()} results`
          : "Type a name, firm, title, or strategy to search.");

      return `
        <div class="reference-shell">
          <div class="reference-controls">
            <input
              type="text"
              class="finra-search-input reference-search-input"
              data-reference-query
              value="${escapeHtml(query)}"
              placeholder="Search HF, IR, Commodities, and Equities maps..."
              autocomplete="off"
              spellcheck="false"
            />
            <div class="reference-filter-row">
              <div class="finra-filter-group">
                ${sourceButtons}
              </div>
              <div class="finra-filter-group">
                <button
                  type="button"
                  class="finra-filter-btn${includeInactive ? " is-active" : ""}"
                  data-reference-include-inactive="true"
                  aria-pressed="${includeInactive ? "true" : "false"}"
                >Include Inactive</button>
                <button type="button" class="finra-filter-btn" data-reference-clear="true">Clear</button>
              </div>
            </div>
            <div class="reference-status-line">
              <span>${escapeHtml(statusText)}</span>
              <span>${escapeHtml(selectedSources.join(", ").toUpperCase())}</span>
            </div>
          </div>

          ${sourceErrors.length ? `
            <div class="reference-warnings">
              ${sourceErrors.map(([source, message]) => `
                <div class="reference-warning-item">
                  <strong>${escapeHtml(REFERENCE_SOURCE_LABELS[source] || source)}:</strong>
                  ${escapeHtml(String(message || "Unavailable"))}
                </div>
              `).join("")}
            </div>
          ` : ""}

          ${error ? `<div class="error"><strong>Reference search failed.</strong><br>${escapeHtml(error)}</div>` : ""}

          ${!trimmedQuery && !searching ? `
            <div class="empty">Type to search across the mapping datasets.</div>
          ` : ""}

          ${trimmedQuery && searching ? `
            <div class="loading">Searching for "${escapeHtml(trimmedQuery)}"…</div>
          ` : ""}

          ${trimmedQuery && !searching && !results.length && !error ? `
            <div class="empty">No matches found for "${escapeHtml(trimmedQuery)}".</div>
          ` : ""}

          ${results.length ? `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Name</th>
                    <th>Firm</th>
                    <th>Title</th>
                    <th>Location</th>
                    <th class="reference-match-pct-header">Match</th>
                  </tr>
                </thead>
                <tbody>${resultRows}</tbody>
              </table>
            </div>
          ` : ""}
        </div>
      `;
    },
  };
}

function createPipelineView() {
  return {
    id: "pipeline.table",
    label: "Pipeline",
    section: "Views",
    endpoint: "/api/ops/pipeline",
    load: async () => {
      const response = await pipelineGet("/pipeline");
      return {
        rows: rowsFrom(response)
          .map((row) => normalizePipelineRow(row))
          .filter((row) => !["soft_deleted", "shadow_deleted"].includes(String(row.status || "").toLowerCase())),
      };
    },
    render: (data) => {
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      if (!rows.length) {
        return `<div class="empty">No pipeline rows returned.</div>`;
      }

      return `
        <div class="table-wrap">
          <table class="data-table pipeline-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Firm</th>
                <th>Status</th>
                <th>Type</th>
                <th>Campaign</th>
                <th>Last Action</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map((row, index) => {
                  const rowKey = pipelineRowKey(row, index);
                  const expanded = state.pipeline.expandedRowKey === rowKey;
                  return `
                    <tr class="pipeline-candidate-row" data-pipeline-row-key="${escapeHtml(rowKey)}">
                      <td>
                        <div class="pipeline-row-toggle">
                          <span class="mandates-chevron">${expanded ? "▾" : "▸"}</span>
                          <span>${escapeHtml(toText(row.person))}</span>
                        </div>
                      </td>
                      <td>${escapeHtml(toText(row.firm))}</td>
                      <td>${escapeHtml(toText(row.status))}</td>
                      <td>${escapeHtml(toText(row.contact_type))}</td>
                      <td>${escapeHtml(toText(row.campaign))}</td>
                      <td>${escapeHtml(formatDate(row.last_action_date))}</td>
                      <td>${escapeHtml(toText(row.days_since))}</td>
                    </tr>
                    ${expanded ? `
                      <tr>
                        <td colspan="7">
                          <div class="pipeline-notes-panel">
                            <div class="pipeline-notes-header">Notes</div>
                            ${renderPipelineNotes(row.notes)}
                          </div>
                        </td>
                      </tr>
                    ` : ""}
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    },
  };
}

function createMandatesView() {
  return {
    id: "mandates.table",
    label: "Mandates",
    section: "Views",
    endpoint: "/api/ops/mandates + mandate-candidate fallback routes",
    load: async () => {
      const mandatesResponse = await mandatesGet("/mandates");
      const mandates = rowsFrom(mandatesResponse).map(normalizeMandateRow);

      let candidates = [];
      let candidatesMode = "bulk";
      try {
        candidates = await loadMandateCandidatesBulk();
      } catch (error) {
        // Some ops deployments do not expose a bulk candidates route.
        if (isOps404Error(error)) {
          candidatesMode = "per_mandate";
        } else {
          candidatesMode = "per_mandate";
          console.warn("[mandates] bulk candidates fetch failed, switching to per-mandate mode:", error?.message || error);
        }
      }

      if (candidatesMode === "bulk") {
        state.mandates.candidatesByMandate = {};
      }

      return { mandates, candidates, candidatesMode };
    },
    render: (data) => {
      const mandates = Array.isArray(data?.mandates) ? data.mandates : [];
      const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
      const candidatesMode = data?.candidatesMode || "bulk";

      if (!mandates.length) {
        return `<div class="empty">No mandates rows returned.</div>`;
      }

      const grouped = new Map();
      mandates
        .slice()
        .sort((a, b) => {
          const byClient = (a.client_firm_name || "").localeCompare(b.client_firm_name || "");
          if (byClient !== 0) return byClient;
          const aRoot = isMandateSweepRoot(a) ? 1 : 0;
          const bRoot = isMandateSweepRoot(b) ? 1 : 0;
          if (aRoot !== bRoot) return bRoot - aRoot;
          return (a.mandate_name || "").localeCompare(b.mandate_name || "");
        })
        .forEach((row) => {
          const key = row.client_firm_name || "Unknown Client";
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(row);
        });

      const candidatesByMandateId = new Map();
      candidates.forEach((row) => {
        if (!row.mandate_id) return;
        const key = String(row.mandate_id);
        if (!candidatesByMandateId.has(key)) candidatesByMandateId.set(key, []);
        candidatesByMandateId.get(key).push(row);
      });
      const perMandateCache = state.mandates.candidatesByMandate || {};

      const clientGroups = [...grouped.entries()].map(([clientKey, clientMandates]) => {
        const clientExpanded = Boolean(state.mandates.expandedClients?.[clientKey]);
        const clientCandidateTotal = clientMandates.reduce((sum, row) => sum + Number(row.total_candidates || 0), 0);

        const mandatesTable = clientExpanded ? `
          <div class="mandates-client-body">
            <div class="table-wrap">
              <table class="data-table mandates-table">
                <thead>
                  <tr>
                    <th>Mandate</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Owner</th>
                    <th>Candidates</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  ${clientMandates.map((row, idx) => {
                    const rowKey = `${clientKey}::${row.mandate_id || row.mandate_name}`;
                    const expanded = state.mandates.expandedMandateKey === rowKey;
                    const mandateId = row.mandate_id ? String(row.mandate_id) : "";
                    const linkedCandidates = mandateId
                      ? (candidatesByMandateId.get(mandateId) || [])
                      : [];
                    const mandateCache = mandateId ? perMandateCache[mandateId] : null;
                    const mandateRows = Array.isArray(mandateCache?.rows)
                      ? mandateCache.rows
                      : (candidatesMode === "bulk" ? linkedCandidates : []);
                    const candidatesCount = Array.isArray(mandateCache?.rows)
                      ? mandateCache.rows.length
                      : (candidatesMode === "bulk" ? linkedCandidates.length : Number(row.total_candidates ?? 0));

                    return `
                      <tr>
                        <td>
                          <button class="mandate-row-toggle" data-mandate-row-key="${escapeHtml(rowKey)}" data-mandate-id="${escapeHtml(mandateId)}" type="button">
                            <span class="mandates-chevron">${expanded ? "▾" : "▸"}</span>
                            <span>${escapeHtml(row.mandate_name || "Untitled Mandate")}</span>
                            ${mandateRoleLabel(row) ? `<span class="alias-tag">${escapeHtml(mandateRoleLabel(row))}</span>` : ""}
                          </button>
                        </td>
                        <td><span class="mandates-status-pill mandates-status-pill--${mandateStatusTone(row.status)}">${escapeHtml(toText(row.status))}</span></td>
                        <td>${escapeHtml(toText(row.priority))}</td>
                        <td>${escapeHtml(toText(row.owner_name))}</td>
                        <td>${escapeHtml(String(candidatesCount))}</td>
                        <td>${escapeHtml(formatDate(row.updated_at))}</td>
                      </tr>
                      ${expanded ? `
                        <tr>
                          <td colspan="6">
                            <div class="mandates-candidates-panel">
                              <div class="mandates-candidates-header">Candidates (${candidatesCount})</div>
                              ${!row.mandate_id ? `<div class="mandates-inline-msg">This mandate has no mandate ID, so strict ID matching cannot attach candidates.</div>` : ""}
                              ${row.mandate_id ? `
                                ${mandateCache?.loading ? `<div class="mandates-inline-msg">Loading candidates…</div>` : ""}
                                ${mandateCache?.error ? `<div class="mandates-inline-msg">Candidate feed error: ${escapeHtml(mandateCache.error)}</div>` : ""}
                                ${mandateRows.length ? `
                                  <div class="table-wrap">
                                    <table class="data-table mandates-candidates-table">
                                      <thead>
                                        <tr>
                                          <th>Candidate</th>
                                          <th>Firm</th>
                                          <th>Stage / Status</th>
                                          <th>Pipeline ID</th>
                                          <th>Vault ID</th>
                                          <th>Updated</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        ${mandateRows
                                          .slice()
                                          .sort(compareMandateCandidates)
                                          .map((candidate) => `
                                            <tr>
                                              <td>${escapeHtml(toText(candidate.candidate_name))}</td>
                                              <td>${escapeHtml(toText(candidate.firm_name))}</td>
                                              <td>${candidate.candidate_db_id
                                                ? `<select class="mandate-stage-select mandate-stage-select--${candidateStatusTone(candidate.stage_status)}"
                                                     data-mandate-candidate-stage
                                                     data-candidate-db-id="${escapeHtml(candidate.candidate_db_id)}"
                                                     data-mandate-id="${escapeHtml(String(mandateId))}">${MANDATE_CANDIDATE_STATUSES.map((s) =>
                                                       `<option value="${escapeHtml(s)}"${candidate.stage_status === s ? " selected" : ""}>${escapeHtml(s)}</option>`
                                                     ).join("")}</select>`
                                                : `<span class="mandates-status-pill mandates-status-pill--${candidateStatusTone(candidate.stage_status)}">${escapeHtml(toText(candidate.stage_status))}</span>`
                                              }</td>
                                              <td>${escapeHtml(toText(candidate.pipeline_id))}</td>
                                              <td>${escapeHtml(toText(candidate.vault_id))}</td>
                                              <td>${escapeHtml(formatDate(candidate.updated_at))}</td>
                                            </tr>
                                          `).join("")}
                                      </tbody>
                                    </table>
                                  </div>
                                ` : `${!mandateCache?.loading && !mandateCache?.error ? `<div class="mandates-inline-msg">No candidates linked to this mandate.</div>` : ""}`}
                              ` : ""}
                            </div>
                          </td>
                        </tr>
                      ` : ""}
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        ` : "";

        return `
          <section class="mandates-client-group">
            <button class="mandates-client-toggle" data-mandates-client-key="${escapeHtml(clientKey)}" type="button">
              <span class="mandates-chevron">${clientExpanded ? "▾" : "▸"}</span>
              <span class="mandates-client-name">${escapeHtml(clientKey)}</span>
              <span class="mandates-client-meta">${clientMandates.length} mandates · ${clientCandidateTotal} candidates</span>
            </button>
            ${mandatesTable}
          </section>
        `;
      }).join("");

      return `<div class="mandates-client-groups">${clientGroups}</div>`;
    },
  };
}

const MANDATE_CANDIDATE_BULK_PATHS = [
  "/mandate-candidates?limit=5000",
  "/mandates/candidates?limit=5000",
  "/mandate_candidates?limit=5000",
  "/mandates-candidates?limit=5000",
];

async function loadMandateCandidatesBulk() {
  let lastError = null;
  for (const path of MANDATE_CANDIDATE_BULK_PATHS) {
    try {
      const response = await mandatesGet(path);
      return rowsFrom(response).map((row) => normalizeMandateCandidateRow(row));
    } catch (error) {
      lastError = error;
      if (isOps404Error(error)) continue;
      throw error;
    }
  }
  throw lastError || new Error("No bulk mandate-candidates route available.");
}

async function loadMandateCandidatesForMandate(mandateId) {
  const encoded = encodeURIComponent(String(mandateId));
  const paths = [
    `/mandates/${encoded}/candidates?limit=5000`,
    `/mandate-candidates/${encoded}?limit=5000`,
    `/mandate_candidates/${encoded}?limit=5000`,
    `/mandate-candidates?mandate_id=${encoded}&limit=5000`,
    `/mandates/candidates?mandate_id=${encoded}&limit=5000`,
  ];

  let lastError = null;
  for (const path of paths) {
    try {
      const response = await mandatesGet(path);
      return rowsFrom(response).map((row) => normalizeMandateCandidateRow(row, String(mandateId)));
    } catch (error) {
      lastError = error;
      if (isOps404Error(error)) continue;
      throw error;
    }
  }

  // Fallback: /mandates/{id} often includes a full candidates array.
  try {
    const detail = await mandatesGet(`/mandates/${encoded}`);
    const candidateRows = rowsFrom(detail?.candidates || detail?.rows || detail);
    if (Array.isArray(candidateRows) && candidateRows.length) {
      return candidateRows.map((row) => normalizeMandateCandidateRow(row, String(mandateId)));
    }
  } catch (error) {
    lastError = error;
  }

  throw lastError || new Error("No per-mandate candidates route available.");
}

function getMandateCandidateRef(mandateId, candidateDbId) {
  const perCache = state.mandates.candidatesByMandate;
  if (Array.isArray(perCache[mandateId]?.rows)) {
    const rows = perCache[mandateId].rows;
    const idx = rows.findIndex((c) => c.candidate_db_id === candidateDbId);
    if (idx !== -1) return { rows, idx };
  }
  const cacheEntry = state.cache.get("mandates.table");
  if (Array.isArray(cacheEntry?.data?.candidates)) {
    const rows = cacheEntry.data.candidates;
    const idx = rows.findIndex((c) => c.candidate_db_id === candidateDbId);
    if (idx !== -1) return { rows, idx };
  }
  return null;
}

function ensureMandateCandidatesForMandate(mandateId) {
  if (!mandateId) return;
  const key = String(mandateId);
  if (!state.mandates.candidatesByMandate) state.mandates.candidatesByMandate = {};

  const existing = state.mandates.candidatesByMandate[key];
  if (existing?.loading) return;
  if (Array.isArray(existing?.rows)) return;
  if (existing?.error) return;

  state.mandates.candidatesByMandate[key] = { loading: true, rows: null, error: null };
  renderActiveView();

  (async () => {
    try {
      const rows = await loadMandateCandidatesForMandate(key);
      state.mandates.candidatesByMandate[key] = { loading: false, rows, error: null };
    } catch (error) {
      const message = isOps404Error(error)
        ? "Candidate endpoint unavailable on this ops API."
        : (error?.message || "Could not load candidates for this mandate.");
      state.mandates.candidatesByMandate[key] = {
        loading: false,
        rows: [],
        error: message,
      };
    }
    renderActiveView();
  })();
}

function isOps404Error(error) {
  const msg = String(error?.message || "");
  return /Ops API 404/i.test(msg);
}

function createPlatformView() {
  const checks = [
    { label: "Core Firms", call: () => bankstGet("/firms") },
    { label: "Pipeline", call: () => pipelineGet("/pipeline") },
    { label: "Mandates", call: () => mandatesGet("/mandates") },
    { label: "Client Requests", call: () => clientRequestsGet("/client-requests") },
    { label: "Research Tasks", call: () => researchTasksGet("/research-tasks") },
    { label: "Follow-ups", call: () => pipelineGet("/pipeline/follow-ups") },
    { label: "Reference API", call: () => mappingGet("/reference/search?q=test&limit_per_source=1") },
    { label: "HF Map DB", call: () => mappingGet("/hf/records?limit=1") },
    { label: "IR Map DB", call: () => mappingGet("/ir/records?limit=1") },
    { label: "Commodities Map DB", call: () => mappingGet("/commodities/records?limit=1") },
    { label: "Equities Map DB", call: () => mappingGet("/equities/records?limit=1") },
    { label: "FINRA", call: () => finraGet("/summary") },
    { label: "BBG API (Read-Only)", call: () => mappingGet("/bbg/health") },
  ];

  return {
    id: "platform.overview",
    label: "Platform",
    section: "Views",
    endpoint: "multi-endpoint health",
    load: async () => {
      const settled = await Promise.allSettled(checks.map((item) => item.call()));
      return checks.map((item, index) => {
        const result = settled[index];
        if (result.status === "fulfilled") {
          return {
            label: item.label,
            status: "ok",
            value: metricValue(result.value),
            detail: "Connected",
          };
        }
        return {
          label: item.label,
          status: "fail",
          value: "Error",
          detail: result.reason?.message || "Request failed",
        };
      });
    },
    render: (items) => {
      const cards = Array.isArray(items) ? items : [];
      return `
        <div class="cards">
          ${cards
            .map((item) => {
              const valueClass = item.status === "ok" ? "status-ok" : "status-fail";
              return `
                <article class="card">
                  <h3>${escapeHtml(item.label)}</h3>
                  <p class="${valueClass}">${escapeHtml(toText(item.value))}</p>
                  <div class="view-meta">${escapeHtml(toText(item.detail))}</div>
                </article>
              `;
            })
            .join("")}
        </div>
      `;
    },
  };
}

function createBbgWorkspaceBaseData() {
  return {
    health: null,
    coverage: [],
    firmView: null,
    selectedRunId: null,
    selectedRun: null,
    selectedRunRows: null,
    selectedRunLoading: false,
    selectedRunError: null,
    errors: [],
  };
}

async function fetchBbgWorkspaceBase() {
  const data = createBbgWorkspaceBaseData();
  const [healthResult, coverageResult] = await Promise.allSettled([
    mappingGet("/bbg/health"),
    mappingGet("/bbg/coverage"),
  ]);
  if (healthResult.status === "fulfilled") data.health = healthResult.value;
  else data.errors.push(`health: ${healthResult.reason?.message || String(healthResult.reason)}`);
  if (coverageResult.status === "fulfilled") data.coverage = Array.isArray(coverageResult.value) ? coverageResult.value : [];
  else data.errors.push(`coverage: ${coverageResult.reason?.message || String(coverageResult.reason)}`);
  return data;
}

function bbgSetCacheData(nextData) {
  const cache = state.cache.get(BBG_VIEW_ID);
  if (!cache) return;
  cache.data = nextData;
  cache.loadedAt = Date.now();
  renderActiveView();
}

async function bbgSelectRun(runId) {
  if (!Number.isFinite(runId) || runId <= 0) return;
  const cache = state.cache.get(BBG_VIEW_ID);
  if (!cache?.data) return;
  const data = cache.data;
  if (data.selectedRunId === runId && data.selectedRun && data.selectedRunRows) return;

  data.selectedRunId = runId;
  data.selectedRunLoading = true;
  data.selectedRunError = null;
  bbgSetCacheData(data);

  try {
    const [run, rows] = await Promise.all([
      mappingGet(`/bbg/runs/${runId}`),
      mappingGet(`/bbg/runs/${runId}/rows`),
    ]);
    data.selectedRun = run;
    data.selectedRunRows = rows;
    data.selectedRunLoading = false;
  } catch (error) {
    data.selectedRunLoading = false;
    data.selectedRunError = error?.message || String(error);
  }
  bbgSetCacheData(data);
}

async function bbgSelectFirm(firmId) {
  if (!firmId) return;
  const cache = state.cache.get(BBG_VIEW_ID);
  if (!cache?.data) return;
  const data = cache.data;

  const firmMeta = data.coverage.find((f) => f.firm_id === firmId) || { firm_id: firmId, canonical_name: firmId, alias_count: 0 };
  data.firmView = { firmId, canonical: firmMeta.canonical_name, aliasCount: firmMeta.alias_count || 0, runs: [], latestBundle: null, loading: true, error: null };
  data.selectedRunId = null;
  data.selectedRun = null;
  data.selectedRunRows = null;
  data.selectedRunLoading = false;
  data.selectedRunError = null;
  state.bbg.selectedFirmId = firmId;
  bbgSetCacheData(data);

  try {
    const [runs, latestBundle] = await Promise.all([
      mappingGet(`/bbg/firms/${encodeURIComponent(firmId)}/runs`),
      firmMeta.latest_run_id
        ? mappingGet(`/bbg/firms/${encodeURIComponent(firmId)}/latest`).catch(() => null)
        : Promise.resolve(null),
    ]);
    data.firmView.runs = Array.isArray(runs) ? runs : [];
    data.firmView.latestBundle = latestBundle;
    data.firmView.loading = false;
    if (latestBundle) {
      data.selectedRunId = latestBundle.run_id;
      data.selectedRun = latestBundle;
      data.selectedRunRows = {
        confirmed: latestBundle.confirmed || [],
        discrepancies: latestBundle.discrepancies || [],
        additions: latestBundle.additions || [],
      };
    }
  } catch (err) {
    data.firmView.loading = false;
    data.firmView.error = err?.message || String(err);
  }
  bbgSetCacheData(data);
}

function bbgClearFirmView() {
  const cache = state.cache.get(BBG_VIEW_ID);
  if (!cache?.data) return;
  const data = cache.data;
  data.firmView = null;
  data.selectedRunId = null;
  data.selectedRun = null;
  data.selectedRunRows = null;
  state.bbg.selectedFirmId = null;
  bbgSetCacheData(data);
}

function bbgTimeAgo(isoStr) {
  if (!isoStr) return "—";
  const days = Math.floor((Date.now() - new Date(isoStr).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function bbgCaptureChip(firm) {
  if (firm.never_captured) return `<span class="alias-tag" style="font-size:11px;opacity:0.6;">NOT YET</span>`;
  const days = Math.floor((Date.now() - new Date(firm.last_run_at).getTime()) / 86400000);
  if (days > 30) return `<span class="alias-tag alias-tag--blacklist" style="font-size:11px;">STALE</span>`;
  return `<span class="alias-tag alias-tag--pipeline-placed" style="font-size:11px;">CAPTURED</span>`;
}

function bbgTrackPct(pct) {
  if (pct === null || pct === undefined) return "—";
  const color = pct >= 80 ? "var(--status-ok)" : pct >= 60 ? "#e6a817" : "var(--status-fail)";
  return `<span style="color:${color};font-weight:600;">${pct}%</span>`;
}

function bbgRenderFirmView(d) {
  const fv = d.firmView;
  const runs = Array.isArray(fv.runs) ? fv.runs : [];
  const lb = fv.latestBundle;
  const confirmed   = lb?.confirmed_count    ?? 0;
  const disc        = lb?.discrepancy_count  ?? 0;
  const additions   = lb?.addition_count     ?? 0;
  const total       = confirmed + disc + additions;
  const trackPct    = total > 0 ? Math.round((confirmed / total) * 100) : null;
  const lastRunAt   = runs[0]?.ingested_at || runs[0]?.run_at || null;

  const runRows = runs.map((r) => {
    const active = Number(r.run_id) === Number(d.selectedRunId) ? ` style="background:var(--surface-muted);"` : "";
    return `<tr data-bbg-run-id="${escapeHtml(String(r.run_id))}" style="cursor:pointer;"${active}>
      <td>#${escapeHtml(String(r.run_id))}</td>
      <td>${escapeHtml(toText(r.csv_filename || r.source_path))}</td>
      <td>${escapeHtml(bbgTimeAgo(r.ingested_at || r.run_at))}</td>
      <td>${escapeHtml(String(r.rows_processed ?? "—"))}</td>
      <td>${escapeHtml(String(r.confirmed_count ?? "—"))}</td>
      <td>${escapeHtml(String(r.discrepancy_count ?? "—"))}</td>
      <td>${escapeHtml(String(r.addition_count ?? "—"))}</td>
      <td>${escapeHtml(toText(r.run_status))}</td>
    </tr>`;
  }).join("");

  const detailRows = d.selectedRunRows || (lb ? { confirmed: lb.confirmed, discrepancies: lb.discrepancies, additions: lb.additions } : null);
  const detailRunId = d.selectedRunId ?? lb?.run_id ?? null;

  return `
    <div class="finra-controls" style="margin-top:4px;">
      <button class="finra-filter-btn" data-bbg-firm-back="true">← All Firms</button>
      <span class="finra-results-count">
        <strong>${escapeHtml(fv.canonical)}</strong>
        <code style="font-size:11px;color:var(--text-faint);margin-left:8px;">${escapeHtml(fv.firmId)}</code>
        <span style="color:var(--text-faint);margin-left:8px;">${escapeHtml(String(fv.aliasCount))} aliases in refs.db</span>
      </span>
    </div>

    ${fv.loading ? `<div class="loading" style="margin-top:12px;">Loading…</div>` : ""}
    ${fv.error ? `<div class="error" style="margin-top:8px;">${escapeHtml(fv.error)}</div>` : ""}

    ${!fv.loading ? `
      <div class="cards" style="margin-top:12px;">
        <article class="card"><h3>Runs</h3><p>${escapeHtml(String(runs.length))}</p></article>
        <article class="card"><h3>Last Captured</h3><p style="font-size:13px;">${escapeHtml(bbgTimeAgo(lastRunAt))}</p></article>
        <article class="card"><h3>Confirmed</h3><p>${escapeHtml(String(confirmed))}</p></article>
        <article class="card"><h3>Discrepancies</h3><p>${escapeHtml(String(disc))}</p></article>
        <article class="card"><h3>Additions</h3><p>${escapeHtml(String(additions))}</p></article>
        <article class="card"><h3>Track%</h3><p>${trackPct !== null ? bbgTrackPct(trackPct) : "—"}</p></article>
      </div>

      <div class="table-wrap" style="margin-top:12px;">
        <table class="data-table">
          <thead>
            <tr><th colspan="8">Run History — click a row to view detail</th></tr>
            <tr><th>#</th><th>Source File</th><th>Captured</th><th>Rows</th><th>Confirmed</th><th>Disc</th><th>Additions</th><th>Status</th></tr>
          </thead>
          <tbody>${runRows || `<tr><td colspan="8" style="color:var(--text-faint);">No runs yet for this firm.</td></tr>`}</tbody>
        </table>
      </div>

      ${d.selectedRunLoading ? `<div class="loading" style="margin-top:12px;">Loading run detail…</div>` : ""}
      ${d.selectedRunError ? `<div class="error" style="margin-top:8px;">${escapeHtml(d.selectedRunError)}</div>` : ""}
      ${detailRows && !d.selectedRunLoading ? `
        <div style="margin-top:12px;">
          <div class="view-meta">Run #${escapeHtml(String(detailRunId))} detail</div>
          ${renderBbgRowTables(detailRows)}
        </div>
      ` : ""}
    ` : ""}
  `;
}

function renderBbgRowTables(rows) {
  const confirmed = rowsFrom(rows?.confirmed);
  const discrepancies = rowsFrom(rows?.discrepancies);
  const additions = rowsFrom(rows?.additions);

  const section = (title, content) => `
    <section class="table-wrap" style="margin-top:10px;">
      <div style="padding:8px 10px;font-size:12px;font-weight:600;border-bottom:1px solid var(--table-border);">${title}</div>
      ${content}
    </section>
  `;

  const confirmedTable = confirmed.length
    ? `<table class="data-table"><thead><tr><th>Name</th><th>Firm</th><th>Title</th><th>Location</th><th>BBG Title</th><th>BBG Location</th><th>BBG Focus</th></tr></thead><tbody>${
      confirmed.map((r) => `<tr><td>${escapeHtml(toText(r.name))}</td><td>${escapeHtml(toText(r.firm))}</td><td>${escapeHtml(toText(r.title))}</td><td>${escapeHtml(toText(r.location))}</td><td>${escapeHtml(toText(r.bbg_title))}</td><td>${escapeHtml(toText(r.bbg_location))}</td><td>${escapeHtml(toText(r.bbg_focus))}</td></tr>`).join("")
    }</tbody></table>`
    : `<div class="empty">No confirmed observations in this run.</div>`;

  const discrepanciesTable = discrepancies.length
    ? `<table class="data-table"><thead><tr><th>Name</th><th>Field</th><th>BBG Value</th><th>Master Value</th><th>Status</th></tr></thead><tbody>${
      discrepancies.map((r) => `<tr><td>${escapeHtml(toText(r.name))}</td><td>${escapeHtml(toText(r.discrepancy_field))}</td><td>${escapeHtml(toText(r.new_file_value))}</td><td>${escapeHtml(toText(r.master_file_values))}</td><td>${escapeHtml(toText(r.status))}</td></tr>`).join("")
    }</tbody></table>`
    : `<div class="empty">No discrepancies in this run.</div>`;

  const additionsTable = additions.length
    ? `<table class="data-table"><thead><tr><th>Name</th><th>Company</th><th>Canonical</th><th>Title</th><th>Location</th><th>Focus</th></tr></thead><tbody>${
      additions.map((r) => `<tr><td>${escapeHtml(toText(r.name))}</td><td>${escapeHtml(toText(r.company))}</td><td>${escapeHtml(toText(r.canonical_company))}</td><td>${escapeHtml(toText(r.title))}</td><td>${escapeHtml(toText(r.location))}</td><td>${escapeHtml(toText(r.focus))}</td></tr>`).join("")
    }</tbody></table>`
    : `<div class="empty">No additions in this run.</div>`;

  return `${section("Confirmed Observations", confirmedTable)}${section("Discrepancies", discrepanciesTable)}${section("Additions", additionsTable)}`;
}

function createBbgWorkspaceView() {
  return {
    id: BBG_VIEW_ID,
    label: "BBG Reference",
    section: "Monitors",
    endpoint: "/api/bbg/coverage",
    load: async () => fetchBbgWorkspaceBase(),
    render: (data) => {
      const d = data || createBbgWorkspaceBaseData();

      if (d.firmView !== null) {
        return bbgRenderFirmView(d);
      }

      // Global coverage view
      const health = d.health || {};
      const stale = Boolean(health.stale_data_warning);
      const coverage = Array.isArray(d.coverage) ? d.coverage : [];
      const capturedCount = coverage.filter((f) => !f.never_captured).length;
      const pendingUnresolved = health.pending_unresolved_count || 0;

      const coverageRows = coverage.map((f) => `
        <tr style="cursor:pointer;" data-bbg-firm-select="${escapeHtml(f.firm_id)}">
          <td>${escapeHtml(toText(f.canonical_name))}</td>
          <td><code style="font-size:11px;color:var(--text-faint);">${escapeHtml(f.firm_id)}</code></td>
          <td>${bbgCaptureChip(f)}</td>
          <td>${escapeHtml(f.never_captured ? "—" : bbgTimeAgo(f.last_run_at))}</td>
          <td style="text-align:right;">${escapeHtml(String(f.run_count))}</td>
          <td style="text-align:right;">${escapeHtml(f.never_captured ? "—" : String(f.confirmed_count ?? "—"))}</td>
          <td style="text-align:right;">${escapeHtml(f.never_captured ? "—" : String(f.discrepancy_count ?? "—"))}</td>
          <td style="text-align:right;">${escapeHtml(f.never_captured ? "—" : String(f.addition_count ?? "—"))}</td>
          <td style="text-align:right;">${f.never_captured ? "—" : bbgTrackPct(f.tracking_pct)}</td>
          <td style="text-align:right;color:var(--text-faint);">${escapeHtml(String(f.alias_count))}</td>
        </tr>
      `).join("");

      return `
        <div class="finra-controls" style="margin-top:4px;">
          <button class="finra-filter-btn is-active" data-bbg-refresh="true">Refresh</button>
          <span class="finra-results-count">
            ${capturedCount} of ${coverage.length} firms captured ·
            ${stale
              ? `<span class="status-fail">data stale</span>`
              : `<span class="status-ok">fresh</span>`}
            ${pendingUnresolved > 0
              ? ` · <span class="alias-tag alias-tag--blacklist" style="font-size:11px;">${pendingUnresolved} unresolved</span>`
              : ""}
          </span>
        </div>

        ${d.errors?.length ? `<div class="error" style="margin-top:8px;"><strong>Warnings:</strong> ${escapeHtml(d.errors.join(" | "))}</div>` : ""}

        <div class="table-wrap" style="margin-top:12px;">
          <table class="data-table">
            <thead>
              <tr><th colspan="10">BBG Capture Coverage — ${escapeHtml(String(coverage.length))} firms in refs.db (click row to drill in)</th></tr>
              <tr>
                <th>Firm</th>
                <th>ID</th>
                <th>Status</th>
                <th>Last Captured</th>
                <th style="text-align:right;">Runs</th>
                <th style="text-align:right;">Confirmed</th>
                <th style="text-align:right;">Disc</th>
                <th style="text-align:right;">Additions</th>
                <th style="text-align:right;">Track%</th>
                <th style="text-align:right;">Aliases</th>
              </tr>
            </thead>
            <tbody>
              ${coverageRows || `<tr><td colspan="10" style="color:var(--text-faint);">No firms in refs.db.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    },
  };
}


function normalizePipelineRow(row) {
  return {
    row_id: row?.pipeline_id || row?.id || row?.person_id || row?.candidate_id || "",
    person: row?.person || row?.name || "",
    firm: row?.firm || row?.firm_name || "",
    status: row?.status || "",
    contact_type: row?.contact_type || row?.type || "",
    campaign: row?.context || row?.campaign || "",
    last_action_date: row?.last_action_date || row?.updated_at || "",
    days_since: row?.days_since,
    notes: row?.notes ?? row?.note ?? row?.latest_note ?? row?.comments ?? "",
  };
}

function pipelineRowKey(row, index) {
  const identity = String(row?.row_id || "").trim();
  if (identity) return identity;
  return `${String(row?.person || "").trim()}::${String(row?.firm || "").trim()}::${index}`;
}

function pipelineNotesEntries(value) {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry) => toText(entry))
      .map((entry) => entry.trim())
      .filter((entry) => entry && entry !== "-");
  }

  if (typeof value === "object") {
    if (Array.isArray(value.notes)) return pipelineNotesEntries(value.notes);
    const serialized = JSON.stringify(value);
    return serialized ? [serialized] : [];
  }

  const raw = String(value).trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function renderPipelineNotes(value) {
  const entries = pipelineNotesEntries(value);
  if (!entries.length) {
    return `<div class="pipeline-notes-empty">No notes recorded for this candidate.</div>`;
  }

  return `
    <div class="pipeline-notes-list">
      ${entries.map((entry) => `<div class="pipeline-note-item">${escapeHtml(entry)}</div>`).join("")}
    </div>
  `;
}

function normalizeMandateRow(row) {
  return {
    mandate_id: row?.mandate_id || row?.id || row?.mandateId || "",
    mandate_name: row?.mandate_name || row?.name || row?.title || "Untitled Mandate",
    client_firm_name: row?.client_firm_name || row?.client_firm || row?.client || row?.firm || "Unknown Client",
    status: String(row?.status || "active").toLowerCase(),
    priority: row?.priority || "",
    owner_name: row?.owner_name || row?.owner || "—",
    total_candidates: Number(row?.total_candidates ?? row?.candidate_count ?? row?.candidates ?? 0),
    updated_at: row?.updated_at || row?.last_updated || row?.updated || "",
    rollup_mandate_id: row?.rollup_mandate_id ?? null,
  };
}

const MANDATE_SWEEP_ROOTS = new Map([
  ["point72 asset management", "Point72"],
  ["schonfeld strategic advisors", "Schonfeld"],
]);

function normalizedMandateName(value) {
  return String(value || "").trim().toLowerCase();
}

function isMandateSweepRoot(row) {
  const firm = normalizedMandateName(row?.client_firm_name);
  const expectedRoot = MANDATE_SWEEP_ROOTS.get(firm);
  if (!expectedRoot) return false;
  return normalizedMandateName(row?.mandate_name) === normalizedMandateName(expectedRoot);
}

function mandateSweepLabel(clientFirmName) {
  const firm = normalizedMandateName(clientFirmName);
  const shortName = MANDATE_SWEEP_ROOTS.get(firm);
  return shortName ? `${shortName} (All)` : "Firm (All)";
}

function mandateRoleLabel(row) {
  return isMandateSweepRoot(row) ? mandateSweepLabel(row?.client_firm_name) : "";
}

function normalizeMandateCandidateRow(row, fallbackMandateId = "") {
  return {
    candidate_db_id: row?.id ? String(row.id) : "",
    mandate_id: row?.mandate_id || row?.mandateId || fallbackMandateId || "",
    candidate_name: row?.imported_candidate_name || row?.candidate_name || row?.person || row?.name || "—",
    firm_name: row?.imported_firm || row?.firm_name || row?.current_firm || row?.firm || "—",
    stage_status: row?.candidate_stage || row?.stage || row?.status || "—",
    pipeline_id: row?.pipeline_id || row?.pipeline_person_id || row?.pipeline || "—",
    vault_id: row?.vault_id || row?.vault_current_firm || "—",
    updated_at: row?.updated_at || row?.last_updated || row?.created_at || "",
  };
}

function mandateStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active" || value === "open" || value === "in_progress") return "active";
  if (value === "on_hold" || value === "paused") return "paused";
  if (value === "closed" || value === "completed" || value === "filled") return "closed";
  return "neutral";
}

function candidateStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("submitted") || value.includes("interview") || value.includes("process")) return "active";
  if (value.includes("hold") || value.includes("paused")) return "paused";
  if (value.includes("reject") || value.includes("closed") || value.includes("declined")) return "closed";
  return "neutral";
}

const CANDIDATE_STATUS_RANKS = buildCandidateStatusRanks();

function buildCandidateStatusRanks() {
  const ranks = new Map();
  CANDIDATE_STATUS_SORT_RULES.forEach((rule, index) => {
    const aliases = [rule?.key, ...(Array.isArray(rule?.aliases) ? rule.aliases : [])];
    aliases.forEach((alias) => {
      const normalized = normalizeStatusKey(alias);
      if (normalized && !ranks.has(normalized)) ranks.set(normalized, index);
    });
  });
  return ranks;
}

function normalizeStatusKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function candidateStatusRank(status) {
  const normalized = normalizeStatusKey(status);
  if (!normalized) return Number.MAX_SAFE_INTEGER;

  const direct = CANDIDATE_STATUS_RANKS.get(normalized);
  if (typeof direct === "number") return direct;

  if (normalized.includes("offer") && normalized.includes("extended")) {
    return CANDIDATE_STATUS_RANKS.get("offer extended") ?? Number.MAX_SAFE_INTEGER;
  }
  if (normalized.includes("process")) {
    return CANDIDATE_STATUS_RANKS.get("in process") ?? Number.MAX_SAFE_INTEGER;
  }
  if (normalized.includes("declin") || normalized.includes("reject")) {
    return CANDIDATE_STATUS_RANKS.get("declined") ?? Number.MAX_SAFE_INTEGER;
  }

  return Number.MAX_SAFE_INTEGER;
}

function timestampOrZero(value) {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const stamp = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isFinite(stamp) ? stamp : 0;
}

function compareMandateCandidates(a, b) {
  const rankDelta = candidateStatusRank(a?.stage_status) - candidateStatusRank(b?.stage_status);
  if (rankDelta !== 0) return rankDelta;

  const timeDelta = timestampOrZero(b?.updated_at) - timestampOrZero(a?.updated_at);
  if (timeDelta !== 0) return timeDelta;

  return String(a?.candidate_name || "").localeCompare(String(b?.candidate_name || ""));
}

function rowsFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function metricValue(data) {
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data?.rows)) return data.rows.length;
  if (Array.isArray(data?.items)) return data.items.length;
  if (typeof data?.total === "number") return data.total;
  return "ok";
}

function pickFirstValue(row, keys) {
  if (!row || !Array.isArray(keys)) return null;

  for (const key of keys) {
    const value = row[key];

    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function toText(value) {
  if (value === null || value === undefined || value === "") return "-";

  if (Array.isArray(value)) {
    if (!value.length) return "-";
    return value.map((entry) => (typeof entry === "object" ? JSON.stringify(entry) : String(entry))).join(", ");
  }

  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toText(value);

  return date.toLocaleDateString();
}

function formatInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return toText(value);
  return String(Math.round(number));
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return toText(value);
  return `${number.toFixed(1)}%`;
}

function renderSimpleTable(columns, rows, emptyText) {
  if (!rows.length) {
    return `<div class="empty">${escapeHtml(emptyText || "No rows returned.")}</div>`;
  }

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const cells = columns
                .map((column) => {
                  const raw = typeof column.get === "function"
                    ? column.get(row)
                    : pickFirstValue(row, column.keys || []);
                  const formatted = column.format ? column.format(raw, row) : toText(raw);
                  return `<td>${escapeHtml(toText(formatted))}</td>`;
                })
                .join("");

              return `<tr>${cells}</tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
