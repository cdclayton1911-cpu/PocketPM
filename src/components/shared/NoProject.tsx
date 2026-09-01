import { FolderOpen } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/card";

/**
 * Shown by every module when no project is selected. Every module is
 * project-scoped, so this is a real state, not an edge case — a brand-new
 * account lands here.
 */
export function NoProject({ what }: { what: string }) {
  return (
    <Card className="rounded-r12">
      <EmptyState
        icon={FolderOpen}
        title="No project selected"
        description={`Create or select a project in the sidebar to start its ${what}.`}
      />
    </Card>
  );
}
