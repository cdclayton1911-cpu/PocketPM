import { ProjectDocumentsClient } from "@/components/project-documents/ProjectDocumentsClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function ProjectDocumentsPage() {
  const { activeProject, items } = await loadModuleData("project_documents");
  if (!activeProject) return <NoProject what="project documents" />;
  return <ProjectDocumentsClient projectId={activeProject.id} initialData={items} />;
}
