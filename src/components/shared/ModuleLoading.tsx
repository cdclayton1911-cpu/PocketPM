/**
 * Body of a route segment's loading.tsx.
 *
 * Mirrors the real layout — a stat row above a table — so the page does not jump
 * when data arrives.
 */
export function ModuleLoading({ stats = 4 }: { stats?: number }) {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {stats > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="h-[74px] rounded-r8 border border-border bg-card" />
          ))}
        </div>
      ) : null}
      <div className="rounded-r12 border border-border bg-card p-4">
        <div className="mb-4 h-4 w-40 rounded bg-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-2 h-8 rounded bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
