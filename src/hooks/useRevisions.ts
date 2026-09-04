"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { requestInit, type MutationInput } from "@/hooks/createCollectionHooks";
import type { FieldErrors } from "@/lib/validation/auth";
import type { DocumentRevision } from "@/types";

/**
 * Revision history for one submittal or RFI.
 *
 * Kept apart from createCollectionHooks because a revision list is scoped to a
 * parent rather than to the project, and because the lifecycle transitions
 * below are ordered operations rather than plain field writes.
 */

export type ParentType = "submittal" | "rfi";

export const revisionKeys = {
  list: (parentType: ParentType, parentId: string) =>
    ["document_revisions", parentType, parentId] as const,
};

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { errors?: FieldErrors };
  return data.errors?.form ?? Object.values(data.errors ?? {})[0] ?? "Something went wrong";
}

async function send(path: string, method: string, input: MutationInput): Promise<DocumentRevision> {
  const res = await fetch(path, requestInit(method, input));
  if (!res.ok) throw new Error(await readError(res));
  return ((await res.json()) as { record: DocumentRevision }).record;
}

export function useRevisions(parentType: ParentType, parentId: string) {
  return useQuery({
    queryKey: revisionKeys.list(parentType, parentId),
    queryFn: async (): Promise<DocumentRevision[]> => {
      const res = await fetch(`/api/document-revisions?${parentType}=${encodeURIComponent(parentId)}`);
      if (!res.ok) throw new Error(await readError(res));
      return ((await res.json()) as { items: DocumentRevision[] }).items;
    },
    enabled: Boolean(parentId),
  });
}

/** The next revision number for a parent: one past the highest already used. */
export function nextRevisionNumber(revisions: DocumentRevision[]): number {
  return revisions.reduce((max, r) => Math.max(max, r.revision_number + 1), 0);
}

function useRevisionMutation(parentType: ParentType, parentId: string) {
  const queryClient = useQueryClient();
  const key = revisionKeys.list(parentType, parentId);
  return {
    queryClient,
    key,
    /**
     * No optimistic write here.
     *
     * Elsewhere an optimistic row is a clear win. Here the transitions are
     * multi-step and rule-enforced — a revision the server refuses to freeze
     * would appear frozen for a moment, which is precisely the wrong thing to
     * imply about a document that is evidence. Refetching is honest.
     */
    resync: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}

/** Create the next revision, optionally with its file attached. */
export function useCreateRevision(parentType: ParentType, parentId: string) {
  const { resync } = useRevisionMutation(parentType, parentId);
  return useMutation({
    mutationFn: (input: MutationInput) => {
      // The parent is set here, not by the caller's form, so a revision cannot
      // be filed against a different record than the dialog is showing.
      if (input instanceof FormData) {
        input.set(parentType, parentId);
        return send("/api/document-revisions", "POST", input);
      }
      return send("/api/document-revisions", "POST", { ...input, [parentType]: parentId });
    },
    onSuccess: (record) => toast.success(`Rev ${record.revision_number} created`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create revision"),
    onSettled: () => void resync(),
  });
}

/** Edit a draft, or move an issued revision through its review states. */
export function useUpdateRevision(parentType: ParentType, parentId: string) {
  const { resync } = useRevisionMutation(parentType, parentId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MutationInput }) =>
      send(`/api/document-revisions/${id}`, "PATCH", input),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update revision"),
    onSettled: () => void resync(),
  });
}

/**
 * Issue a draft revision.
 *
 * Two writes, and the order is forced by the schema: a partial unique index
 * allows at most one `is_current` revision per parent, so the outgoing one must
 * be stood down *before* the new one is raised. Doing it the other way round
 * fails on the index.
 *
 * The outgoing revision is marked `superseded`, not deleted — it is the record
 * of what was issued and when, which is what a delay claim is argued from.
 */
export function useIssueRevision(parentType: ParentType, parentId: string) {
  const { resync } = useRevisionMutation(parentType, parentId);
  return useMutation({
    mutationFn: async ({
      revision,
      current,
      issuedBy,
    }: {
      revision: DocumentRevision;
      current?: DocumentRevision;
      issuedBy: string;
    }) => {
      if (current && current.id !== revision.id) {
        await send(`/api/document-revisions/${current.id}`, "PATCH", {
          is_current: false,
          status: "superseded",
        });
      }
      return send(`/api/document-revisions/${revision.id}`, "PATCH", {
        status: "submitted",
        is_current: true,
        issued_at: new Date().toISOString().slice(0, 10),
        ...(issuedBy ? { issued_by: issuedBy } : {}),
      });
    },
    onSuccess: (record) =>
      toast.success(`Rev ${record.revision_number} issued — it is now the current revision`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not issue revision"),
    onSettled: () => void resync(),
  });
}

/**
 * Attach a file to a brand-new submittal or RFI as its Rev 0.
 *
 * Called after the parent is created, because the revision needs the parent's
 * id. Two requests rather than one: the alternative is a bespoke endpoint that
 * creates both, and the failure here is benign and recoverable — the parent
 * exists, the file did not upload, and the user is told to add it from History.
 * That is a better trade than a second write path around the revision rules.
 *
 * The file lands on a revision, never on the parent's own `attachments` field.
 * That is the whole point: a submittal's document is Rev 0 of something, so the
 * history is right from the first upload instead of being reconstructed later.
 */
export async function createInitialRevision(
  parentType: ParentType,
  parentId: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.set(parentType, parentId);
  form.set("revision_number", "0");
  form.set("file", file);

  const res = await fetch("/api/document-revisions", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res));
}
