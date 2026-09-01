import { z } from "zod";

import { AIA_NOTICE_STATUS } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

export const aiaNoticeSchema = z.object({
  notice_type: z.string().trim().min(1, "Notice type is required").max(200),
  aia_article: z.string().trim().max(80).optional().default(""),
  trigger_event: z.string().trim().max(500).optional().default(""),
  trigger_date: isoDate.optional().default(""),
  notice_deadline: isoDate.optional().default(""),
  notice_sent_date: isoDate.optional().default(""),
  status: z.enum(AIA_NOTICE_STATUS).optional(),
  description: z.string().trim().max(5000).optional().default(""),
  // Populated by the AI notice drafter once that exists; editable meanwhile.
  ai_draft: z.string().trim().max(20000).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
});

export const aiaNoticeUpdateSchema = aiaNoticeSchema.partial();
export type AiaNoticeInput = z.infer<typeof aiaNoticeSchema>;
