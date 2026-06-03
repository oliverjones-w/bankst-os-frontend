export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Labels that contain IDs, keys, or codes → render value in --font-monospace
const ID_LABELS = /crd|id|key|code|ref|crn|ein|ticker/i;

export function metaHTML(meta) {
  return meta.map(([label, value]) => {
    const isId = ID_LABELS.test(label);
    return `
      <div class="meta-block">
        <div class="meta-label">${label}</div>
        <div class="meta-value${isId ? " meta-value--id" : ""}">${value}</div>
      </div>
    `;
  }).join("");
}

// ── Performance instrumentation ───────────────────────────────────────────────
if (!window.perf_log) window.perf_log = [];

const PERF_LOG_CAP = 500;

export class Timer {
  constructor(category, label) {
    this._category = category;
    this._label    = label;
    this._t0       = performance.now();
  }
  done(meta = {}) {
    const ms = Math.round((performance.now() - this._t0) * 10) / 10;
    window.perf_log.push({ t: Date.now(), category: this._category, label: this._label, ms, ...meta });
    if (window.perf_log.length > PERF_LOG_CAP) window.perf_log.shift();
    return ms;
  }
}

let _frameMonitorRunning = false;
export function startFrameMonitor() {
  if (_frameMonitorRunning) return;
  _frameMonitorRunning = true;
  let last = performance.now();
  function tick(ts) {
    const ms = Math.round((ts - last) * 10) / 10;
    last = ts;
    // Ignore outliers (tab was hidden / system asleep)
    if (ms > 0 && ms < 5000) {
      window.perf_log.push({ t: Date.now(), category: "renderer", label: "frame", ms });
      if (window.perf_log.length > PERF_LOG_CAP) window.perf_log.shift();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
