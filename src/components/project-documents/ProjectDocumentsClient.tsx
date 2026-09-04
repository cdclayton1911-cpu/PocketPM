"use client";

import { AlertTriangle, Download, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { categoryLabel } from "@/lib/enum-labels";
import { cn } from "@/lib/utils";
import { PROJECT_DOCUMENT_CATEGORY, type ProjectDocument } from "@/types";

import { ProjectDocumentDialog } from "./ProjectDocumentDialog";

export const projectDocumentHooks = createCollectionHooks({
  collection: "project_documents",
  path: "project-documents",
  label: "document",
  titleField: "title",
});

const FILTERS = [
  { value: "current", label: "Current only" },
  { value: "all", label: "All documents" },
  { value: "superseded", label: "Superseded" },
  ...PROJECT_DOCUMENT_CATEGORY.map((c) => ({ value: c, label: categoryLabel(c) })),
] as const;

type Filter = (typeof FILTERS)[number]["value"];

export function ProjectDocumentsClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: ProjectDocument[];
}) {
  const query = projectDocumentHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("current");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectDocument | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "current") return data.filter((d) => d.is_current && !d.superseded_by);
    if (filter === "superseded") return data.filter((d) => d.superseded_by || !d.is_current);
    return data.filter((d) => d.category === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const current = data.filter((d) => d.is_current && !d.superseded_by);
    const superseded = data.filter((d) => d.superseded_by);
    const missingFile = data.filter((d) => !d.file);
    const contracts = data.filter((d) => d.category === "contract");
    return [
      { label: "Documents", value: data.length, sub: `${contracts.length} contract${contracts.length === 1 ? "" : "s"}` },
      { label: "Current", value: current.length, tone: "success" as const },
      {
        label: "Superseded",
        value: superseded.length,
        sub: superseded.length ? "Do not build from these" : "None",
        tone: superseded.length ? ("caution" as const) : undefined,
      },
      {
        label: "Missing file",
        value: missingFile.length,
        // A register entry with no document is a promise the system cannot keep.
        tone: missingFile.length ? ("danger" as const) : ("success" as const),
        sub: missingFile.length ? "Logged but not uploaded" : "All uploaded",
      },
    ];
  }, [data]);

  const byId = useMemo(() => new Map(data.map((d) => [d.id, d])), [data]);

  const columns: Column<ProjectDocument>[] = [
    {
      key: "title",
      header: "Document",
      cell: (d) => (
        <span className="flex flex-col">
          <span className={cn("font-medium", d.superseded_by && "line-through opacity-70")}>{d.title}</span>
          {d.superseded_by ? (
            <span className="text-[11px] text-caution">
              Superseded by {byId.get(d.superseded_by)?.title ?? "another document"}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "category", header: "Category", cell: (d) => (d.category ? categoryLabel(d.category) : "—") },
    { key: "num", header: "Number", cell: (d) => <span className="font-mono text-xs">{d.doc_number || "—"}</span> },
    { key: "rev", header: "Revision", cell: (d) => d.revision || "—" },
    { key: "issued", header: "Issued", cell: (d) => d.issued_date || "—" },
    {
      key: "status",
      header: "Status",
      cell: (d) =>
        d.superseded_by ? (
          <StatusBadge tone="caution">Superseded</StatusBadge>
        ) : d.is_current ? (
          <StatusBadge tone="success">Current</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Not current</StatusBadge>
        ),
    },
    {
      key: "file",
      header: "File",
      cell: (d) =>
        d.file ? (
          <a
            href={`/api/files/project_documents/${d.id}/${encodeURIComponent(d.file)}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Download className="size-3.5" aria-hidden /> Open
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-danger">
            <AlertTriangle className="size-3.5" aria-hidden /> Not uploaded
          </span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (d) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            setEditTarget(d);
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
      title="Project documents"
      query={query}
      columns={columns}
      rows={rows}
      rowKey={(d) => d.id}
      stats={stats}
      filters={FILTERS}
      filter={filter}
      onFilterChange={setFilter}
      onAdd={() => {
        setEditTarget(null);
        setDialogOpen(true);
      }}
      addLabel="File document"
      emptyIcon={FolderOpen}
      emptyTitle="No project documents yet"
      emptyDescription="The contract, the specs, the geotech report — the documents the whole job is built from."
      rowClassName={(d) => cn(d.superseded_by && "bg-caution-subtle/30")}
    >
      <ProjectDocumentDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        doc={editTarget}
        supersedeCandidates={data}
      />
    </CollectionView>
  );
}
