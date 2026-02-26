"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("node:fs/promises");
const path = require("node:path");
async function ensureParentDir(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}
async function readJson(filePath, fallback) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch (error) {
        if (error?.code === "ENOENT")
            return fallback;
        throw error;
    }
}
async function writeJson(filePath, value) {
    await ensureParentDir(filePath);
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, filePath);
}
module.exports = {
    readJson,
    writeJson
};
//# sourceMappingURL=json-store.js.map