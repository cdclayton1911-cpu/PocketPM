"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Body of a route segment's error.tsx.
 *
 * Each module keeps its own three-line error.tsx so the boundary is per-segment
 * — a failure in one module does not blank the others — while the markup lives
 * here once.
 */
export function ModuleError({
  what,
  error,
  reset,
}: {
  what: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server detail is not sent to the browser; the digest correlates this with
    // the server log.
    console.error(`${what} failed to load:`, error);
  }, [what, error]);

  return (
    <Card className="rounded-r12">
      <CardContent className="flex flex-col items-center px-6 py-10 text-center">
        <AlertTriangle className="mb-3 size-8 text-danger" aria-hidden />
        <p className="text-sm font-semibold">Could not load {what}</p>
        <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          This is usually temporary. If it persists, the record may have been removed or your
          session may have expired.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">Ref: {error.digest}</p>
        ) : null}
        <Button size="sm" className="mt-4" onClick={reset}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
