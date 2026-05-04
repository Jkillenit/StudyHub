const fs = require("fs");
const path = require("path");

function pathFor(app) {
  return path.join(app.getPath("userData"), "study-hub-ai.json");
}

function readFile(app) {
  try {
    const p = pathFor(app);
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function writeFile(app, obj) {
  const p = pathFor(app);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

/** Env wins so CI / power users can inject key without UI. */
function getApiKey(app) {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return readFile(app).anthropicApiKey?.trim() || "";
}

function setApiKey(app, key) {
  const c = readFile(app);
  c.anthropicApiKey = key.trim();
  writeFile(app, c);
}

function clearApiKey(app) {
  const c = readFile(app);
  delete c.anthropicApiKey;
  writeFile(app, c);
}

function getModel(app) {
  return (
    process.env.CLAUDE_MODEL?.trim() ||
    readFile(app).model?.trim() ||
    "claude-sonnet-4-20250514"
  );
}

function maskKey(key) {
  if (!key || key.length < 8) return "";
  return `••••••••${key.slice(-4)}`;
}

module.exports = {
  pathFor,
  getApiKey,
  setApiKey,
  clearApiKey,
  getModel,
  maskKey,
};
