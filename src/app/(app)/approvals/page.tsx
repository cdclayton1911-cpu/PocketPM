import { ApprovalsInboxClient } from "@/components/workflows/ApprovalsInboxClient";
import { requireSession } from "@/lib/session";

export default async function ApprovalsPage() {
  // Not project-scoped on purpose: the inbox spans every project the user
  // belongs to, so switching the active project must not hide work.
  const session = await requireSession("/approvals");
  return <ApprovalsInboxClient currentUserId={session.user.id} />;
}
