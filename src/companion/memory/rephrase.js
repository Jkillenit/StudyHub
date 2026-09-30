/**
 * Optional Claude rephrase of a filled template. The model may change the tone, never the facts:
 * every number and every filled-in name must survive verbatim, and no new numbers may appear.
 * Anything that fails the check, times out, or has no API key falls back to the template.
 */
const MAX_CHARS = 140;
const TIMEOUT_MS = 3000;

const numbers = (text) => (String(text).match(/\d+(?:[.:]\d+)?/g) || []).sort();

/** True when `candidate` keeps every fact of `original` and adds none. `facts` are the filled-in strings. */
export function keepsFacts(original, candidate, facts = []) {
  const out = String(candidate || "").trim();
  if (!out || out.length > MAX_CHARS || /[\n{}]/.test(out)) return false;
  const a = numbers(original);
  const b = numbers(out);
  if (a.length !== b.length || a.some((n, i) => n !== b[i])) return false;
  const lower = out.toLowerCase();
  return facts.every((f) => lower.includes(String(f).toLowerCase()));
}

/** The string values a template was filled with, e.g. course and topic names. */
export function factStrings(vars = {}) {
  return Object.values(vars).filter((v) => typeof v === "string" && v.trim().length > 1 && !/^\d/.test(v));
}

/** Rephrased text when a key exists and the result passes the check, else the original. */
export async function maybeRephrase(text, vars = {}) {
  const ai = window.studyHub?.ai;
  if (!ai?.companionRephrase) return text;
  try {
    const status = await ai.getStatus?.();
    if (!status?.configured) return text;
    const res = await Promise.race([
      ai.companionRephrase({ text }),
      new Promise((resolve) => window.setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    return res?.ok && keepsFacts(text, res.text, factStrings(vars)) ? res.text.trim() : text;
  } catch {
    return text;
  }
}
