import { notFound } from "next/navigation";

import { EntityDetail } from "@/components/workflows/EntityDetail";
import { createClient } from "@/lib/pocketbase";
import { requireSession } from "@/lib/session";
import type { Submittal } from "@/types";

export default async function SubmittalDetailPage({ params }: PageProps<"/submittals/[id]">) {
  const { id } = await params;
  const session = await requireSession(`/submittals/${id}`);
  const pb = createClient(session.token);

  // Fetched as the user, so a submittal in someone else's project 404s here
  // rather than rendering a shell the workflow panel would then fail against.
  let record: Submittal;
  try {
    record = await pb.collection("submittals").getOne<Submittal>(id);
  } catch {
    notFound();
  }

  return (
    <EntityDetail
      entityType="submittal"
      entityId={record.id}
      currentUserId={session.user.id}
      backHref="/submittals"
      title={record.submittal_number}
      subtitle={record.description}
      fields={[
        { label: "Type", value: record.type },
        { label: "Disposition", value: record.disposition },
        { label: "Spec section", value: record.spec_section },
        { label: "A/E due", value: record.ae_due_date?.slice(0, 10) },
      ]}
    />
  );
}
