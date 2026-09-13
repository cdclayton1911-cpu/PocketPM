import { describe, expect, it } from "vitest";

import { describePending } from "./pending";

const PHOTOS = ["photo1.jpg", "photo2.jpg", "photo3.jpg", "photo4.jpg"];

describe("a multi-file field", () => {
  it("says a new file is added and the existing ones stay: the daily-log case", () => {
    expect(describePending({ existing: PHOTOS, removed: [], picked: ["mix-ticket.pdf"], maxSelect: 10 })).toBe(
      "1 file ready to upload, added to the 4 already attached, which stay.",
    );
  });

  it("says so when the record has none yet", () => {
    expect(describePending({ existing: [], removed: [], picked: ["a.jpg", "b.jpg"], maxSelect: 10 })).toBe(
      "2 files ready to upload, added to this record.",
    );
  });

  it("names every removal, and never counts a file being removed as staying", () => {
    const text = describePending({ existing: PHOTOS, removed: ["photo2.jpg"], picked: ["mix-ticket.pdf"], maxSelect: 10 });
    expect(text).toContain("the 3 already attached, which stay");
    expect(text).toContain("On save, photo2.jpg will be removed.");
  });

  it("abbreviates a long removal list without hiding how many", () => {
    const text = describePending({ existing: PHOTOS, removed: PHOTOS, picked: [], maxSelect: 10 });
    expect(text).toBe("On save, photo1.jpg, photo2.jpg, photo3.jpg and 1 more will be removed.");
  });

  it("says nothing when nothing will change", () => {
    expect(describePending({ existing: PHOTOS, removed: [], picked: [], maxSelect: 10 })).toBeNull();
  });
});

describe("a single-file field", () => {
  it("says the stored file will be replaced, naming both", () => {
    expect(describePending({ existing: ["plan.pdf"], removed: [], picked: ["plan-rev2.pdf"], maxSelect: 1 })).toBe(
      "On save, plan.pdf will be replaced by plan-rev2.pdf.",
    );
  });

  it("still says replaced when the old file was removed first", () => {
    expect(describePending({ existing: ["plan.pdf"], removed: ["plan.pdf"], picked: ["plan-rev2.pdf"], maxSelect: 1 })).toBe(
      "On save, plan.pdf will be replaced by plan-rev2.pdf.",
    );
  });

  it("says a first file is ready, and a removal is a removal", () => {
    expect(describePending({ existing: [], removed: [], picked: ["plan.pdf"], maxSelect: 1 })).toBe("1 file ready to upload.");
    expect(describePending({ existing: ["plan.pdf"], removed: ["plan.pdf"], picked: [], maxSelect: 1 })).toBe(
      "On save, plan.pdf will be removed.",
    );
  });
});
