const UI_PREFS_KEY = "bankst.ui.prefs.v1";

function loadUiPrefs() {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveUiPrefs(prefs) {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.error("[ui-prefs] Failed to save:", err);
  }
}

export function getGroupState(groupId, defaultState = "open") {
  return loadUiPrefs().sidebarGroups?.[groupId] ?? defaultState;
}

export function setGroupState(groupId, state) {
  const prefs = loadUiPrefs();
  prefs.sidebarGroups = { ...(prefs.sidebarGroups || {}), [groupId]: state };
  saveUiPrefs(prefs);
}

export function initRailGroups() {
  document.querySelectorAll(".rail-group[data-group-id]").forEach((group) => {
    const id = group.dataset.groupId;
    const defaultState = group.dataset.defaultState || "open";
    group.dataset.state = getGroupState(id, defaultState);
  });
}
