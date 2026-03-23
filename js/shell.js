// ── Shell Controller ───────────────────────────────────────────────────────────
// Manages global layout state: rail toggles, zen mode, persistence

const shell = document.querySelector(".app-shell");

const RAIL_MIN = 160;
const RAIL_MAX = 480;
const RAIL_WIDTH_KEY = "shell.leftRailWidth";

const CONTEXT_MIN = 200;
const CONTEXT_MAX = 540;
const CONTEXT_WIDTH_KEY = "shell.rightRailWidth";

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

function setContextWidth(px) {
  const clamped = Math.round(Math.min(CONTEXT_MAX, Math.max(CONTEXT_MIN, px)));
  document.documentElement.style.setProperty("--right-rail-w", `${clamped}px`);
  document.documentElement.style.setProperty("--right-rail-base-w", `${clamped}px`);
  localStorage.setItem(CONTEXT_WIDTH_KEY, String(clamped));
}

function initContextWidth() {
  const saved = localStorage.getItem(CONTEXT_WIDTH_KEY);
  if (saved) setContextWidth(Number(saved));
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
  initContextWidth();
  setLeftRailState(savedLeft);
  shell.dataset.rightRail = shellState.rightRail;
  initRailResizeDrag();
  initContextResizeDrag();
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

function initContextResizeDrag() {
  const handle = document.getElementById("rightRailResizeHandle");
  if (!handle) return;

  handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (shell.getAttribute("data-right-rail") === "closed") return;
    if (document.querySelector(".workspace-shell")?.classList.contains("is-context-hidden")) return;

    e.preventDefault();

    const startX = e.clientX;
    const startW = document.querySelector(".right-rail").getBoundingClientRect().width;

    handle.classList.add("is-dragging");
    shell.classList.add("is-resizing-right-rail");

    // Drag left = wider (delta inverted vs. left rail)
    const onMove = (e) => setContextWidth(startW - (e.clientX - startX));

    const onUp = () => {
      handle.classList.remove("is-dragging");
      shell.classList.remove("is-resizing-right-rail");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}
