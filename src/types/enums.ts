// GENERATED — do not edit by hand.
// Source: docs/pb_schema.json  ·  Regenerate: npm run generate:types
//
// Every `select` field in the schema, as a const tuple plus a derived union.
// One definition drives type checking, <Select> option lists, and Zod enums.
//
// Values are verbatim from the schema. Some contain spaces ("on hold",
// "in progress") while most are snake_case — that is the schema, not a typo.

/** `aia_notices.status` */
export const AIA_NOTICE_STATUS = [
  "upcoming",
  "pending",
  "sent",
  "overdue",
  "waived",
  "resolved",
] as const;
export type AiaNoticeStatus = (typeof AIA_NOTICE_STATUS)[number];

/** `change_orders.type` */
export const CHANGE_ORDER_TYPE = [
  "PCO",
  "CO",
  "CCD",
  "ASI",
] as const;
export type ChangeOrderType = (typeof CHANGE_ORDER_TYPE)[number];

/** `change_orders.reason` */
export const CHANGE_ORDER_REASON = [
  "owner_directed",
  "design_error",
  "design_omission",
  "differing_site",
  "code_compliance",
  "unforeseen",
  "weather",
  "other",
] as const;
export type ChangeOrderReason = (typeof CHANGE_ORDER_REASON)[number];

/** `change_orders.status` */
export const CHANGE_ORDER_STATUS = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "void",
] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUS)[number];

/** `deficiencies.severity` */
export const DEFICIENCY_SEVERITY = [
  "minor",
  "major",
  "life_safety",
] as const;
export type DeficiencySeverity = (typeof DEFICIENCY_SEVERITY)[number];

/** `deficiencies.status` */
export const DEFICIENCY_STATUS = [
  "open",
  "in_progress",
  "closed",
  "escalated",
  "void",
] as const;
export type DeficiencyStatus = (typeof DEFICIENCY_STATUS)[number];

/** `dfow.phase` */
export const DFOW_PHASE = [
  "not_started",
  "preparatory",
  "initial",
  "follow_up",
  "complete",
] as const;
export type DfowPhase = (typeof DFOW_PHASE)[number];

/** `drawings.discipline` */
export const DRAWING_DISCIPLINE = [
  "architectural",
  "structural",
  "mechanical",
  "electrical",
  "plumbing",
  "fire_protection",
  "civil",
  "landscape",
  "other",
] as const;
export type DrawingDiscipline = (typeof DRAWING_DISCIPLINE)[number];

/** `drawings.status` */
export const DRAWING_STATUS = [
  "current",
  "superseded",
  "voided",
  "addendum",
] as const;
export type DrawingStatus = (typeof DRAWING_STATUS)[number];

/** `invitations.role` */
export const INVITATION_ROLE = [
  "owner",
  "manager",
  "member",
  "viewer",
] as const;
export type InvitationRole = (typeof INVITATION_ROLE)[number];

/** `pay_applications.status` */
export const PAY_APPLICATION_STATUS = [
  "draft",
  "submitted",
  "certified",
  "paid",
  "disputed",
] as const;
export type PayApplicationStatus = (typeof PAY_APPLICATION_STATUS)[number];

/** `projects.status` */
export const PROJECT_STATUS = [
  "bidding",
  "preconstruction",
  "active",
  "closeout",
  "complete",
  "archived",
  "on_hold",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

/** `projects.contract_type` */
export const PROJECT_CONTRACT_TYPE = [
  "A101",
  "A102",
  "A103",
  "A133",
  "Other",
] as const;
export type ProjectContractType = (typeof PROJECT_CONTRACT_TYPE)[number];

/** `punch_list.priority` */
export const PUNCH_LIST_ITEM_PRIORITY = [
  "low",
  "medium",
  "high",
  "life_safety",
] as const;
export type PunchListItemPriority = (typeof PUNCH_LIST_ITEM_PRIORITY)[number];

/** `punch_list.status` */
export const PUNCH_LIST_ITEM_STATUS = [
  "open",
  "in_progress",
  "complete",
  "void",
] as const;
export type PunchListItemStatus = (typeof PUNCH_LIST_ITEM_STATUS)[number];

/** `rfis.status` */
export const RFI_STATUS = [
  "draft",
  "open",
  "answered",
  "closed",
  "void",
] as const;
export type RfiStatus = (typeof RFI_STATUS)[number];

/** `rfis.cost_impact` */
export const RFI_COST_IMPACT = [
  "unknown",
  "none",
  "potential",
  "confirmed",
] as const;
export type RfiCostImpact = (typeof RFI_COST_IMPACT)[number];

/** `rfis.sched_impact` */
export const RFI_SCHED_IMPACT = [
  "none",
  "potential",
  "confirmed",
] as const;
export type RfiSchedImpact = (typeof RFI_SCHED_IMPACT)[number];

/** `rfis.priority` */
export const RFI_PRIORITY = [
  "standard",
  "urgent",
  "critical",
] as const;
export type RfiPriority = (typeof RFI_PRIORITY)[number];

/** `safety_observations.type` */
export const SAFETY_OBSERVATION_TYPE = [
  "observation",
  "near_miss",
  "recordable",
  "first_aid",
  "toolbox_talk",
] as const;
export type SafetyObservationType = (typeof SAFETY_OBSERVATION_TYPE)[number];

/** `safety_observations.severity` */
export const SAFETY_OBSERVATION_SEVERITY = [
  "minor",
  "moderate",
  "serious",
  "critical",
] as const;
export type SafetyObservationSeverity = (typeof SAFETY_OBSERVATION_SEVERITY)[number];

/** `safety_observations.status` */
export const SAFETY_OBSERVATION_STATUS = [
  "open",
  "corrected",
  "closed",
  "escalated",
] as const;
export type SafetyObservationStatus = (typeof SAFETY_OBSERVATION_STATUS)[number];

/** `schedule_items.status` */
export const SCHEDULE_ITEM_STATUS = [
  "not_started",
  "in_progress",
  "complete",
  "at_risk",
  "delayed",
  "critical",
] as const;
export type ScheduleItemStatus = (typeof SCHEDULE_ITEM_STATUS)[number];

/** `subcontractors.status` */
export const SUBCONTRACTOR_STATUS = [
  "qualified",
  "renewal_due",
  "pending_docs",
  "disqualified",
  "inactive",
] as const;
export type SubcontractorStatus = (typeof SUBCONTRACTOR_STATUS)[number];

/** `subcontractors.a401_status` */
export const SUBCONTRACTOR_A401_STATUS = [
  "pending",
  "executed",
  "not_executed",
  "terminated",
] as const;
export type SubcontractorA401Status = (typeof SUBCONTRACTOR_A401_STATUS)[number];

/** `submittals.type` */
export const SUBMITTAL_TYPE = [
  "shop_drawing",
  "product_data",
  "sample",
  "certificate",
  "warranty",
  "other",
] as const;
export type SubmittalType = (typeof SUBMITTAL_TYPE)[number];

/** `submittals.disposition` */
export const SUBMITTAL_DISPOSITION = [
  "pending",
  "pending_ae",
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
  "void",
  "overdue",
] as const;
export type SubmittalDisposition = (typeof SUBMITTAL_DISPOSITION)[number];

/** `tasks.status` */
export const TASK_STATUS = [
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

/** `tasks.priority` */
export const TASK_PRIORITY = [
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

/** `users.role` */
export const USER_ROLE = [
  "owner",
  "manager",
  "member",
  "viewer",
] as const;
export type UserRole = (typeof USER_ROLE)[number];
