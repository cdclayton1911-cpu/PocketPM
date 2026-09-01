/**
 * Shown while the server component fetches. Mirrors the real layout — four stat
 * cards above a table — so the page does not jump when data arrives.
 */
export default function RegistryLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading registry…</span>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[74px] rounded-r8 border border-border bg-card" />
        ))}
      </div>
      <div className="rounded-r12 border border-border bg-card p-4">
        <div className="mb-4 h-4 w-40 rounded bg-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-2 h-8 rounded bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
