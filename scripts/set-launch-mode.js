const fs = require("node:fs");
const path = require("node:path");

const mode = String(process.argv[2] || "").trim().toLowerCase();
const allowedModes = new Set(["prelaunch", "launch"]);

if (!allowedModes.has(mode)) {
  console.error('Usage: node scripts/set-launch-mode.js <prelaunch|launch>');
  process.exit(1);
}

const configPath = path.resolve(__dirname, "..", "JS", "launch-config.js");
const source = fs.readFileSync(configPath, "utf8");

const next = source.replace(/mode:\s*"(prelaunch|launch)"/, `mode: "${mode}"`);

if (next === source) {
  console.log(`Launch mode already set to: ${mode}`);
  process.exit(0);
}

fs.writeFileSync(configPath, next, "utf8");
console.log(`Launch mode set to: ${mode}`);
