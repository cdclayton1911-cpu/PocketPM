import { notFound } from "next/navigation";

import { EntityDetail } from "@/components/workflows/EntityDetail";
import { createClient } from "@/lib/pocketbase";
import { requireSession } from "@/lib/session";
import type { Rfi } from "@/types";

export default async function RfiDetailPage({ params }: PageProps<"/rfis/[id]">) {
  const { id } = await params;
  const session = await requireSession(`/rfis/${id}`);
  const pb = createClient(session.token);

  let record: Rfi;
  try {
    record = await pb.collection("rfis").getOne<Rfi>(id);
  } catch {
    notFound();
  }

  return (
    <EntityDetail
      entityType="rfi"
      entityId={record.id}
      currentUserId={session.user.id}
      backHref="/rfis"
      title={record.rfi_number}
      subtitle={record.subject}
      fields={[
        { label: "Status", value: record.status },
        { label: "Priority", value: record.priority },
        { label: "Cost impact", value: record.cost_impact },
        { label: "Due", value: record.due_date?.slice(0, 10) },
      ]}
    />
  );
}
