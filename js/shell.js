// ── Shell Controller ───────────────────────────────────────────────────────────
// Manages global layout state: rail toggles, zen mode, zoom, persistence

const shell = document.querySelector(".app-shell");
const ZOOM_STEP = 0.1;
const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 2.0;
const ZOOM_KEY  = "shell.zoomLevel";

export const shellState = {
  leftRail:  localStorage.getItem("shell.leftRail")  || "open",
  rightRail: localStorage.getItem("shell.rightRail") || "open",
  zenMode:   false,
  zoomLevel: parseFloat(localStorage.getItem(ZOOM_KEY) || "1"),
};

function applyZoom(level) {
  shellState.zoomLevel = level;
  document.documentElement.style.setProperty("--zoom-level", level);
  localStorage.setItem(ZOOM_KEY, level);

  // Dim nav items slightly when zoomed out — the data is the focus
  const opacity = level < 1 ? 0.55 + (level * 0.45) : 1;
  document.querySelectorAll(".nav-item, .saved-item, .rail-label, .rail-group-header")
    .forEach(el => { el.style.opacity = opacity; });
}

export function zoomIn()    { applyZoom(Math.min(shellState.zoomLevel + ZOOM_STEP, ZOOM_MAX)); }
export function zoomOut()   { applyZoom(Math.max(shellState.zoomLevel - ZOOM_STEP, ZOOM_MIN)); }
export function resetZoom() { applyZoom(1); }

export function initShell() {
  // Restore persisted rail state
  shell.dataset.leftRail  = shellState.leftRail;
  shell.dataset.rightRail = shellState.rightRail;
  // Restore persisted zoom
  applyZoom(shellState.zoomLevel);
}

export function toggleLeftRail() {
  shellState.leftRail = shellState.leftRail === "open" ? "closed" : "open";
  shell.dataset.leftRail = shellState.leftRail;
  localStorage.setItem("shell.leftRail", shellState.leftRail);
}

export function toggleRightRail() {
  shellState.rightRail = shellState.rightRail === "open" ? "closed" : "open";
  shell.dataset.rightRail = shellState.rightRail;
  localStorage.setItem("shell.rightRail", shellState.rightRail);
}

export function toggleZenMode() {
  shellState.zenMode = !shellState.zenMode;
  if (shellState.zenMode) {
    shell.dataset.leftRail  = "closed";
    shell.dataset.rightRail = "closed";
  } else {
    shell.dataset.leftRail  = shellState.leftRail;
    shell.dataset.rightRail = shellState.rightRail;
  }
}
