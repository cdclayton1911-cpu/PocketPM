/**
 * Every `select` field defined in the backend `migrate.js`.
 *
 * Each is exported as a `const` tuple plus a derived union type, so the same
 * definition drives TypeScript checking, `<Select>` option lists, and Zod
 * enums — no second copy to drift out of sync.
 *
 * Values are transcribed verbatim from the migration. Do not "tidy" them:
 * `"on hold"` and `"in progress"` really do contain spaces, while most other
 * collections use snake_case.
 */

// ── Identity & access ────────────────────────────────────────────────────────

/** users.role, invitations.role */
export const USER_ROLES = ["owner", "manager", "member", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ── Projects ─────────────────────────────────────────────────────────────────

/** projects.status — note the space in "on hold" */
export const PROJECT_STATUSES = [
  "bidding",
  "preconstruction",
  "active",
  "closeout",
  "complete",
  "archived",
  "on hold",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** projects.contract_type */
export const CONTRACT_TYPES = ["A101", "A102", "A103", "A133", "Other"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

// ── Tasks ────────────────────────────────────────────────────────────────────

/** tasks.status — note the spaces */
export const TASK_STATUSES = ["todo", "in progress", "in review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** tasks.priority */
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// ── Subcontractors ───────────────────────────────────────────────────────────

/** subcontractors.status */
export const SUBCONTRACTOR_STATUSES = [
  "qualified",
  "renewal_due",
  "pending_docs",
  "disqualified",
  "inactive",
] as const;
export type SubcontractorStatus = (typeof SUBCONTRACTOR_STATUSES)[number];

/** subcontractors.a401_status */
export const A401_STATUSES = ["pending", "executed", "not_executed", "terminated"] as const;
export type A401Status = (typeof A401_STATUSES)[number];

// ── RFIs ─────────────────────────────────────────────────────────────────────

/** rfis.status */
export const RFI_STATUSES = ["draft", "open", "answered", "closed", "void"] as const;
export type RfiStatus = (typeof RFI_STATUSES)[number];

/** rfis.cost_impact */
export const COST_IMPACTS = ["unknown", "none", "potential", "confirmed"] as const;
export type CostImpact = (typeof COST_IMPACTS)[number];

/** rfis.sched_impact — same as cost_impact minus "unknown" */
export const SCHED_IMPACTS = ["none", "potential", "confirmed"] as const;
export type SchedImpact = (typeof SCHED_IMPACTS)[number];

/** rfis.priority */
export const RFI_PRIORITIES = ["standard", "urgent", "critical"] as const;
export type RfiPriority = (typeof RFI_PRIORITIES)[number];

// ── Submittals ───────────────────────────────────────────────────────────────

/** submittals.type */
export const SUBMITTAL_TYPES = [
  "shop_drawing",
  "product_data",
  "sample",
  "certificate",
  "warranty",
  "other",
] as const;
export type SubmittalType = (typeof SUBMITTAL_TYPES)[number];

/** submittals.disposition */
export const SUBMITTAL_DISPOSITIONS = [
  "pending",
  "pending_ae",
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
  "void",
  "overdue",
] as const;
export type SubmittalDisposition = (typeof SUBMITTAL_DISPOSITIONS)[number];

// ── Punch list ───────────────────────────────────────────────────────────────

/** punch_list.priority — distinct from TASK_PRIORITIES */
export const PUNCH_PRIORITIES = ["low", "medium", "high", "life_safety"] as const;
export type PunchPriority = (typeof PUNCH_PRIORITIES)[number];

/** punch_list.status */
export const PUNCH_STATUSES = ["open", "in_progress", "complete", "void"] as const;
export type PunchStatus = (typeof PUNCH_STATUSES)[number];

// ── Change orders ────────────────────────────────────────────────────────────

/** change_orders.type */
export const CHANGE_ORDER_TYPES = ["PCO", "CO", "CCD", "ASI"] as const;
export type ChangeOrderType = (typeof CHANGE_ORDER_TYPES)[number];

/** change_orders.reason */
export const CHANGE_ORDER_REASONS = [
  "owner_directed",
  "design_error",
  "design_omission",
  "differing_site",
  "code_compliance",
  "unforeseen",
  "weather",
  "other",
] as const;
export type ChangeOrderReason = (typeof CHANGE_ORDER_REASONS)[number];

/** change_orders.status */
export const CHANGE_ORDER_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "void",
] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];

// ── Pay applications ─────────────────────────────────────────────────────────

/** pay_applications.status */
export const PAY_APP_STATUSES = [
  "draft",
  "submitted",
  "certified",
  "paid",
  "disputed",
] as const;
export type PayAppStatus = (typeof PAY_APP_STATUSES)[number];

// ── Schedule ─────────────────────────────────────────────────────────────────

/** schedule_items.status */
export const SCHEDULE_STATUSES = [
  "not_started",
  "in_progress",
  "complete",
  "at_risk",
  "delayed",
  "critical",
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

// ── Quality (CQM-C) ──────────────────────────────────────────────────────────

/** dfow.phase — the CQM-C three-phase inspection sequence */
export const DFOW_PHASES = [
  "not_started",
  "preparatory",
  "initial",
  "follow_up",
  "complete",
] as const;
export type DfowPhase = (typeof DFOW_PHASES)[number];

/** deficiencies.severity */
export const DEFICIENCY_SEVERITIES = ["minor", "major", "life_safety"] as const;
export type DeficiencySeverity = (typeof DEFICIENCY_SEVERITIES)[number];

/** deficiencies.status */
export const DEFICIENCY_STATUSES = [
  "open",
  "in_progress",
  "closed",
  "escalated",
  "void",
] as const;
export type DeficiencyStatus = (typeof DEFICIENCY_STATUSES)[number];

// ── Safety ───────────────────────────────────────────────────────────────────

/** safety_observations.type */
export const SAFETY_OBSERVATION_TYPES = [
  "observation",
  "near_miss",
  "recordable",
  "first_aid",
  "toolbox_talk",
] as const;
export type SafetyObservationType = (typeof SAFETY_OBSERVATION_TYPES)[number];

/** safety_observations.severity — distinct from DEFICIENCY_SEVERITIES */
export const SAFETY_SEVERITIES = ["minor", "moderate", "serious", "critical"] as const;
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number];

/** safety_observations.status */
export const SAFETY_STATUSES = ["open", "corrected", "closed", "escalated"] as const;
export type SafetyStatus = (typeof SAFETY_STATUSES)[number];

// ── Drawings ─────────────────────────────────────────────────────────────────

/** drawings.discipline — Title Case, unlike most other enums */
export const DISCIPLINES = [
  "Architectural",
  "Structural",
  "Mechanical",
  "Electrical",
  "Plumbing",
  "Fire Protection",
  "Civil",
  "Landscape",
  "Other",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

/** drawings.status */
export const DRAWING_STATUSES = ["current", "superseded", "voided", "addendum"] as const;
export type DrawingStatus = (typeof DRAWING_STATUSES)[number];

// ── AIA notices ──────────────────────────────────────────────────────────────

/** aia_notices.status */
export const NOTICE_STATUSES = [
  "upcoming",
  "pending",
  "sent",
  "overdue",
  "waived",
  "resolved",
] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];
