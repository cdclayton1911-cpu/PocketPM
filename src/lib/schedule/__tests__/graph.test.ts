import { describe, expect, it } from "vitest";

import { reachableFrom, topologicalOrder, wouldCreateCycle, type Edge } from "../graph";

/** A -> B -> C, with a separate D. */
const CHAIN: Edge[] = [
  { predecessor: "A", successor: "B" },
  { predecessor: "B", successor: "C" },
];

describe("reachableFrom", () => {
  it("follows successors transitively", () => {
    expect([...reachableFrom("A", CHAIN)].sort()).toEqual(["B", "C"]);
  });

  it("returns nothing for a leaf", () => {
    expect([...reachableFrom("C", CHAIN)]).toEqual([]);
  });

  it("terminates on a graph that already contains a cycle", () => {
    const looped: Edge[] = [...CHAIN, { predecessor: "C", successor: "A" }];
    expect([...reachableFrom("A", looped)].sort()).toEqual(["A", "B", "C"]);
  });
});

describe("wouldCreateCycle", () => {
  it("allows an edge that extends the chain", () => {
    expect(wouldCreateCycle("C", "D", CHAIN)).toBe(false);
  });

  it("allows a second path to the same node", () => {
    expect(wouldCreateCycle("A", "C", CHAIN)).toBe(false);
  });

  it("refuses an edge that closes the loop", () => {
    expect(wouldCreateCycle("C", "A", CHAIN)).toBe(true);
  });

  it("refuses a self-edge", () => {
    expect(wouldCreateCycle("A", "A", [])).toBe(true);
  });
});

describe("topologicalOrder", () => {
  it("puts every predecessor before its successors", () => {
    const order = topologicalOrder(["C", "A", "B"], CHAIN);
    expect(order).not.toBeNull();
    const at = (n: string) => (order as string[]).indexOf(n);
    expect(at("A")).toBeLessThan(at("B"));
    expect(at("B")).toBeLessThan(at("C"));
  });

  it("returns null on a cycle rather than looping forever", () => {
    const looped: Edge[] = [...CHAIN, { predecessor: "C", successor: "A" }];
    expect(topologicalOrder(["A", "B", "C"], looped)).toBeNull();
  });

  it("ignores edges pointing outside the node set", () => {
    const order = topologicalOrder(["A", "B"], [...CHAIN, { predecessor: "B", successor: "ZZ" }]);
    expect(order).toEqual(["A", "B"]);
  });

  it("handles a graph with no edges", () => {
    expect(topologicalOrder(["A", "B"], [])).toHaveLength(2);
  });
});
