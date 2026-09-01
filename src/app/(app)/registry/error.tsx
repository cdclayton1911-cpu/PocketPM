"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Per-segment error boundary, as the brief requires.
 *
 * Catches a failed server fetch so the user sees a real failure with a way out,
 * rather than an empty table that reads as "no subcontractors".
 */
export default function RegistryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side detail is not sent to the browser; the digest is the handle
    // for correlating this with the server log.
    console.error("Registry failed to load:", error);
  }, [error]);

  return (
    <Card className="rounded-r12">
      <CardContent className="flex flex-col items-center px-6 py-10 text-center">
        <AlertTriangle className="mb-3 size-8 text-danger" aria-hidden />
        <p className="text-sm font-semibold">Could not load the registry</p>
        <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          The subcontractor list could not be fetched. This is usually temporary.
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
