import { DocumentFinder } from "@/components/documents/DocumentFinder";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function DocumentsPage() {
  // Only the active project is needed; the finder fetches its own results so
  // every filter change is a logged stage-1 query.
  const { activeProject } = await loadModuleData("document_revisions");
  if (!activeProject) return <NoProject what="document finder" />;
  return <DocumentFinder projectId={activeProject.id} />;
}
