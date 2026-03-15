import { clamp, metaHTML } from "./utils.js";
import { entityData } from "./mock-data.js";

// ── Navigation handler injection (breaks cards ↔ nav cycle) ──────────────────
let _openPersonTab = () => {};
let _openFirmTab   = () => {};

export function setNavHandlers({ openPersonTab, openFirmTab }) {
  _openPersonTab = openPersonTab;
  _openFirmTab   = openFirmTab;
}

// ── State ──────────────────────────────────────────────────────────────────────
let nextZ      = 1200;
let nextOffset = 0;
export const openCards = new Map();

const cardLayer = document.getElementById("cardLayer");

// ── Card focus / close ─────────────────────────────────────────────────────────
export function focusCard(cardEl) {
  if (!cardEl) return;
  cardEl.style.zIndex = String(++nextZ);
}

export function closeCard(cardId) {
  const cardEl = openCards.get(cardId);
  if (!cardEl) return;
  cardEl.remove();
  openCards.delete(cardId);
}

export function closeTopCard() {
  const topCard = [...openCards.values()]
    .sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex))
    .pop();
  if (topCard) closeCard(topCard.dataset.cardId);
}

// ── Card lookup ────────────────────────────────────────────────────────────────
export function findExistingCard(entityType, entityId) {
  for (const [, cardEl] of openCards.entries()) {
    if (cardEl.dataset.entityType === entityType && cardEl.dataset.entityId === entityId) {
      return cardEl;
    }
  }
  return null;
}

// ── Drag support ───────────────────────────────────────────────────────────────
export function makeDraggable(cardEl, handleEl) {
  let dragging = false;
  let offsetX  = 0;
  let offsetY  = 0;

  const onPointerMove = (e) => {
    if (!dragging) return;
    const rect    = cardEl.getBoundingClientRect();
    const maxLeft = window.innerWidth  - rect.width  - 12;
    const maxTop  = window.innerHeight - rect.height - 12;
    cardEl.style.left = `${clamp(e.clientX - offsetX, 12, maxLeft)}px`;
    cardEl.style.top  = `${clamp(e.clientY - offsetY, 12, maxTop)}px`;
  };

  const stopDragging = () => {
    if (!dragging) return;
    dragging = false;
    cardEl.classList.remove("is-dragging");
    window.removeEventListener("pointermove",   onPointerMove);
    window.removeEventListener("pointerup",     stopDragging);
    window.removeEventListener("pointercancel", stopDragging);
  };

  handleEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    dragging = true;
    cardEl.classList.add("is-dragging");
    focusCard(cardEl);
    const rect = cardEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    window.addEventListener("pointermove",   onPointerMove);
    window.addEventListener("pointerup",     stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    e.preventDefault();
  });
}

// ── Create & open ──────────────────────────────────────────────────────────────
export function createCard(entity) {
  const cardId = `card-${crypto.randomUUID()}`;
  const step   = 28;
  const x = Math.min(680 + nextOffset * step, window.innerWidth  - 620);
  const y = Math.min(140 + nextOffset * step, window.innerHeight - 420);
  nextOffset = (nextOffset + 1) % 6;

  const cardEl = document.createElement("article");
  cardEl.className          = "floating-card";
  cardEl.dataset.cardId     = cardId;
  cardEl.dataset.entityType = entity.entityType;
  cardEl.dataset.entityId   = entity.entityId;
  cardEl.style.left   = `${Math.max(12, x)}px`;
  cardEl.style.top    = `${Math.max(12, y)}px`;
  cardEl.style.zIndex = String(++nextZ);
  cardEl.setAttribute("aria-label", `${entity.title} quick card`);

  cardEl.innerHTML = `
    <div class="floating-card-header" data-drag-handle>
      <div>
        <div class="floating-card-title">${entity.title}</div>
        <div class="floating-card-subtitle">${entity.subtitle}</div>
      </div>
      <div class="window-actions">
        <button class="window-action" data-close-card aria-label="Close">×</button>
      </div>
    </div>
    <div class="floating-card-body">
      <div class="meta-grid">${metaHTML(entity.meta)}</div>
      <div class="floating-section">
        <div class="floating-section-title">Notes</div>
        <p class="floating-copy">${entity.notes}</p>
      </div>
      <div class="floating-section">
        <div class="floating-section-title">Quick Actions</div>
        <div class="action-row">
          <button class="toolbar-button" data-open-full-profile="${entity.entityId}">Open Full Profile</button>
          <button class="toolbar-button">Edit</button>
          <button class="toolbar-button">Add Note</button>
          <button class="toolbar-button">Log Interaction</button>
        </div>
      </div>
    </div>
  `;

  const handleEl       = cardEl.querySelector("[data-drag-handle]");
  const closeBtn       = cardEl.querySelector("[data-close-card]");
  const fullProfileBtn = cardEl.querySelector("[data-open-full-profile]");

  cardEl.addEventListener("pointerdown", () => focusCard(cardEl));
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeCard(cardId); });
  fullProfileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (entity.entityType === "person") _openPersonTab(entity.entityId);
    else _openFirmTab(entity.entityId);
  });

  makeDraggable(cardEl, handleEl);
  cardLayer.appendChild(cardEl);
  openCards.set(cardId, cardEl);
  return cardEl;
}

export function openCard(entityKey) {
  const entity = entityData[entityKey];
  if (!entity) return;
  const existing = findExistingCard(entity.entityType, entity.entityId);
  if (existing) { focusCard(existing); return; }
  createCard(entity);
}
