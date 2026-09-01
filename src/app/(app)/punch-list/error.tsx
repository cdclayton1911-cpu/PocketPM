"use client";

import { ModuleError } from "@/components/shared/ModuleError";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ModuleError what="the punch list" {...props} />;
}
