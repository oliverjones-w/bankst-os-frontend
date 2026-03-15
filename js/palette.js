import { entityData, commandData } from "./mock-data.js";
import { getFirmsIndex } from "./api.js";
import { openCard } from "./cards.js";
import { openPersonTab, openFirmTab, openFirmCard, runCommand } from "./nav.js";

// ── DOM refs ───────────────────────────────────────────────────────────────────
const palette   = document.getElementById("commandPalette");
const input     = document.getElementById("commandInput");
const resultsEl = document.getElementById("commandResults");

// ── State ──────────────────────────────────────────────────────────────────────
let paletteItems        = [];
let activePaletteIndex  = 0;

// ── Open / close ───────────────────────────────────────────────────────────────
export function paletteIsOpen() {
  return !palette?.classList.contains("is-hidden");
}

export function openPalette() {
  palette.classList.remove("is-hidden");
  input.value = "";
  buildPaletteResults("");
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

export function closePalette() {
  palette.classList.add("is-hidden");
  input.value = "";
  if (resultsEl) resultsEl.innerHTML = "";
  paletteItems       = [];
  activePaletteIndex = 0;
}

export function togglePalette() {
  paletteIsOpen() ? closePalette() : openPalette();
}

// ── Scoring ────────────────────────────────────────────────────────────────────
function scoreMatch(query, text) {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;

  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 40 : 0;
}

// ── Build results ──────────────────────────────────────────────────────────────
function buildPaletteResults(query) {
  const entityItems = Object.entries(entityData)
    .map(([key, entity]) => ({
      kind:     "entity",
      key,
      group:    entity.entityType === "person" ? "People" : "Firms",
      title:    entity.title,
      subtitle: entity.entityType === "person" ? "Person" : "Firm",
      score:    Math.max(scoreMatch(query, entity.title), scoreMatch(query, entity.subtitle)),
    }))
    .filter((item) => item.score > 0);

  const firmItems = getFirmsIndex()
    .map(f => ({
      kind:     "firm",
      key:      f.key,
      name:     f.name,
      group:    "Firms",
      title:    f.name,
      subtitle: f.firm_key || "Firm",
      score:    Math.max(scoreMatch(query, f.name), scoreMatch(query, f.firm_key)),
    }))
    .filter(item => item.score > 0);

  const commandItems = commandData
    .map((cmd) => ({
      kind:     "command",
      key:      cmd.id,
      group:    "Commands",
      title:    cmd.title,
      subtitle: cmd.subtitle,
      score:    Math.max(scoreMatch(query, cmd.title), scoreMatch(query, cmd.subtitle)),
    }))
    .filter((item) => item.score > 0);

  // Deduplicate firm results vs mock entity firms
  const mockFirmNames = new Set(
    Object.values(entityData)
      .filter(e => e.entityType === "firm")
      .map(e => e.title.toLowerCase())
  );
  const dedupedFirmItems = firmItems.filter(f => !mockFirmNames.has(f.title.toLowerCase()));

  paletteItems       = [...entityItems, ...dedupedFirmItems, ...commandItems].sort((a, b) => b.score - a.score);
  activePaletteIndex = 0;
  renderPaletteResults();
}

// ── Render ─────────────────────────────────────────────────────────────────────
function renderPaletteResults() {
  if (!resultsEl) return;

  if (!paletteItems.length) {
    resultsEl.innerHTML = `
      <div class="command-group">
        <div class="command-group-label">Results</div>
        <div class="command-result">
          <span>No matches found</span>
          <span class="command-result-meta">—</span>
        </div>
      </div>
    `;
    return;
  }

  const groups = {};
  paletteItems.forEach((item, index) => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push({ ...item, index });
  });

  resultsEl.innerHTML = Object.entries(groups)
    .map(([groupName, items]) => `
      <div class="command-group">
        <div class="command-group-label">${groupName}</div>
        ${items.map((item) => `
          <button
            class="command-result ${item.index === activePaletteIndex ? "is-active" : ""}"
            data-palette-index="${item.index}"
            type="button"
          >
            <span>${item.title}</span>
            <span class="command-result-meta">${item.subtitle}</span>
          </button>
        `).join("")}
      </div>
    `)
    .join("");

  requestAnimationFrame(() => {
    const activeEl = resultsEl.querySelector(`[data-palette-index="${activePaletteIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  });
}

// ── Activate ───────────────────────────────────────────────────────────────────
function activatePaletteItem(index, useCard = false) {
  const item = paletteItems[index];
  if (!item) return;

  if (item.kind === "entity") {
    if (useCard) {
      openCard(item.key);
    } else {
      const entity = entityData[item.key];
      if (entity?.entityType === "person") openPersonTab(item.key);
      else openFirmTab(item.key);
    }
    closePalette();
    return;
  }

  if (item.kind === "firm") {
    if (useCard) openFirmCard(item.key, item.name);
    else openFirmTab(item.key, item.name);
    closePalette();
    return;
  }

  if (item.kind === "command") {
    runCommand(item.key);
    closePalette();
  }
}

// ── Event listeners ────────────────────────────────────────────────────────────
input?.addEventListener("input", () => {
  buildPaletteResults(input.value);
});

resultsEl?.addEventListener("click", (e) => {
  const row = e.target.closest("[data-palette-index]");
  if (!row) return;
  activatePaletteItem(Number(row.dataset.paletteIndex), e.ctrlKey);
});

resultsEl?.addEventListener("pointermove", (e) => {
  const row = e.target.closest("[data-palette-index]");
  if (!row) return;
  const index = Number(row.dataset.paletteIndex);
  if (Number.isNaN(index) || index === activePaletteIndex) return;
  activePaletteIndex = index;
  renderPaletteResults();
});

export function handlePaletteKeydown(e) {
  if (!paletteIsOpen()) return false;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activePaletteIndex = Math.min(activePaletteIndex + 1, paletteItems.length - 1);
    renderPaletteResults();
    return true;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    activePaletteIndex = Math.max(activePaletteIndex - 1, 0);
    renderPaletteResults();
    return true;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    activatePaletteItem(activePaletteIndex, e.ctrlKey);
    return true;
  }
  return false;
}
