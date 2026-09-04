"use client";

import { Building2, Mail, Phone, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { roleLabel } from "@/lib/enum-labels";
import { cn } from "@/lib/utils";
import { PROJECT_ROLE_ROLE, type ProjectRole } from "@/types";

import { ProjectRoleDialog } from "./ProjectRoleDialog";

export const projectRoleHooks = createCollectionHooks({
  collection: "project_roles",
  path: "project-roles",
  label: "party",
  titleField: "contact_name",
});

const FILTERS = [
  { value: "active", label: "Active" },
  { value: "external", label: "Outside parties" },
  { value: "all", label: "All" },
  ...PROJECT_ROLE_ROLE.map((r) => ({ value: r, label: roleLabel(r) })),
] as const;

type Filter = (typeof FILTERS)[number]["value"];

export function ProjectTeamClient({
  projectId,
  initialData,
  memberIds,
}: {
  projectId: string;
  initialData: ProjectRole[];
  /** Users with actual access, so the table can show role vs access separately. */
  memberIds: string[];
}) {
  const query = projectRoleHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectRole | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "active") return data.filter((r) => r.status !== "inactive");
    if (filter === "external") return data.filter((r) => r.is_external || !r.user);
    return data.filter((r) => r.role === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const active = data.filter((r) => r.status !== "inactive");
    const external = active.filter((r) => r.is_external || !r.user);
    const withAccess = active.filter((r) => r.user && memberIds.includes(r.user));
    const architect = active.find((r) => r.role === "architect");
    return [
      { label: "Parties", value: active.length },
      { label: "Outside parties", value: external.length, sub: external.length ? "No access to this project" : "None recorded" },
      { label: "With project access", value: withAccess.length, sub: `of ${active.length} recorded` },
      {
        label: "Architect",
        value: architect ? (architect.contact_name || "On team") : "—",
        tone: architect ? ("success" as const) : ("caution" as const),
        sub: architect ? undefined : "Submittals cannot route without one",
      },
    ];
  }, [data, memberIds]);

  const columns: Column<ProjectRole>[] = [
    {
      key: "who",
      header: "Name",
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{r.contact_name || (r.user ? "Team member" : "—")}</span>
          {r.company ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Building2 className="size-3" aria-hidden /> {r.company}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "role", header: "Role", cell: (r) => roleLabel(r.role) },
    {
      key: "contact",
      header: "Contact",
      cell: (r) => (
        <span className="flex flex-col text-[12px]">
          {r.contact_email ? (
            <span className="inline-flex items-center gap-1">
              <Mail className="size-3" aria-hidden /> {r.contact_email}
            </span>
          ) : null}
          {r.contact_phone ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Phone className="size-3" aria-hidden /> {r.contact_phone}
            </span>
          ) : null}
          {!r.contact_email && !r.contact_phone ? <span className="text-muted-foreground">—</span> : null}
        </span>
      ),
    },
    {
      key: "access",
      header: "Project access",
      cell: (r) =>
        r.user && memberIds.includes(r.user) ? (
          <StatusBadge tone="success">Can sign in</StatusBadge>
        ) : (
          // The distinction the whole design rests on: recorded ≠ admitted.
          <StatusBadge tone="neutral">Recorded only</StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            setEditTarget(r);
            setDialogOpen(true);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <CollectionView
      title="Project team"
      query={query}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      stats={stats}
      filters={FILTERS}
      filter={filter}
      onFilterChange={setFilter}
      onAdd={() => {
        setEditTarget(null);
        setDialogOpen(true);
      }}
      addLabel="Add party"
      emptyIcon={Users}
      emptyTitle="No parties recorded"
      emptyDescription="Who is the architect, the owner's rep, the engineer? Workflows route to these roles."
      rowClassName={(r) => cn(r.status === "inactive" && "opacity-60")}
      insights={
        <p className="rounded-r6 border-l-[3px] border-info bg-info-subtle px-3 py-2 text-[12px] text-info">
          Recording someone here does <strong>not</strong> give them access to this project. It
          records who they are and what they are responsible for. Granting access is a separate,
          deliberate act.
        </p>
      }
    >
      <ProjectRoleDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        role={editTarget}
      />
    </CollectionView>
  );
}
