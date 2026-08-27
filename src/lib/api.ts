/**
 * Typed client for the Express proxy at NEXT_PUBLIC_API_URL.
 *
 * Every data operation goes through this proxy — auth, CRUD, and AI. The
 * browser never talks to PocketBase or Anthropic directly. This mirrors the
 * prototype's `_rail()` helper, with types added.
 *
 * Auth: callers pass a token explicitly. The token lives in an httpOnly cookie
 * that client JS cannot read, so requests originating in the browser go through
 * this app's own route handlers, which read the cookie and call these functions
 * server-side. See `lib/session.ts` for the cookie plumbing.
 */

import type {
  CollectionName,
  ListResult,
  RecordCreate,
  RecordOf,
  RecordUpdate,
  User,
} from "@/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.pocketpm.fyi";

/** An error response from the proxy, carrying the HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The session is invalid or expired — the caller should re-authenticate. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export interface RequestOptions {
  /** Bearer token. Omit for endpoints that do not require auth, e.g. login. */
  token?: string | null;
  signal?: AbortSignal;
  /** Passed through to fetch — e.g. `{ revalidate: 60 }` in server components. */
  next?: { revalidate?: number | false; tags?: string[] };
  cache?: RequestCache;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const { token, signal, next, cache } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    ...(next ? { next } : {}),
    ...(cache ? { cache } : {}),
  });

  // Some endpoints (DELETE) legitimately return an empty body.
  const text = await response.text();
  const payload: unknown = text ? safeParse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(payload, response.status), payload);
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const { error } = payload as { error: unknown };
    if (typeof error === "string") return error;
  }
  if (payload && typeof payload === "object" && "message" in payload) {
    const { message } = payload as { message: unknown };
    if (typeof message === "string") return message;
  }
  return `Request failed (${status})`;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: User;
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("POST", "/api/auth/login", { email, password });
}

export function refreshSession(token: string): Promise<AuthResponse> {
  return request<AuthResponse>("POST", "/api/auth/refresh", undefined, { token });
}

export function getCurrentUser(options: RequestOptions): Promise<User> {
  return request<User>("GET", "/api/auth/me", undefined, options);
}

// ── Generic collection CRUD ──────────────────────────────────────────────────

export interface ListParams {
  /** Scope results to one project. Nearly every collection is project-scoped. */
  projectId?: string;
  page?: number;
  perPage?: number;
  /** PocketBase sort expression, e.g. "-created" or "company_name". */
  sort?: string;
  /** PocketBase filter expression. */
  filter?: string;
  /** Relations to expand, comma-separated. */
  expand?: string;
}

function buildQuery(params: ListParams = {}): string {
  const query = new URLSearchParams();
  const { projectId, page, perPage, sort, filter, expand } = params;

  if (projectId) query.set("project_id", projectId);
  if (page !== undefined) query.set("page", String(page));
  if (perPage !== undefined) query.set("perPage", String(perPage));
  if (sort) query.set("sort", sort);
  if (filter) query.set("filter", filter);
  if (expand) query.set("expand", expand);

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

/** Collection names as they appear in the proxy's URLs (hyphenated, not snake_case). */
const ROUTE_SEGMENTS: Partial<Record<CollectionName, string>> = {
  punch_list: "punch-list",
  change_orders: "change-orders",
  pay_applications: "pay-applications",
  schedule_items: "schedule-items",
  daily_logs: "daily-logs",
  safety_observations: "safety-observations",
  aia_notices: "aia-notices",
  budget_items: "budget-items",
  ai_sessions: "ai-sessions",
};

function segment(collection: CollectionName): string {
  return ROUTE_SEGMENTS[collection] ?? collection;
}

export function apiList<K extends CollectionName>(
  collection: K,
  params: ListParams = {},
  options: RequestOptions = {},
): Promise<ListResult<RecordOf<K>>> {
  return request<ListResult<RecordOf<K>>>(
    "GET",
    `/api/${segment(collection)}${buildQuery(params)}`,
    undefined,
    options,
  );
}

export function apiGet<K extends CollectionName>(
  collection: K,
  id: string,
  options: RequestOptions = {},
): Promise<RecordOf<K>> {
  return request<RecordOf<K>>("GET", `/api/${segment(collection)}/${id}`, undefined, options);
}

export function apiCreate<K extends CollectionName>(
  collection: K,
  data: Partial<RecordCreate<RecordOf<K>>>,
  options: RequestOptions = {},
): Promise<RecordOf<K>> {
  return request<RecordOf<K>>("POST", `/api/${segment(collection)}`, data, options);
}

export function apiUpdate<K extends CollectionName>(
  collection: K,
  id: string,
  data: RecordUpdate<RecordOf<K>>,
  options: RequestOptions = {},
): Promise<RecordOf<K>> {
  return request<RecordOf<K>>("PATCH", `/api/${segment(collection)}/${id}`, data, options);
}

export function apiDelete<K extends CollectionName>(
  collection: K,
  id: string,
  options: RequestOptions = {},
): Promise<void> {
  return request<void>("DELETE", `/api/${segment(collection)}/${id}`, undefined, options);
}

// ── Projects ─────────────────────────────────────────────────────────────────

/**
 * Aggregate stats for the dashboard, from GET /api/projects/:id/dashboard.
 *
 * The proxy's exact response shape is not documented in the prototype or the
 * architecture PDF, so this is intentionally permissive. Narrow it once the
 * live response has been inspected — see the note in the dashboard module.
 */
export type ProjectDashboard = Record<string, unknown>;

export function getProjectDashboard(
  projectId: string,
  options: RequestOptions = {},
): Promise<ProjectDashboard> {
  return request<ProjectDashboard>(
    "GET",
    `/api/projects/${projectId}/dashboard`,
    undefined,
    options,
  );
}

export { request as apiRequest };
