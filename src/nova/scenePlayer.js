/**
 * Scenes as data: choreography written as JSON steps, played on the Stage.
 *
 * { id, priority?, cooldown?, when?, steps }   (priority/cooldown/when are for the Director)
 * Steps:
 *   { do: "<Stage action>", ...args }            walkTo/pointAt/... take `anchor`; say takes `line`
 *   { if: "path", then: [...], else: [...] }     branch on a context value being truthy
 *   { choose: [{ weight?, steps }] }             weighted random branch
 *   { parallel: [[...], [...]] }                 branches at once (walk while talking)
 * Anchors, notes and routes can use `{path}` fill-ins from the context. `say` lines get the whole
 * context as their facts, so a line can use `{task.title}`.
 */
import { ACTIONS } from "./stage.js";

const lookup = (ctx, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), ctx);
const fillIn = (s, ctx) => (typeof s === "string" ? s.replace(/\{([\w.]+)\}/g, (_, p) => lookup(ctx, p) ?? "") : s);
const truthy = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

/** "30s", "500ms", "2m" or a number of ms. */
export function ms(v) {
  if (typeof v === "number") return v;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(String(v || ""));
  if (!m) return undefined;
  return Number(m[1]) * ({ ms: 1, s: 1000, m: 60000 }[m[2] || "ms"]);
}

/** Stage call arguments for one `do` step. */
function args(step, ctx) {
  const a = fillIn(step.anchor, ctx);
  switch (step.do) {
    case "lookAt":
      return [step.target === "user" ? "user" : fillIn(step.target ?? step.anchor, ctx)];
    case "highlight":
      return [a, step.style];
    case "pinNote":
      return [a, fillIn(step.text, ctx)];
    case "openTab":
      return [fillIn(step.route, ctx)];
    case "openPanel":
    case "movePanel":
      return [step.panel, step.slot];
    case "closePanel":
      return [step.panel];
    case "arrange":
      return [step.layout];
    case "say":
      return [step.line, ctx, { speak: step.speak ?? !!ctx.speak }];
    case "emote":
      return [step.name];
    case "wait":
      return step.for === "input" ? ["input", ms(step.timeout)] : [ms(step.for) ?? 0];
    case "clearHighlights":
    case "unfocus":
      return [];
    default:
      return [a];
  }
}

/** Play steps in order on `stage`, stopping as soon as the run is aborted. */
export async function playSteps(stage, steps = [], ctx = {}, random = Math.random) {
  for (const step of steps) {
    if (!stage.running) return;
    if ("if" in step) {
      await playSteps(stage, truthy(lookup(ctx, step.if)) ? step.then : step.else, ctx, random);
    } else if (step.choose) {
      const total = step.choose.reduce((n, b) => n + (b.weight ?? 1), 0);
      let roll = random() * total;
      const branch = step.choose.find((b) => (roll -= b.weight ?? 1) < 0) || step.choose[step.choose.length - 1];
      await playSteps(stage, branch?.steps, ctx, random);
    } else if (step.parallel) {
      await Promise.all(step.parallel.map((b) => playSteps(stage, b, ctx, random)));
    } else if (ACTIONS.includes(step.do)) {
      await stage[step.do](...args(step, ctx));
    }
  }
}

/** Turn a scene definition into a scene function `(stage) => Promise` for `playScene`/`stage.run`. */
export const sceneFrom = (def, ctx = {}) => (stage) => playSteps(stage, def.steps, ctx);

/** Step `do` names that aren't Stage actions (for tests over scene files). */
export function unknownActions(steps = []) {
  return steps.flatMap((s) => {
    if ("if" in s) return [...unknownActions(s.then), ...unknownActions(s.else)];
    if (s.choose) return s.choose.flatMap((b) => unknownActions(b.steps));
    if (s.parallel) return s.parallel.flatMap((b) => unknownActions(b));
    return ACTIONS.includes(s.do) ? [] : [s.do];
  });
}
