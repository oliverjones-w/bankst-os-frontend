import { entityData } from "./mock-data.js";
import { openTab } from "./workspace.js";
import { createCard, findExistingCard, focusCard } from "./cards.js";
import { bankstGet } from "./api.js";

const NAV_TABS = {
  "platform.overview": { id: "tab-platform-overview", type: "platform.overview", title: "Platform" },
  "pipeline.table": { id: "tab-pipeline-table", type: "pipeline.table", title: "Pipeline" },
  "mandates.table": { id: "tab-mandates-table", type: "mandates.table", title: "Mandates" },
  "client-requests.table": { id: "tab-client-requests-table", type: "client-requests.table", title: "Client Requests" },
  "research-tasks.table": { id: "tab-research-tasks-table", type: "research-tasks.table", title: "Research Tasks" },
  "followups.queue": { id: "tab-followups-queue", type: "followups.queue", title: "Follow-ups" },
  "system.health": { id: "tab-system-health", type: "system.health", title: "System Health" },
  "finra.monitor": { id: "tab-finra-monitor", type: "finra.monitor", title: "FINRA Monitor" },
  "hf.table": { id: "tab-hf-table", type: "hf.table", title: "HF Map" },
  "ir.table": { id: "tab-ir-table", type: "ir.table", title: "IR Map" },
  "bbg.firms": { id: "tab-bbg-firms", type: "bbg.firms", title: "BBG Monitor" },
};

export function openNavTab(tabKey) {
  const tab = NAV_TABS[tabKey];
  if (!tab) return;
  openTab({ ...tab, state: {} });
}

export function openPersonTab(entityId) {
  const entity = entityData[entityId];
  if (!entity) return;
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

export function runCommand(commandId) {
  const commandMap = {
    "open-platform": "platform.overview",
    "open-pipeline": "pipeline.table",
    "open-mandates": "mandates.table",
    "open-client-requests": "client-requests.table",
    "open-research-tasks": "research-tasks.table",
    "open-followups": "followups.queue",
    "open-bbg": "bbg.firms",
    "open-finra": "finra.monitor",
    "open-hf-map": "hf.table",
    "open-ir-map": "ir.table",
    "open-system-health": "system.health",
  };

  const tabKey = commandMap[commandId];
  if (tabKey) {
    openNavTab(tabKey);
    return;
  }

  console.log("Run command:", commandId);
}
