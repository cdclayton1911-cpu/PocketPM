/**
 * Base PocketBase record shapes.
 *
 * Source of truth: the backend `migrate.js` that seeds the collections.
 * These types describe records as PocketBase *returns* them.
 *
 * Note on optionality: PocketBase returns every schema field on every record,
 * using zero values ("" / 0 / []) rather than omitting unset fields. Read types
 * therefore mark fields as always-present. `required: true` in the migration
 * constrains *writes*, which is enforced by Zod schemas at the form/API
 * boundary rather than by these types.
 */

/** Fields PocketBase attaches to every record in a base collection. */
export interface BaseRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
}

/** Additional fields present on records in an `auth` collection. */
export interface AuthRecord extends BaseRecord {
  email: string;
  emailVisibility: boolean;
  verified: boolean;
}

/** Shape of a paginated PocketBase list response. */
export interface ListResult<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

/** Payload for creating a record: server-managed fields removed. */
export type RecordCreate<T extends BaseRecord> = Omit<T, keyof BaseRecord>;

/** Payload for updating a record: every writable field optional. */
export type RecordUpdate<T extends BaseRecord> = Partial<RecordCreate<T>>;

/**
 * Attach expanded relations to a record.
 *
 * @example
 * type SubmittalWithSub = Expanded<Submittal, { subcontractor: Subcontractor }>;
 */
export type Expanded<T, E extends Record<string, unknown>> = T & { expand: E };

/**
 * A relation field holding a single record id. Aliased for intent — these are
 * plain id strings until expanded via PocketBase's `expand` parameter.
 */
export type RelationId = string;

/** A relation field holding many record ids. */
export type RelationIds = string[];

/**
 * A file field. PocketBase stores the filename; build the served URL with
 * `${PB_URL}/api/files/${collectionId}/${recordId}/${filename}`.
 */
export type FileName = string;
