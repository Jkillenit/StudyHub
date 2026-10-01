import { describe, expect, it } from "vitest";
import { callbackFor, deriveMemory } from "./derive.js";
import { factList } from "./facts.js";
import { rapportTier, tierAtLeast } from "../../nova/mood.js";

const DAY = 86400000;
const NOW = new Date(2026, 8, 20, 12);
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();
const topic = (misses, reviews = 20) => ({ module_uuid: "m1", title: "Queuing", course_uuid: "c1", course_code: "OM 300", reviews, misses });
const mem = (entries) => Object.fromEntries(Object.entries(entries).map(([k, value]) => [k, { value, muted: false }]));
const write = (out, key) => out.entries.find((e) => e.key === key)?.value;

describe("running joke", () => {
  it("makes a topic the nemesis once it's stayed toughest for three days", () => {
    const fresh = deriveMemory({ facts: { topics: [topic(10)] }, memory: {}, now: NOW });
    expect(write(fresh, "joke:nemesis")).toBeUndefined();
    const since = iso(4);
    const out = deriveMemory({ facts: { topics: [topic(10)] }, memory: mem({ weak_topic: { moduleUuid: "m1", since } }), now: NOW });
    expect(write(out, "weak_topic").since).toBe(since);
    expect(write(out, "joke:nemesis")).toMatchObject({ topic: "Queuing", status: "active", courseUuid: "c1" });
  });

  it("retires the joke when the topic is beaten, and says so once", () => {
    const joke = { moduleUuid: "m1", topic: "Queuing", status: "active", since: iso(10) };
    const out = deriveMemory({ facts: { topics: [topic(2)] }, memory: mem({ "joke:nemesis": joke }), now: NOW });
    expect(write(out, "joke:nemesis")).toMatchObject({ status: "retired", said: false });
    expect(out.news).toEqual([expect.objectContaining({ type: "joke_retired", topic: "Queuing" })]);
  });

  it("keeps an active joke while the topic still hurts", () => {
    const joke = { moduleUuid: "m1", topic: "Queuing", status: "active", since: iso(10) };
    const out = deriveMemory({ facts: { topics: [topic(10)] }, memory: mem({ "joke:nemesis": joke, weak_topic: { moduleUuid: "m1", since: iso(10) } }), now: NOW });
    expect(write(out, "joke:nemesis")).toBeUndefined();
  });
});

describe("episodes", () => {
  const s = (combo, daysAgo, hour = 20) => {
    const d = new Date(NOW.getTime() - daysAgo * DAY);
    d.setHours(hour, 0, 0, 0);
    return { started_at: d.toISOString(), ended_at: d.toISOString(), best_combo: combo, course_uuid: "c1", course_code: "OM 300" };
  };

  it("records the best run only when it's beaten", () => {
    const out = deriveMemory({ facts: { sessions: [s(18, 1), s(9, 2)] }, memory: {}, now: NOW });
    expect(write(out, "episode:best_combo")).toMatchObject({ combo: 18, course: "OM 300" });
    const same = deriveMemory({ facts: { sessions: [s(18, 1)] }, memory: mem({ "episode:best_combo": { combo: 22 } }), now: NOW });
    expect(write(same, "episode:best_combo")).toBeUndefined();
  });

  it("remembers the latest late-night session", () => {
    const out = deriveMemory({ facts: { sessions: [s(3, 1, 3)] }, memory: {}, now: NOW });
    expect(write(out, "episode:late_night")).toMatchObject({ course: "OM 300" });
  });

  it("never writes a muted episode", () => {
    const out = deriveMemory({ facts: { sessions: [s(30, 1)] }, memory: { "episode:best_combo": { value: null, muted: true } }, now: NOW });
    expect(write(out, "episode:best_combo")).toBeUndefined();
  });
});

describe("callbacks", () => {
  const all = () => true;
  it("brings up the most memorable thing the relationship allows", () => {
    const memory = mem({ "episode:best_combo": { combo: 20, course: "OM 300", at: iso(3) }, "joke:nemesis": { topic: "Queuing", status: "active", since: iso(5) } });
    expect(callbackFor(memory, { allowed: all, now: NOW }).kind).toBe("nemesis");
    expect(callbackFor(memory, { allowed: (t) => tierAtLeast("partner", t), now: NOW }).kind).toBe("best_combo");
    expect(callbackFor(memory, { allowed: (t) => tierAtLeast("stranger", t), now: NOW })).toBe(null);
  });

  it("waits a day before a 'remember when', and rests between mentions", () => {
    expect(callbackFor(mem({ "episode:best_combo": { combo: 20, at: iso(0.5) } }), { allowed: all, now: NOW })).toBe(null);
    expect(callbackFor(mem({ "episode:best_combo": { combo: 20, at: iso(9), lastRef: iso(2) } }), { allowed: all, now: NOW })).toBe(null);
    expect(callbackFor(mem({ "episode:best_combo": { combo: 20, at: iso(9), lastRef: iso(8) } }), { allowed: all, now: NOW })).not.toBe(null);
  });

  it("ignores retired jokes", () => {
    expect(callbackFor(mem({ "joke:nemesis": { topic: "Q", status: "retired", since: iso(9) } }), { allowed: all, now: NOW })).toBe(null);
  });
});

describe("rapport and what she knows", () => {
  it("tiers by visits", () => {
    expect([0, 3, 15, 40].map((n) => rapportTier(n).id)).toEqual(["stranger", "partner", "friend", "rideOrDie"]);
  });

  it("describes the new memories in plain words", () => {
    const rows = [
      { key: "birthday", value: { month: 3, day: 14 } },
      { key: "never_bug", value: { intents: ["overdue"] } },
      { key: "episode:best_combo", value: { combo: 20, course: "OM 300", at: iso(1) } },
      { key: "joke:nemesis", value: { topic: "Queuing", status: "active", since: iso(5) } },
    ];
    const texts = factList(rows).known.map((r) => r.text);
    expect(texts).toEqual(expect.arrayContaining(["Your birthday is March 14.", "She leaves these alone: overdue work."]));
    expect(texts.some((t) => t.startsWith("Your best run: 20 in a row on OM 300"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Running joke: Queuing"))).toBe(true);
  });
});
