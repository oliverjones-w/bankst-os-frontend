const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const DISALLOWED = [
  "var(--text-norm)",
  "var(--primary)"
];

const SKIP = new Set([
  "base.css"
]);

function getFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name.startsWith(".")
    ) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      getFiles(full, out);
    } else if (/\.css$/.test(entry.name) && !SKIP.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = getFiles(ROOT);
let failed = false;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");

  for (const token of DISALLOWED) {
    if (text.includes(token)) {
      console.log(`${file} contains legacy token usage: ${token}`);
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
