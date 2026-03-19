// === theme-lab.js ===

const STORAGE_KEY = "bankst.themeLab.overrides";

const TOKEN_GROUPS = [
  {
    label: "Surfaces — Semantic",
    tokens: [
      "--background-primary-alt",
      "--background-primary",
      "--background-secondary",
      "--border-subtle",
      "--border-strong",
    ],
  },
  {
    label: "Surfaces — Primitives",
    tokens: [
      "--bg-deep",
      "--bg-stage",
      "--bg-elevated",
    ],
  },
  {
    label: "Text",
    tokens: [
      "--text-normal",
      "--text-primary",
      "--text-muted",
      "--text-faint",
      "--text-accent",
    ],
  },
  {
    label: "Accent",
    tokens: [
      "--interactive-accent",
      "--interactive-accent-hover",
      "--background-accent-subtle",
      "--background-accent-faint",
      "--border-accent",
    ],
  },
  {
    label: "Navigation",
    tokens: [
      "--nav-item-bg",
      "--nav-item-bg-hover",
      "--nav-item-bg-active",
      "--nav-item-text",
      "--nav-item-text-hover",
      "--nav-item-text-active",
      "--nav-item-border-active",
      "--nav-icon-color",
      "--nav-icon-color-hover",
      "--nav-icon-color-active",
    ],
  },
  {
    label: "Controls",
    tokens: [
      "--button-primary-bg",
      "--button-primary-bg-hover",
      "--button-primary-bg-active",
      "--button-primary-text",
      "--control-surface-bg",
      "--control-surface-border",
      "--control-surface-border-hover",
    ],
  },
  {
    label: "Categories",
    tokens: [
      "--category-function",
      "--category-function-bg",
      "--category-function-border",
      "--category-strategy",
      "--category-strategy-bg",
      "--category-strategy-border",
      "--category-product",
      "--category-product-bg",
      "--category-product-border",
    ],
  },
  {
    label: "Typography — sizes",
    tokens: [
      "--font-ui-smaller",
      "--font-ui-small",
      "--font-ui-medium",
      "--font-ui-large",
    ],
  },
  {
    label: "Typography — fonts",
    fonts: [
      { token: "--font-interface", preview: "The quick brown fox" },
      { token: "--font-data",      preview: "0123456789 AaBbCc" },
      { token: "--font-monospace", preview: "fn() => { return; }" },
    ],
  },
];

// ── Font presets ───────────────────────────────────────────────────────────────

const FONT_PRESETS = {
  "--font-interface": [
    { label: "SF Pro Display",  value: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif" },
    { label: "Inter",           value: "'InterVariable', 'Inter', sans-serif" },
    { label: "System UI",       value: "system-ui, -apple-system, sans-serif" },
    { label: "Geist",           value: "'Geist', 'Inter', sans-serif" },
    { label: "DM Sans",         value: "'DM Sans', sans-serif" },
    { label: "IBM Plex Sans",   value: "'IBM Plex Sans', sans-serif" },
    { label: "Custom…",         value: "" },
  ],
  "--font-data": [
    { label: "SF Mono",         value: "'SF Mono', 'SFMono-Regular', monospace" },
    { label: "JetBrains Mono",  value: "'JetBrains Mono', monospace" },
    { label: "Fira Code",       value: "'Fira Code', monospace" },
    { label: "IBM Plex Mono",   value: "'IBM Plex Mono', monospace" },
    { label: "Cascadia Code",   value: "'Cascadia Code', monospace" },
    { label: "Menlo",           value: "Menlo, Consolas, monospace" },
    { label: "Custom…",         value: "" },
  ],
  "--font-monospace": [
    { label: "SF Mono",         value: "'SF Mono', 'SFMono-Regular', monospace" },
    { label: "JetBrains Mono",  value: "'JetBrains Mono', monospace" },
    { label: "Fira Code",       value: "'Fira Code', monospace" },
    { label: "IBM Plex Mono",   value: "'IBM Plex Mono', monospace" },
    { label: "Custom…",         value: "" },
  ],
};

// ── State ──────────────────────────────────────────────────────────────────────

const overrides = {};

// ── Token helpers ──────────────────────────────────────────────────────────────

function getTokenValue(tokenName) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(tokenName)
    .trim();
}

function looksLikeColor(value) {
  return (
    value.startsWith("#") ||
    value.startsWith("rgb") ||
    value.startsWith("hsl") ||
    value.startsWith("rgba") ||
    value.startsWith("hsla") ||
    value.startsWith("color-mix") ||
    value.startsWith("oklch") ||
    value.startsWith("lch")
  );
}

// ── Override engine ────────────────────────────────────────────────────────────

function applyOverride(tokenName, value) {
  if (value.trim() === "") {
    delete overrides[tokenName];
  } else {
    overrides[tokenName] = value.trim();
  }
  renderOverrides();
}

function renderOverrides() {
  const styleEl = document.getElementById("themeLabOverrides");
  const lines = Object.entries(overrides).map(
    ([token, value]) => `  ${token}: ${value};`
  );
  styleEl.textContent = lines.length
    ? `:root {\n${lines.join("\n")}\n}`
    : "";
}

// ── Persistence ────────────────────────────────────────────────────────────────

function saveOverrides() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function loadOverrides() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    Object.assign(overrides, parsed);
    renderOverrides();
  } catch (err) {
    console.error("Failed to load theme overrides:", err);
  }
}

function resetOverrides() {
  Object.keys(overrides).forEach((key) => delete overrides[key]);
  localStorage.removeItem(STORAGE_KEY);
  renderOverrides();
  location.reload();
}

// ── Export / import ────────────────────────────────────────────────────────────

function exportOverrides() {
  const text = JSON.stringify(overrides, null, 2);
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("exportThemeBtn");
    const original = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = original), 1500);
  });
}

function importOverrides(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    Object.assign(overrides, parsed);
    renderOverrides();
    saveOverrides();
    location.reload();
  } catch (err) {
    console.error("Import failed:", err);
  }
}

// ── Controls ───────────────────────────────────────────────────────────────────

function updateSwatch(el, value) {
  if (looksLikeColor(value)) {
    el.style.background = value;
    el.dataset.empty = "false";
  } else {
    el.style.background = "";
    el.dataset.empty = "true";
  }
}

function createTokenControl(tokenName) {
  const wrapper = document.createElement("div");
  wrapper.className = "token-control";

  const label = document.createElement("div");
  label.className = "token-label";
  label.textContent = tokenName;
  label.title = tokenName;

  const input = document.createElement("input");
  input.className = "token-input";
  input.type = "text";
  input.spellcheck = false;

  const swatch = document.createElement("div");
  swatch.className = "token-swatch";

  // Populate after overrides are loaded so we reflect the live computed value
  const computedValue = getTokenValue(tokenName);
  input.value = overrides[tokenName] ?? computedValue;
  updateSwatch(swatch, input.value);

  if (overrides[tokenName]) {
    input.classList.add("is-overridden");
    label.classList.add("is-overridden");
  }

  input.addEventListener("input", () => {
    applyOverride(tokenName, input.value);
    updateSwatch(swatch, input.value);
    saveOverrides();

    const isOverridden = !!overrides[tokenName];
    input.classList.toggle("is-overridden", isOverridden);
    label.classList.toggle("is-overridden", isOverridden);
  });

  wrapper.append(label, input, swatch);
  return wrapper;
}

// ── Font control ──────────────────────────────────────────────────────────────

function createFontControl({ token, preview: previewText }) {
  const presets = FONT_PRESETS[token] || [];
  const computedValue = getTokenValue(token);
  const currentValue  = overrides[token] ?? computedValue;

  const wrapper = document.createElement("div");
  wrapper.className = "font-control";

  // Label
  const label = document.createElement("div");
  label.className = "font-control-label" + (overrides[token] ? " is-overridden" : "");
  label.textContent = token;

  // Select row
  const row = document.createElement("div");
  row.className = "font-control-row";

  const select = document.createElement("select");
  select.className = "font-preset-select";

  // Build options — mark active if value matches
  presets.forEach(({ label: optLabel, value }) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = optLabel;
    if (currentValue === value) opt.selected = true;
    select.appendChild(opt);
  });

  // Custom input
  const input = document.createElement("input");
  input.className = "font-custom-input" + (overrides[token] ? " is-overridden" : "");
  input.type = "text";
  input.spellcheck = false;
  input.value = currentValue;
  input.placeholder = "Custom font stack…";

  // Preview swatch
  const fontPreview = document.createElement("div");
  fontPreview.className = "font-preview";
  fontPreview.textContent = previewText;
  fontPreview.style.fontFamily = currentValue;

  function applyFont(value) {
    applyOverride(token, value);
    saveOverrides();
    fontPreview.style.fontFamily = value;
    const isOverridden = !!overrides[token];
    input.classList.toggle("is-overridden", isOverridden);
    label.classList.toggle("is-overridden", isOverridden);
  }

  select.addEventListener("change", () => {
    if (select.value === "") return; // "Custom…" — let user type
    input.value = select.value;
    applyFont(select.value);
  });

  input.addEventListener("input", () => {
    applyFont(input.value);
    // Sync select to "Custom…" if value doesn't match any preset
    const match = presets.find(p => p.value === input.value);
    if (!match) {
      const customOpt = select.querySelector('option[value=""]');
      if (customOpt) customOpt.selected = true;
    }
  });

  row.append(select);
  wrapper.append(label, row, input, fontPreview);
  return wrapper;
}

// ── Render token groups ────────────────────────────────────────────────────────

function renderTokenGroups() {
  const root = document.getElementById("tokenGroups");
  root.innerHTML = "";

  for (const group of TOKEN_GROUPS) {
    const section = document.createElement("section");
    section.className = "token-group";

    const title = document.createElement("div");
    title.className = "token-group-title";
    title.textContent = group.label;
    section.appendChild(title);

    if (group.fonts) {
      for (const fontDef of group.fonts) {
        section.appendChild(createFontControl(fontDef));
      }
    } else {
      for (const token of group.tokens) {
        section.appendChild(createTokenControl(token));
      }
    }

    root.appendChild(section);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  loadOverrides();
  renderTokenGroups();

  document.getElementById("resetThemeBtn").addEventListener("click", resetOverrides);
  document.getElementById("exportThemeBtn").addEventListener("click", exportOverrides);
});
