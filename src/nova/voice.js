/**
 * Nova's voice: one picker for every line library in the app.
 *
 * A library maps a key to either
 *   - an array of variants: each is used at the language level its words need (see levelOf), or
 *   - { clean, salty, unfiltered, serious }: explicit per-level lists (the persona pack format).
 * Levels only fall back toward cleaner. Serious mode uses `serious`, else clean lines.
 *
 * Variants can hold `#pool#` parts (Tracery style, expanded from `pools`) and `{fact}` or
 * `{path.to.fact}` fill-ins. A variant is only used when every fill-in has a real value.
 */

export const LEVELS = ["clean", "salty", "unfiltered"];
export const SALTY = /\b(damn|goddamn|hell|ass|asses)\b/i;
export const UNFILTERED = /\b(shit\w*|fuck\w*|bitch\w*|bastard)\b/i;
const FACT = /\{([\w.]+)\}/g;
const POOL = /#(\w+)#/g;
export const MAX_CHARS = 140;

export const levelOf = (text) => (UNFILTERED.test(text) ? "unfiltered" : SALTY.test(text) ? "salty" : "clean");
const rank = (level) => Math.max(0, LEVELS.indexOf(level));

/** [{ id, text }] usable at `level`. Ids stay `key#i` for plain arrays so saved "said" history keeps working. */
export function variants(key, entry, level = "salty", serious = false) {
  if (!entry) return [];
  if (Array.isArray(entry)) {
    const max = serious ? 0 : rank(level);
    return entry.map((text, i) => ({ id: `${key}#${i}`, text })).filter((v) => rank(levelOf(v.text)) <= max);
  }
  const lists = serious ? [["serious", entry.serious], ["clean", entry.clean]] : LEVELS.slice(0, rank(level) + 1).reverse().map((l) => [l, entry[l]]);
  const [lvl, list] = lists.find(([, l]) => l?.length) || [];
  return (list || []).map((text, i) => ({ id: `${key}#${lvl}#${i}`, text }));
}

const lookup = (vars, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), vars);
const known = (v) => v != null && v !== "";

export const hasFacts = (text, vars) => [...text.matchAll(FACT)].every(([, p]) => known(lookup(vars, p)));
export const fill = (text, vars) => text.replace(FACT, (_, p) => (known(lookup(vars, p)) ? String(lookup(vars, p)) : ""));

/** Expand `#pool#` parts from `pools`, recursively (pools can reference pools). */
export function expand(text, pools = {}, random = Math.random, depth = 0) {
  if (depth > 5) return text;
  return text.replace(POOL, (m, name) => {
    const list = pools[name];
    return list?.length ? expand(list[Math.floor(random() * list.length)], pools, random, depth + 1) : m;
  });
}

const clip = (text) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text);

/**
 * { id, text } or null. Prefers variants not in `recent` whose fill-ins are all known.
 * `strict` (memory lines): null when every variant was said recently, so she moves on to something else.
 * Otherwise a recent variant is fine, and as a last resort unknown fill-ins are left blank.
 */
export function pick(lib, key, vars = {}, { level = "salty", serious = false, recent = new Set(), random = Math.random, pools = {}, strict = false } = {}) {
  const all = variants(key, lib[key], level, serious);
  const withFacts = all.filter((v) => hasFacts(v.text, vars));
  const fresh = withFacts.filter((v) => !recent.has(v.id));
  const pool = fresh.length ? fresh : strict ? [] : withFacts.length ? withFacts : all;
  if (!pool.length) return null;
  const v = pool[Math.floor(random() * pool.length)];
  return { id: v.id, text: clip(fill(expand(v.text, pools, random), vars)) };
}

/* The language setting, shared by every in-app line. Desktop Nova reads the same stored value. */
let level = "salty";
export const voiceLevel = () => level;
export function setVoiceLevel(next) {
  if (LEVELS.includes(next)) level = next;
}
