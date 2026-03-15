// ── Shell Controller ───────────────────────────────────────────────────────────
// Manages global layout state: rail toggles, zen mode, persistence

const shell = document.querySelector(".app-shell");

export const shellState = {
  rightRail: localStorage.getItem("shell.rightRail") || "open",
  zenMode:   false,
};

export function setLeftRailState(state) {
  const btn = document.getElementById("leftRailToggle");
  shell.setAttribute("data-left-rail", state);
  btn?.setAttribute("aria-expanded", String(state === "open"));
  localStorage.setItem("shell.leftRail", state);
}

export function initShellState() {
  const savedLeft  = localStorage.getItem("shell.leftRail") || "open";
  setLeftRailState(savedLeft);
  shell.dataset.rightRail = shellState.rightRail;
}

export function toggleLeftRail() {
  const isOpen = shell.getAttribute("data-left-rail") !== "closed";
  setLeftRailState(isOpen ? "closed" : "open");
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
    initShellState();
  }
}
