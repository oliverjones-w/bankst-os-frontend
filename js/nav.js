import { entityData } from "./mock-data.js";
import { openTab } from "./workspace.js";
import { createCard, findExistingCard, focusCard } from "./cards.js";
import { bankstGet, recordView } from "./api.js";

export function openPersonTab(entityId) {
  const entity = entityData[entityId];
  if (!entity) return;
  recordView(entityId, "person", entity.title || entityId);
  openTab({
    id:         `tab-person-${entityId}`,
    type:       "person.detail",
    entityType: "person",
    entityId,
    title:      entity.title,
    state:      { mode: "profile" },
  });
}

export function openFirmTab(entityId, firmName) {
  const entity = entityData[entityId];
  const label  = entity?.title || firmName || "Firm";
  recordView(entityId, "firm", label);
  openTab({
    id:         `tab-firm-${entityId}`,
    type:       "firm.detail",
    entityType: "firm",
    entityId,
    title:      label,
    state:      { mode: "profile" },
  });
}

export async function openFirmCard(firmId, firmName) {
  const existing = findExistingCard("firm", firmId);
  if (existing) { focusCard(existing); return; }
  try {
    const data = await bankstGet(`/firms/${firmId}`);
    const entity = {
      entityType: "firm",
      entityId:   firmId,
      title:      data.name,
      subtitle:   data.firm_key || "Firm",
      meta: [
        ["Aliases",   String(data.aliases.length)],
        ["Platforms", String(data.platforms.length)],
        ["Blacklist", String(data.blacklist.length)],
      ],
      notes: data.aliases.length
        ? data.aliases.slice(0, 6).join(", ") + (data.aliases.length > 6 ? "…" : "")
        : "No aliases recorded.",
    };
    createCard(entity);
  } catch (e) {
    console.error("[openFirmCard] fetch failed:", e);
  }
}

export function openFinraTab() {
  openTab({ id: "tab-finra-monitor", type: "finra.monitor", title: "FINRA Monitor", state: {} });
}

export function openHfTab() {
  openTab({ id: "tab-hf-table", type: "hf.table", title: "HF Map", state: {} });
}

export function openBbgFirmsTab() {
  openTab({
    id:    "tab-bbg-firms",
    type:  "bbg.firms",
    title: "BBG Extraction",
    state: {},
  });
}

export function openBbgFirmTab(firmId, firmName) {
  openTab({
    id:         `tab-bbg-firm-${firmId}`,
    type:       "bbg.firm",
    entityType: "bbg_firm",
    entityId:   firmId,
    title:      firmName || "BBG Firm",
    state:      { mode: "confirmed" },
  });
}

export function openEncoreSyncTab() {
  openTab({ id: "tab-encore-sync", type: "encore.sync", title: "Encore Sync", state: {} });
}

export function runCommand(commandId) {
  if (commandId === "toggle-right-rail") {
    document.dispatchEvent(new CustomEvent("bankst:toggleRightRail"));
  } else if (commandId === "open-people") {
    openTab({ id: "tab-people-table", type: "people.table", title: "People Table", state: { mode: "table" } });
  } else if (commandId === "open-firms") {
    openTab({ id: "tab-firms-table",  type: "firms.table",  title: "Firms Table",  state: {} });
  } else if (commandId === "open-finra") {
    openTab({ id: "tab-finra-monitor", type: "finra.monitor", title: "FINRA Monitor", state: {} });
  } else if (commandId === "open-hf-map") {
    openHfTab();
  } else if (commandId === "open-trending") {
    openTab({ id: "tab-trending", type: "trending", title: "Trending", state: {} });
  } else {
    console.log("Run command:", commandId);
  }
}
