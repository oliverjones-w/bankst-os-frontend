const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function getFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      getFiles(full, out);
    } else if (/\.(css|html|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = getFiles(ROOT);

const defs = new Map();
const uses = new Map();

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");

  for (const match of text.matchAll(/(--[a-zA-Z0-9-_]+)\s*:/g)) {
    const token = match[1];
    if (!defs.has(token)) defs.set(token, []);
    defs.get(token).push(file);
  }

  for (const match of text.matchAll(/var\(\s*(--[a-zA-Z0-9-_]+)/g)) {
    const token = match[1];
    if (!uses.has(token)) uses.set(token, []);
    uses.get(token).push(file);
  }
}

const duplicateDefs = [...defs.entries()].filter(([, files]) => files.length > 1);
const undefinedUses = [...uses.entries()].filter(([token]) => !defs.has(token));
const unusedDefs = [...defs.entries()].filter(([token]) => !uses.has(token));

console.log("=== Duplicate Definitions ===");
for (const [token, files] of duplicateDefs) {
  console.log(`${token}`);
  for (const file of files) console.log(`  - ${file}`);
}

console.log("\n=== Used But Not Defined ===");
for (const [token, files] of undefinedUses) {
  console.log(`${token}`);
  for (const file of files) console.log(`  - ${file}`);
}

console.log("\n=== Defined But Not Used ===");
for (const [token, files] of unusedDefs) {
  console.log(`${token}`);
  for (const file of files) console.log(`  - ${file}`);
}
