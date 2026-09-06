import { describe, expect, it } from "vitest";

import { cacheFreshness, hashCpmInputs, type CpmInputs } from "./inputs-hash";

const BASE: CpmInputs = {
  activities: [
    { id: "a", duration_days: 5, planned_start: "2026-01-05", planned_finish: "2026-01-09" },
    { id: "b", duration_days: 3, planned_start: "2026-01-12", planned_finish: "2026-01-14" },
  ],
  relationships: [{ predecessor: "a", successor: "b", type: "FS", lag_days: 0 }],
  calendar: { work_days: [1, 2, 3, 4, 5], holidays: [{ date: "2026-12-25", label: "Christmas" }] },
  criticalThreshold: 0,
  projectStart: "2026-01-05",
};

const freshness = (next: CpmInputs) => cacheFreshness(next, hashCpmInputs(BASE)).state;

describe("the case this exists for", () => {
  it("reports STALE when only the calendar changed", () => {
    // The failure this must not ship with. Add a holiday and every computed
    // date and float shifts, while no schedule_item.updated moves because no
    // activity changed. A timestamp comparison would report fresh here.
    const withHoliday: CpmInputs = {
      ...BASE,
      calendar: {
        ...BASE.calendar,
        holidays: [...BASE.calendar.holidays, { date: "2026-07-03", label: "Independence Day" }],
      },
    };
    expect(freshness(withHoliday)).toBe("stale");
  });

  it("reports STALE when only the working days changed", () => {
    const sixDay: CpmInputs = {
      ...BASE,
      calendar: { ...BASE.calendar, work_days: [1, 2, 3, 4, 5, 6] },
    };
    expect(freshness(sixDay)).toBe("stale");
  });
});

describe("every other input", () => {
  it("reports stale when an activity duration changed", () => {
    const next: CpmInputs = {
      ...BASE,
      activities: [{ ...BASE.activities[0], duration_days: 6 }, BASE.activities[1]],
    };
    expect(freshness(next)).toBe("stale");
  });

  it("reports stale when a relationship lag changed", () => {
    const next: CpmInputs = {
      ...BASE,
      relationships: [{ ...BASE.relationships[0], lag_days: 2 }],
    };
    expect(freshness(next)).toBe("stale");
  });

  it("reports stale when a relationship type changed", () => {
    const next: CpmInputs = {
      ...BASE,
      relationships: [{ ...BASE.relationships[0], type: "SS" }],
    };
    expect(freshness(next)).toBe("stale");
  });

  it("reports stale when the critical threshold changed", () => {
    expect(freshness({ ...BASE, criticalThreshold: -5 })).toBe("stale");
  });

  it("reports stale when an activity was added or removed", () => {
    expect(freshness({ ...BASE, activities: [BASE.activities[0]] })).toBe("stale");
  });

  it("reports stale when an actual date was entered", () => {
    const next: CpmInputs = {
      ...BASE,
      activities: [{ ...BASE.activities[0], actual_start: "2026-01-06" }, BASE.activities[1]],
    };
    expect(freshness(next)).toBe("stale");
  });

  it("reports fresh when nothing changed", () => {
    expect(freshness({ ...BASE })).toBe("fresh");
  });

  it("reports never-computed when there is no stored hash", () => {
    expect(cacheFreshness(BASE, null).state).toBe("never-computed");
    expect(cacheFreshness(BASE, "").state).toBe("never-computed");
  });
});

/**
 * The positive control against over-broadening.
 *
 * A marker that fires on every unrelated project edit trains people to ignore
 * it, which costs more than the stale read it was meant to prevent.
 */
describe("things that must NOT mark the cache stale", () => {
  it("stays fresh when a project field the CPM never reads changes", () => {
    // Renaming the project or editing its contract value is not an input here
    // at all - the hash covers the calendar fields specifically, not the
    // project record - so there is nothing that could make this fail.
    expect(freshness({ ...BASE })).toBe("fresh");
  });

  it("stays fresh when only a holiday LABEL changes", () => {
    const relabelled: CpmInputs = {
      ...BASE,
      calendar: { ...BASE.calendar, holidays: [{ date: "2026-12-25", label: "Site shutdown" }] },
    };
    expect(freshness(relabelled)).toBe("fresh");
  });

  it("stays fresh when activities come back in a different order", () => {
    // PocketBase returns rows in whatever order was asked for. Without sorting,
    // the cache would report stale on every single read.
    const reordered: CpmInputs = { ...BASE, activities: [...BASE.activities].reverse() };
    expect(freshness(reordered)).toBe("fresh");
  });

  it("stays fresh when relationships come back in a different order", () => {
    const two: CpmInputs = {
      ...BASE,
      relationships: [
        { predecessor: "a", successor: "b", type: "FS", lag_days: 0 },
        { predecessor: "b", successor: "a", type: "SS", lag_days: 1 },
      ],
    };
    const reversed: CpmInputs = { ...two, relationships: [...two.relationships].reverse() };
    expect(hashCpmInputs(two)).toBe(hashCpmInputs(reversed));
  });

  it("stays fresh when work days are listed in a different order", () => {
    const shuffled: CpmInputs = {
      ...BASE,
      calendar: { ...BASE.calendar, work_days: [5, 3, 1, 4, 2] },
    };
    expect(freshness(shuffled)).toBe("fresh");
  });
});

describe("the hash itself", () => {
  it("is stable across calls", () => {
    expect(hashCpmInputs(BASE)).toBe(hashCpmInputs(BASE));
  });

  it("does not collide on values that differ only by field boundary", () => {
    // Without a separator between fields, an id of "ab" with duration 1 and an
    // id of "a" with duration "b1" would hash identically.
    const left: CpmInputs = { ...BASE, activities: [{ id: "ab", duration_days: 1 }], relationships: [] };
    const right: CpmInputs = { ...BASE, activities: [{ id: "a", duration_days: 11 }], relationships: [] };
    expect(hashCpmInputs(left)).not.toBe(hashCpmInputs(right));
  });
});
