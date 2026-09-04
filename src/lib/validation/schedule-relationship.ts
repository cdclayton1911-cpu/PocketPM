import { z } from "zod";

import { SCHEDULE_RELATIONSHIP_TYPE } from "@/types";

/**
 * A typed dependency between two activities.
 *
 * `predecessor` and `successor` are accepted from the body — unlike most
 * relations in this app, which are injected server-side. That is safe because
 * PocketBase's own rule requires both endpoints to belong to the same project
 * as the relationship, so naming an activity in another project is refused by
 * the database rather than by this schema.
 *
 * What the rule cannot check is a cycle, which is handled in the route.
 */
export const scheduleRelationshipSchema = z.object({
  predecessor: z.string().trim().min(1, "Predecessor is required").max(20),
  successor: z.string().trim().min(1, "Successor is required").max(20),
  type: z.enum(SCHEDULE_RELATIONSHIP_TYPE).optional(),
  // Negative is a lead, which is ordinary. Bounded to catch a fat finger
  // rather than to express a rule about schedules.
  lag_days: z.coerce.number().int().min(-365).max(365).optional(),
  notes: z.string().trim().max(500).optional().default(""),
});

/** Endpoints are never edited — delete the edge and draw the right one. */
export const scheduleRelationshipUpdateSchema = z.strictObject({
  type: z.enum(SCHEDULE_RELATIONSHIP_TYPE).optional(),
  lag_days: z.coerce.number().int().min(-365).max(365).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type ScheduleRelationshipInput = z.infer<typeof scheduleRelationshipSchema>;
