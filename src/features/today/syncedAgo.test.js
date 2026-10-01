import { describe, expect, it } from "vitest";
import { syncedAgo } from "./syncedAgo.js";

const now = new Date("2026-10-01T18:00:00Z");

describe("syncedAgo", () => {
  it("is null without a sync", () => {
    expect(syncedAgo(null, now)).toBeNull();
    expect(syncedAgo("garbage", now)).toBeNull();
  });
  it("reads SQLite UTC timestamps", () => {
    expect(syncedAgo("2026-10-01 17:58:00", now)).toBe("Synced 2m ago");
    expect(syncedAgo("2026-10-01 17:59:50", now)).toBe("Synced just now");
    expect(syncedAgo("2026-10-01 15:00:00", now)).toBe("Synced 3h ago");
    expect(syncedAgo("2026-09-28 18:00:00", now)).toBe("Synced 3d ago");
  });
  it("accepts ISO strings", () => {
    expect(syncedAgo("2026-10-01T17:50:00Z", now)).toBe("Synced 10m ago");
  });
});
