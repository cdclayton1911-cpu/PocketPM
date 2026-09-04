"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { FieldErrors } from "@/lib/validation/auth";
import type { BaseRecord, CollectionName, RecordOf } from "@/types";

/**
 * Query + optimistic mutation hooks for a project-scoped collection.
 *
 * The client-side twin of lib/crud-route.ts: that file removes the boilerplate
 * from 25 route handlers, this one removes it from 25 data layers. The Registry
 * (hooks/useSubcontractors.ts) is the worked example this generalises.
 *
 * TanStack Query 5.102 note: mutation callbacks take an extra trailing
 * `context`, and the onMutate return arrives as `onMutateResult`. The rollback
 * value is still the third positional argument to onError.
 */

/** Input a mutation accepts: plain fields, or FormData when files are attached. */
export type MutationInput = Record<string, unknown> | FormData;

/**
 * Build the fetch init for either shape.
 *
 * Content-Type is deliberately NOT set for FormData: the browser has to add it
 * itself so it can include the multipart boundary. Setting it by hand produces
 * a request the server cannot parse.
 */
function requestInit(method: string, input: MutationInput): RequestInit {
  if (input instanceof FormData) return { method, body: input };
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  };
}

/** Scalar fields only, for the optimistic row. Files have no local preview. */
function optimisticFields(input: MutationInput): Record<string, unknown> {
  if (!(input instanceof FormData)) return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of input.entries()) {
    if (typeof value === "string" && !key.endsWith("-")) out[key] = value;
  }
  return out;
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { errors?: FieldErrors };
  return data.errors?.form ?? Object.values(data.errors ?? {})[0] ?? "Something went wrong";
}

export interface CollectionHooksOptions {
  /** Collection name, also the API path segment. */
  collection: CollectionName;
  /** URL segment when it differs from the collection name, e.g. punch_list -> punch-list. */
  path?: string;
  /** Human singular, used in toasts: "RFI added". */
  label: string;
  /** Field to show in a success toast, e.g. "rfi_number". */
  titleField?: string;
}

export function createCollectionHooks<K extends CollectionName>(
  options: CollectionHooksOptions & { collection: K },
) {
  const { collection, label, titleField } = options;
  const path = options.path ?? collection;
  type Record_ = RecordOf<K>;

  const keys = {
    list: (projectId: string) => [collection, projectId] as const,
  };

  function useList(projectId: string, initialData?: Record_[]) {
    return useQuery({
      queryKey: keys.list(projectId),
      queryFn: async (): Promise<Record_[]> => {
        const res = await fetch(`/api/${path}`);
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { items: Record_[] };
        return data.items;
      },
      // Seeded by the server component, so the first paint has real rows. No
      // initialDataUpdatedAt: the server fetched during this same request, and
      // Date.now() in a render body is an impure call the compiler rejects.
      initialData,
      enabled: Boolean(projectId),
    });
  }

  /** Snapshot / rollback / resync, shared by both mutations. */
  function useOptimistic(projectId: string) {
    const queryClient = useQueryClient();
    const key = keys.list(projectId);
    return {
      queryClient,
      key,
      async snapshot() {
        // Stop an in-flight refetch from clobbering the optimistic value.
        await queryClient.cancelQueries({ queryKey: key });
        return queryClient.getQueryData<Record_[]>(key);
      },
      rollback(previous: Record_[] | undefined) {
        if (previous) queryClient.setQueryData(key, previous);
      },
      resync() {
        // Always refetch: on success this swaps the optimistic placeholder for
        // the server's real record (id, timestamps, defaults).
        void queryClient.invalidateQueries({ queryKey: key });
      },
    };
  }

  function useCreate(projectId: string) {
    const { queryClient, key, snapshot, rollback, resync } = useOptimistic(projectId);
    return useMutation({
      mutationFn: async (input: MutationInput): Promise<Record_> => {
        const res = await fetch(`/api/${path}`, requestInit("POST", input));
        if (!res.ok) throw new Error(await readError(res));
        return ((await res.json()) as { record: Record_ }).record;
      },
      onMutate: async (input) => {
        const previous = await snapshot();
        const optimistic = {
          ...optimisticFields(input),
          id: `optimistic-${Date.now()}`,
        } as unknown as Record_;
        queryClient.setQueryData<Record_[]>(key, (old) => [optimistic, ...(old ?? [])]);
        return { previous };
      },
      onError: (error, _input, onMutateResult) => {
        rollback(onMutateResult?.previous);
        toast.error(error instanceof Error ? error.message : `Could not add ${label}`);
      },
      onSuccess: (record) => {
        const name = titleField
          ? String((record as unknown as Record<string, unknown>)[titleField] ?? "")
          : "";
        toast.success(name ? `${name} added` : `${label} added`);
      },
      onSettled: resync,
    });
  }

  function useUpdate(projectId: string) {
    const { queryClient, key, snapshot, rollback, resync } = useOptimistic(projectId);
    return useMutation({
      mutationFn: async ({
        id,
        input,
      }: {
        id: string;
        input: MutationInput;
      }): Promise<Record_> => {
        const res = await fetch(`/api/${path}/${id}`, requestInit("PATCH", input));
        if (!res.ok) throw new Error(await readError(res));
        return ((await res.json()) as { record: Record_ }).record;
      },
      onMutate: async ({ id, input }) => {
        const previous = await snapshot();
        const fields = optimisticFields(input);
        queryClient.setQueryData<Record_[]>(key, (old) =>
          (old ?? []).map((row) =>
            (row as unknown as BaseRecord).id === id ? { ...row, ...fields } : row,
          ),
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

  return { keys, useList, useCreate, useUpdate };
}
