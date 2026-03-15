import { splitPane, moveTab } from "./workspace.js";

let draggedTabId = null;
let sourcePaneId = null;

export function initTabDragHandlers() {
  const workspace = document.querySelector(".workspace");
  if (!workspace) return;

  workspace.addEventListener("dragstart", (e) => {
    const tabWrap = e.target.closest(".tab-wrap[data-tab-id]");
    if (!tabWrap) return;
    draggedTabId = tabWrap.dataset.tabId;
    sourcePaneId = tabWrap.dataset.paneId;
    e.dataTransfer.effectAllowed = "move";
    tabWrap.classList.add("is-dragging");

    // Custom drag ghost — translucent SF Mono card
    const label = tabWrap.querySelector(".tab")?.textContent?.trim() || draggedTabId;
    const ghost = document.createElement("div");
    ghost.textContent = label;
    Object.assign(ghost.style, {
      position:   "absolute",
      top:        "-1000px",
      left:       "-1000px",
      padding:    "4px 10px",
      background: "var(--background-secondary)",
      border:     "1px solid var(--interactive-accent)",
      borderRadius: "3px",
      fontFamily: "var(--font-data, monospace)",
      fontSize:   "12px",
      color:      "var(--text-normal)",
      opacity:    "0.9",
      whiteSpace: "nowrap",
      pointerEvents: "none",
    });
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    setTimeout(() => ghost.remove(), 0);
  });

  workspace.addEventListener("dragend", (e) => {
    const tabWrap = e.target.closest(".tab-wrap");
    if (tabWrap) tabWrap.classList.remove("is-dragging");
    // Clean up any lingering drop indicators
    workspace.querySelectorAll(".drop-target, .drop-target-right").forEach((el) => {
      el.classList.remove("drop-target", "drop-target-right");
    });
    draggedTabId = null;
    sourcePaneId = null;
  });

  workspace.addEventListener("dragover", (e) => {
    e.preventDefault();
    const pane = e.target.closest(".pane");
    if (!pane) return;

    const rect = pane.getBoundingClientRect();
    const isRightEdge = e.clientX > rect.right - 80;

    pane.classList.toggle("drop-target",       !isRightEdge);
    pane.classList.toggle("drop-target-right",  isRightEdge);
  });

  workspace.addEventListener("dragleave", (e) => {
    const pane = e.target.closest(".pane");
    // Only clear if leaving the pane entirely (not moving to a child)
    if (pane && !pane.contains(e.relatedTarget)) {
      pane.classList.remove("drop-target", "drop-target-right");
    }
  });

  workspace.addEventListener("drop", (e) => {
    e.preventDefault();
    const targetPane = e.target.closest(".pane");
    if (!targetPane || !draggedTabId) return;

    targetPane.classList.remove("drop-target", "drop-target-right");

    const targetPaneId = targetPane.dataset.paneId;
    const rect         = targetPane.getBoundingClientRect();
    const isRightEdge  = e.clientX > rect.right - 80;

    if (isRightEdge) {
      splitPane(draggedTabId);
    } else if (sourcePaneId !== targetPaneId) {
      moveTab(draggedTabId, sourcePaneId, targetPaneId);
    }
  });
}
