const fs = require("fs");
const path = require("path");
const { safeStorage } = require("electron");

const ENHANCE_MODEL = "claude-haiku-4-5-20251001";

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
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), { encoding: "utf8", mode: 0o600 });
}

function canEncrypt() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encrypt(value) {
  return safeStorage.encryptString(value).toString("base64");
}

function decrypt(value) {
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return "";
  }
}

/** Env wins so CI / power users can inject a key without the UI. */
function getApiKey(app) {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const config = readFile(app);
  if (config.anthropicApiKeyEnc && canEncrypt()) return decrypt(config.anthropicApiKeyEnc).trim();
  if (config.anthropicApiKey) {
    const legacy = String(config.anthropicApiKey).trim();
    if (legacy && canEncrypt()) setApiKey(app, legacy);
    return legacy;
  }
  return "";
}

function setApiKey(app, key) {
  const trimmed = String(key || "").trim();
  const config = readFile(app);
  delete config.anthropicApiKey;
  delete config.anthropicApiKeyEnc;
  if (trimmed) {
    if (canEncrypt()) config.anthropicApiKeyEnc = encrypt(trimmed);
    else config.anthropicApiKey = trimmed;
  }
  writeFile(app, config);
}

function clearApiKey(app) {
  setApiKey(app, "");
}

function isEncrypted(app) {
  return !!readFile(app).anthropicApiKeyEnc;
}

function getModel(app) {
  return process.env.CLAUDE_MODEL?.trim() || readFile(app).model?.trim() || ENHANCE_MODEL;
}

function maskKey(key) {
  if (!key || key.length < 8) return "";
  return `••••••••${key.slice(-4)}`;
}

module.exports = {
  ENHANCE_MODEL,
  getApiKey,
  setApiKey,
  clearApiKey,
  isEncrypted,
  getModel,
  maskKey,
};
