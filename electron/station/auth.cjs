/**
 * Station bearer token helpers. Plaintext token is shown once on the PC;
 * only the hash is stored (`station.token_hash`).
 */

const crypto = require("node:crypto");

const TOKEN_BYTES = 32;

/** @param {number} [bytes] */
function generateToken(bytes = TOKEN_BYTES) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** @param {string} token */
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

/**
 * Constant-time compare of bearer token against a stored SHA-256 hex hash.
 * @param {string} token
 * @param {string} tokenHash
 */
function verifyToken(token, tokenHash) {
  if (typeof token !== "string" || !token) return false;
  if (typeof tokenHash !== "string" || !tokenHash) return false;
  const actual = hashToken(token);
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(tokenHash, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Pull Bearer token from an Authorization header value.
 * @param {string | string[] | undefined} header
 * @returns {string | null}
 */
function bearerFromHeader(header) {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== "string") return null;
  const m = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  return m ? m[1] : null;
}

module.exports = {
  generateToken,
  hashToken,
  verifyToken,
  bearerFromHeader,
};
