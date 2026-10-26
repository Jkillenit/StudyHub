/**
 * Station boot: empty stubs behind `station.enabled`. Wave 1 fills jobs/scheduler/api/notify.
 */

function emptyStub() {
  return {
    start() {},
    stop() {},
  };
}

/** @param {import('better-sqlite3').Database} db */
function readEnabled(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("station.enabled");
  const v = row?.value;
  return v === "1" || v === "true";
}

/**
 * @param {{ getDb: () => import('better-sqlite3').Database }} adapter
 * @param {{ log?: (msg: string) => void }} [opts]
 */
function start(adapter, { log = (msg) => console.info(msg) } = {}) {
  if (!readEnabled(adapter.getDb())) {
    return { started: false, stop() {}, stubs: null };
  }

  const stubs = {
    jobs: emptyStub(),
    scheduler: emptyStub(),
    api: emptyStub(),
    notify: emptyStub(),
  };

  log("station ready");

  return {
    started: true,
    stubs,
    stop() {
      stubs.jobs.stop();
      stubs.scheduler.stop();
      stubs.api.stop();
      stubs.notify.stop();
    },
  };
}

module.exports = { start, readEnabled };
