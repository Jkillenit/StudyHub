/**
 * Style lint for Station drafts (BRIEFING §6).
 * Flags hyphen/dash characters with [CHECK]; never silently rewrites.
 */

/**
 * @param {string} text
 * @returns {string}
 */
function styleLint(text) {
  const src = String(text ?? "");
  if (!src) return src;

  const parts = src.split(/(\s+)/);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || /^\s+$/.test(part)) {
      out.push(part);
      continue;
    }
    if (!/[-–—]/.test(part) || part.includes("[CHECK]")) {
      out.push(part);
      continue;
    }
    let j = i + 1;
    while (j < parts.length && /^\s*$/.test(parts[j])) j += 1;
    if (j < parts.length && parts[j] === "[CHECK]") {
      out.push(part);
      continue;
    }
    out.push(part, " ", "[CHECK]");
  }
  return out.join("");
}

/**
 * @param {string} text
 * @returns {number}
 */
function countChecks(text) {
  const m = String(text ?? "").match(/\[CHECK\]/g);
  return m ? m.length : 0;
}

module.exports = { styleLint, countChecks };
