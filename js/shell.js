// ── Shell Controller ───────────────────────────────────────────────────────────
// Manages global layout state: rail toggles, zen mode, persistence

const shell = document.querySelector(".app-shell");

const RAIL_MIN = 160;
const RAIL_MAX = 480;
const RAIL_WIDTH_KEY = "shell.leftRailWidth";

function setRailWidth(px) {
  const clamped = Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, px)));
  document.documentElement.style.setProperty("--left-rail-w", `${clamped}px`);
  document.documentElement.style.setProperty("--left-rail-base-w", `${clamped}px`);
  localStorage.setItem(RAIL_WIDTH_KEY, String(clamped));
}

function initRailWidth() {
  const saved = localStorage.getItem(RAIL_WIDTH_KEY);
  if (saved) setRailWidth(Number(saved));
}

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
  initRailWidth();
  setLeftRailState(savedLeft);
  shell.dataset.rightRail = shellState.rightRail;
  initRailResizeDrag();
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

function initRailResizeDrag() {
  const handle = document.getElementById("railResizeHandle");
  if (!handle) return;

  handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (shell.getAttribute("data-left-rail") === "closed") return;

    e.preventDefault();

    const startX = e.clientX;
    const startW = document.querySelector(".left-rail").getBoundingClientRect().width;

    handle.classList.add("is-dragging");
    shell.classList.add("is-resizing-rail");

    const onMove = (e) => setRailWidth(startW + (e.clientX - startX));

    const onUp = () => {
      handle.classList.remove("is-dragging");
      shell.classList.remove("is-resizing-rail");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}
