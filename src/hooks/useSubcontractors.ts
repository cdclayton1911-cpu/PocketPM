"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  optimisticFields,
  requestInit,
  type MutationInput,
} from "@/hooks/createCollectionHooks";
import type { FieldErrors } from "@/lib/validation/auth";
import type { Subcontractor } from "@/types";

/**
 * Data layer for the Registry — the pattern the other 25 modules copy.
 *
 * Note on TanStack Query 5.102: the mutation callbacks take an extra trailing
 * `context` argument, and what older examples call the onMutate "context" is
 * named `onMutateResult` here. The rollback value is still the third positional
 * argument to onError, which is all these use.
 */

/** Query key. Includes the project so switching projects refetches. */
export const subcontractorKeys = {
  list: (projectId: string) => ["subcontractors", projectId] as const,
};

interface ListResponse {
  items: Subcontractor[];
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { errors?: FieldErrors };
  return data.errors?.form ?? Object.values(data.errors ?? {})[0] ?? "Something went wrong";
}

export function useSubcontractors(projectId: string, initialData?: Subcontractor[]) {
  return useQuery({
    queryKey: subcontractorKeys.list(projectId),
    queryFn: async (): Promise<Subcontractor[]> => {
      const res = await fetch("/api/subcontractors");
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as ListResponse;
      return data.items;
    },
    // Seeded from the server component, so the first paint has real rows.
    //
    // No initialDataUpdatedAt: the server fetched this during the same request,
    // so TanStack's default of treating it as fresh-as-of-now is already
    // correct. Passing Date.now() here would also be an impure render-body call,
    // which the React Compiler rejects.
    initialData,
    enabled: Boolean(projectId),
  });
}

/** Shared optimistic-update plumbing: snapshot, roll back, always resync. */
function useOptimisticList(projectId: string) {
  const queryClient = useQueryClient();
  const key = subcontractorKeys.list(projectId);

  return {
    queryClient,
    key,
    async snapshot() {
      // Stop in-flight refetches from overwriting the optimistic value.
      await queryClient.cancelQueries({ queryKey: key });
      return queryClient.getQueryData<Subcontractor[]>(key);
    },
    rollback(previous: Subcontractor[] | undefined) {
      if (previous) queryClient.setQueryData(key, previous);
    },
    resync() {
      // Refetch regardless of outcome: on success it replaces the optimistic
      // placeholder with the server's real record (id, timestamps, defaults).
      void queryClient.invalidateQueries({ queryKey: key });
    },
  };
}

export function useCreateSubcontractor(projectId: string) {
  const { queryClient, key, snapshot, rollback, resync } = useOptimisticList(projectId);

  return useMutation({
    // MutationInput, not SubcontractorInput: a create carrying documents
    // arrives as FormData, which Zod has already validated on the way in.
    mutationFn: async (input: MutationInput): Promise<Subcontractor> => {
      const res = await fetch("/api/subcontractors", {
        ...requestInit("POST", input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { record: Subcontractor };
      return data.record;
    },
    onMutate: async (input) => {
      const previous = await snapshot();
      // Temporary row so the table updates immediately. The id is a placeholder
      // and is replaced by the server's record when resync() completes.
      // Scalars only: `input` may be FormData, where spreading yields nothing
      // and `input.status` is undefined rather than the submitted value.
      const fields = optimisticFields(input);
      const optimistic = {
        ...fields,
        id: `optimistic-${Date.now()}`,
        status: fields.status ?? "pending_docs",
      } as unknown as Subcontractor;
      queryClient.setQueryData<Subcontractor[]>(key, (old) => [optimistic, ...(old ?? [])]);
      return { previous };
    },
    onError: (error, _input, onMutateResult) => {
      rollback(onMutateResult?.previous);
      toast.error(error instanceof Error ? error.message : "Could not add subcontractor");
    },
    onSuccess: (record) => {
      toast.success(`${record.company_name} added`);
    },
    onSettled: resync,
  });
}

export function useUpdateSubcontractor(projectId: string) {
  const { queryClient, key, snapshot, rollback, resync } = useOptimisticList(projectId);

  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: MutationInput;
    }): Promise<Subcontractor> => {
      const res = await fetch(`/api/subcontractors/${id}`, {
        ...requestInit("PATCH", input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { record: Subcontractor };
      return data.record;
    },
    onMutate: async ({ id, input }) => {
      const previous = await snapshot();
      const fields = optimisticFields(input);
      queryClient.setQueryData<Subcontractor[]>(key, (old) =>
        (old ?? []).map((row) => (row.id === id ? { ...row, ...fields } : row)),
      );
      return { previous };
    },
    onError: (error, _vars, onMutateResult) => {
      rollback(onMutateResult?.previous);
      toast.error(error instanceof Error ? error.message : "Could not save changes");
    },
    onSettled: resync,
  });
}

/**
 * Soft delete: sets status to "inactive" rather than issuing a DELETE.
 *
 * Five collections reference subcontractors with cascadeDelete: false, so a hard
 * delete would leave those records pointing at nothing. This keeps the history
 * intact and is reversible from the Inactive filter.
 */
export function useDeactivateSubcontractor(projectId: string) {
  const update = useUpdateSubcontractor(projectId);
  return {
    ...update,
    deactivate: (id: string) => update.mutate({ id, input: { status: "inactive" } }),
  };
}
