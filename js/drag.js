import { reorderTabsInPane } from "./workspace.js";

// Track whether a tab drag is in progress so dragover can branch correctly
let isDraggingTab  = false;
let rafPending     = false; // requestAnimationFrame throttle for dragover

// Returns the tab-wrap element that the dragged tab should be inserted BEFORE,
// or null if it should go at the end. Uses midpoint heuristic per Chrome spec.
function getDragAfterElement(tabbar, x) {
  const tabs = [...tabbar.querySelectorAll(".tab-wrap:not(.is-dragging)")];
  return tabs.reduce((closest, tab) => {
    const box    = tab.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: tab };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

export function initDragHandlers() {
  const workspace = document.querySelector(".workspace");
  if (!workspace) return;

  // ── Tab drag: start ──────────────────────────────────────────────────────────
  workspace.addEventListener("dragstart", (e) => {
    const tabWrap = e.target.closest(".tab-wrap[data-tab-id]");
    if (!tabWrap) return;

    isDraggingTab = true;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/bankst-tab-id", tabWrap.dataset.tabId);

    const tabbar = tabWrap.closest(".tabbar");
    if (tabbar) tabbar.classList.add("is-reordering");

    // Delay opacity so the browser captures the ghost BEFORE we hide the element
    requestAnimationFrame(() => tabWrap.classList.add("is-dragging"));
  });

  // ── Tab drag ─────────────────────────────────────────────────────────────────
  workspace.addEventListener("dragover", (e) => {
    if (isDraggingTab) {
      const targetTabWrap = e.target.closest(".tab-wrap[data-tab-id]");
      if (!targetTabWrap) return;
      e.preventDefault();

      if (rafPending) return; // throttle to one DOM move per frame
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const tabbar  = targetTabWrap.closest(".tabbar");
        if (!tabbar) return;
        const dragging = tabbar.querySelector(".tab-wrap.is-dragging");
        if (!dragging) return;
        const after = getDragAfterElement(tabbar, e.clientX);
        if (after === null) {
          tabbar.appendChild(dragging);
        } else {
          tabbar.insertBefore(dragging, after);
        }
      });
      return;
    }
  });

  // ── File hover: leave ───────────────────────────────────────────────────────
  workspace.addEventListener("dragleave", (e) => {
    if (isDraggingTab) return;
    const pane = e.target.closest(".pane");
    if (pane && !pane.contains(e.relatedTarget)) {
      pane.classList.remove("bbg-file-drop");
    }
  });

  // ── Tab drag: end — sync DOM order back to state ─────────────────────────────
  workspace.addEventListener("dragend", (e) => {
    const tabWrap = e.target.closest(".tab-wrap[data-tab-id]");
    if (tabWrap) {
      tabWrap.classList.remove("is-dragging");
      const tabbar = tabWrap.closest(".tabbar");
      const pane   = tabWrap.closest(".pane");
      if (tabbar && pane) {
        tabbar.classList.remove("is-reordering");
        const orderedIds = [...tabbar.querySelectorAll(".tab-wrap[data-tab-id]")]
          .map((el) => el.dataset.tabId);
        reorderTabsInPane(pane.dataset.paneId, orderedIds);
      }
    }
    isDraggingTab = false;
    rafPending    = false;
  });

  // ── Drop ─────────────────────────────────────────────────────────────────────
  workspace.addEventListener("drop", (e) => {
    // Tab drops are handled entirely via DOM manipulation in dragover/dragend
    if (isDraggingTab) { isDraggingTab = false; return; }

    const pane = e.target.closest(".pane");
    if (pane) pane.classList.remove("bbg-file-drop");
  });
}
