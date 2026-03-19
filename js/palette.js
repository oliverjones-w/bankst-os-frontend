import { entityData, commandData } from "./mock-data.js";
import { getFirmsIndex } from "./api.js";
import { openCard } from "./cards.js";
import { openPersonTab, openFirmTab, openFirmCard, runCommand } from "./nav.js";
import { escapeHtml } from "./utils.js";

// ── DOM refs ───────────────────────────────────────────────────────────────────
const palette   = document.getElementById("commandPalette");
const input     = document.getElementById("commandInput");
const resultsEl = document.getElementById("commandResults");
const prefixEl  = document.querySelector(".command-prefix");

// ── State ──────────────────────────────────────────────────────────────────────
let paletteItems = [];
let currentQuery  = "";

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
  palette.classList.remove("has-results");
  palette?.removeAttribute("data-mode");
  if (prefixEl) prefixEl.textContent = ">";
  input.value = "";
  if (resultsEl) resultsEl.innerHTML = "";
  paletteItems = [];
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

  // Word-boundary bonus: "bnp" scores higher against "BNP Paribas" than against
  // a string where "bnp" only appears mid-word
  const words = t.split(/[\s·,/()-]+/);
  if (words.some((w) => w.startsWith(q))) return 70;

  // Weighted subsequence: extra points for matches at word boundaries
  let score = 0;
  let qi    = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      score += 10;
      if (i === 0 || /[\s·,/()-]/.test(t[i - 1])) score += 15;
    }
  }
  return qi === q.length ? score : 0;
}

// ── Match highlighting ─────────────────────────────────────────────────────────
// Highlights subsequence characters from query in text, returns safe HTML.
function highlightMatch(text, query) {
  const q = query.trim().toLowerCase();
  if (!q) return escapeHtml(text);

  let result = "";
  let ti = 0;
  let qi = 0;
  while (ti < text.length) {
    if (qi < q.length && text[ti].toLowerCase() === q[qi]) {
      result += `<mark>${escapeHtml(text[ti])}</mark>`;
      qi++;
    } else {
      result += escapeHtml(text[ti]);
    }
    ti++;
  }
  // If the full query wasn't matched, return plain escaped text
  return qi === q.length ? result : escapeHtml(text);
}

// ── Build results ──────────────────────────────────────────────────────────────
function buildPaletteResults(query, commandsOnly = false) {
  currentQuery = query;

  let entityItems      = [];
  let dedupedFirmItems = [];

  if (!commandsOnly) {
    entityItems = Object.entries(entityData)
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

    const mockFirmNames = new Set(
      Object.values(entityData)
        .filter(e => e.entityType === "firm")
        .map(e => e.title.toLowerCase())
    );
    dedupedFirmItems = firmItems.filter(f => !mockFirmNames.has(f.title.toLowerCase()));
  }

  const commandItems = commandData
    .map((cmd) => ({
      kind:     "command",
      key:      cmd.id,
      group:    "Commands",
      title:    cmd.title,
      shortcut: cmd.shortcut,
      subtitle: cmd.subtitle,
      score:    Math.max(scoreMatch(query, cmd.title), scoreMatch(query, cmd.subtitle)),
    }))
    .filter((item) => item.score > 0);

  // Zero-state discovery: cap commands at 5 when / is typed with no query
  const cap = commandsOnly && !query.trim() ? 5 : 20;

  paletteItems = [...entityItems, ...dedupedFirmItems, ...commandItems]
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
  palette?.classList.toggle("has-results", paletteItems.length > 0);
  requestAnimationFrame(() => renderPaletteResults());
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
            class="command-result"
            data-palette-index="${item.index}"
            type="button"
          >
            <span>${highlightMatch(item.title, currentQuery)}</span>
            <span class="command-result-meta">${escapeHtml(item.shortcut || item.subtitle)}</span>
          </button>
        `).join("")}
      </div>
    `)
    .join("");

  // Select the first result
  const first = resultsEl.querySelector(".command-result");
  first?.classList.add("is-selected");
}

// ── Activate ───────────────────────────────────────────────────────────────────
function activatePaletteItem(index, useCard = false) {
  const item = paletteItems[index];
  if (!item) return;

  if (item.kind === "entity") {
    if (useCard) openCard(item.key);
    else {
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

function activateSelected(useCard = false) {
  const selected = resultsEl?.querySelector(".command-result.is-selected");
  if (!selected) return;
  activatePaletteItem(Number(selected.dataset.paletteIndex), useCard);
}

// ── Event listeners ────────────────────────────────────────────────────────────
input?.addEventListener("input", () => {
  const val = input.value;
  if (val.startsWith("/")) {
    palette?.setAttribute("data-mode", "command");
    if (prefixEl) prefixEl.textContent = "/";
    buildPaletteResults(val.slice(1), true);
  } else {
    palette?.removeAttribute("data-mode");
    if (prefixEl) prefixEl.textContent = ">";
    buildPaletteResults(val);
  }
});

resultsEl?.addEventListener("click", (e) => {
  const row = e.target.closest(".command-result[data-palette-index]");
  if (!row) return;
  activatePaletteItem(Number(row.dataset.paletteIndex), e.ctrlKey);
});

resultsEl?.addEventListener("pointermove", (e) => {
  const row = e.target.closest(".command-result");
  if (!row || row.classList.contains("is-selected")) return;
  resultsEl.querySelectorAll(".command-result.is-selected")
    .forEach(el => el.classList.remove("is-selected"));
  row.classList.add("is-selected");
});

export function handlePaletteKeydown(e) {
  if (!paletteIsOpen()) return false;

  const results = Array.from(resultsEl?.querySelectorAll(".command-result") ?? []);
  const currentIndex = results.findIndex(el => el.classList.contains("is-selected"));

  if (e.key === "ArrowDown") {
    e.preventDefault();
    results[currentIndex]?.classList.remove("is-selected");
    const next = results[currentIndex + 1] ?? results[0];
    next?.classList.add("is-selected");
    next?.scrollIntoView({ block: "nearest" });
    return true;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    results[currentIndex]?.classList.remove("is-selected");
    const prev = results[currentIndex - 1] ?? results[results.length - 1];
    prev?.classList.add("is-selected");
    prev?.scrollIntoView({ block: "nearest" });
    return true;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    activateSelected(e.ctrlKey);
    return true;
  }
  return false;
}
