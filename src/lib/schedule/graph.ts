/**
 * Graph checks over schedule relationships.
 *
 * Pure functions, no I/O — so they are unit-testable without a database, and
 * the CPM engine that follows can reuse them.
 *
 * Cycle detection lives here rather than in a PocketBase rule because a rule
 * cannot walk a graph. It matters more than an ordinary validation: a cycle
 * does not make the critical path *wrong*, it makes the forward pass
 * non-terminating, so it has to be refused at write time rather than handled
 * at read time.
 */

export interface Edge {
  predecessor: string;
  successor: string;
}

/**
 * The activities that can be reached by following successors from `start`.
 *
 * Iterative rather than recursive: an imported P6 schedule can be tens of
 * thousands of activities deep in pathological cases, and blowing the stack
 * inside a route handler would surface as an opaque 500.
 */
export function reachableFrom(start: string, edges: readonly Edge[]): Set<string> {
  const bySource = new Map<string, string[]>();
  for (const e of edges) {
    const list = bySource.get(e.predecessor);
    if (list) list.push(e.successor);
    else bySource.set(e.predecessor, [e.successor]);
  }

  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const node = stack.pop() as string;
    for (const next of bySource.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

/**
 * True when adding predecessor -> successor would close a loop.
 *
 * The test is whether the *predecessor* is already downstream of the
 * successor: if so, the new edge completes a cycle back to it. A self-edge is
 * the degenerate case and is rejected too, though PocketBase's rule already
 * refuses `predecessor = successor`.
 */
export function wouldCreateCycle(
  predecessor: string,
  successor: string,
  edges: readonly Edge[],
): boolean {
  if (predecessor === successor) return true;
  return reachableFrom(successor, edges).has(predecessor);
}

/**
 * Activities in an order where every predecessor precedes its successors.
 *
 * Returns null when the graph contains a cycle, which is what the CPM engine
 * will use as its guard — it should never happen if writes are checked, but a
 * schedule can also arrive by import or by an edge deleted mid-flight.
 */
export function topologicalOrder(nodes: readonly string[], edges: readonly Edge[]): string[] | null {
  const indegree = new Map<string, number>(nodes.map((n) => [n, 0]));
  const bySource = new Map<string, string[]>();

  for (const e of edges) {
    // Edges pointing at activities outside `nodes` are ignored rather than
    // treated as an error: a filtered view of one project's schedule is a
    // legitimate input, and half an edge is not a cycle.
    if (!indegree.has(e.successor) || !indegree.has(e.predecessor)) continue;
    indegree.set(e.successor, (indegree.get(e.successor) ?? 0) + 1);
    const list = bySource.get(e.predecessor);
    if (list) list.push(e.successor);
    else bySource.set(e.predecessor, [e.successor]);
  }

  const ready = nodes.filter((n) => indegree.get(n) === 0);
  const order: string[] = [];

  while (ready.length > 0) {
    const node = ready.shift() as string;
    order.push(node);
    for (const next of bySource.get(node) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
  }

  return order.length === nodes.length ? order : null;
}
