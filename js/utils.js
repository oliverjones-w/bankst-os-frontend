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

// Labels that contain IDs, keys, or codes → render value in --font-data
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
