"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Project } from "@/types";

import { ProjectDialog } from "./ProjectDialog";

interface ProjectSwitcherProps {
  projects: Project[];
  activeProject: Project | null;
}

export function ProjectSwitcher({ projects, activeProject }: ProjectSwitcherProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [switching, setSwitching] = useState(false);

  async function onSwitch(projectId: string) {
    if (!projectId || projectId === activeProject?.id) return;
    setSwitching(true);
    try {
      // Goes through the API rather than writing the cookie directly, so
      // membership is verified before the value is stored.
      const res = await fetch("/api/projects/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  // The first thing a new account sees — an empty dropdown would be a dead end.
  if (projects.length === 0) {
    return (
      <>
        <div className="rounded-r8 bg-accent p-2.5">
          <p className="text-[11px] font-semibold text-accent-foreground">No projects yet</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Create one to start working.
          </p>
          <Button
            size="sm"
            className="mt-2 h-7 w-full text-xs"
            onClick={() => {
              setEditTarget(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-3" aria-hidden /> Create project
          </Button>
        </div>
        <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} project={null} />
      </>
    );
  }

  const subtitle = [
    activeProject?.contract_type,
    activeProject?.city && activeProject?.state
      ? `${activeProject.city}, ${activeProject.state}`
      : activeProject?.city || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="rounded-r8 bg-accent p-2.5">
        <div className="truncate text-[11px] font-semibold text-accent-foreground">
          {activeProject?.name ?? "Select a project"}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>

      {projects.length > 1 ? (
        <label className="mt-2 block">
          <span className="sr-only">Switch project</span>
          <select
            value={activeProject?.id ?? ""}
            disabled={switching}
            onChange={(event) => onSwitch(event.target.value)}
            className="h-8 w-full rounded-r6 border border-input bg-card px-2 text-xs text-foreground disabled:opacity-50"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-2 flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 text-xs"
          onClick={() => {
            setEditTarget(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-3" aria-hidden /> New
        </Button>
        {activeProject ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-xs"
            onClick={() => {
              setEditTarget(activeProject);
              setDialogOpen(true);
            }}
          >
            <Pencil className="size-3" aria-hidden /> Edit
          </Button>
        ) : null}
      </div>

      <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editTarget} />
    </>
  );
}
