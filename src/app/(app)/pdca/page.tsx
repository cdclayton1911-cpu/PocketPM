import { PdcaView } from "@/components/pdca/PdcaView";
import { NoProject } from "@/components/shared/NoProject";
import { loadAggregate } from "@/lib/aggregate";

const COLLECTIONS = ["dfow", "deficiencies", "subcontractors"] as const;

export default async function PdcaPage() {
  const { activeProject, data, failed } = await loadAggregate(COLLECTIONS);
  if (!activeProject) return <NoProject what="quality dashboard" />;
  return <PdcaView data={data} failed={failed} />;
}
