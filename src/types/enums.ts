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

/** `conflict_findings.conflict_class` */
export const CONFLICT_FINDING_CONFLICT_CLASS = [
  "E1",
  "E2",
  "E3",
  "E4",
  "E5",
] as const;
export type ConflictFindingConflictClass = (typeof CONFLICT_FINDING_CONFLICT_CLASS)[number];

/** `conflict_findings.conflict_subtype` */
export const CONFLICT_FINDING_CONFLICT_SUBTYPE = [
  "material_type",
  "material_thickness",
  "system_type",
  "frame_material",
  "dimension_spacing",
  "grade_standard",
  "performance_rating",
  "method_sequence",
  "beneficial_exceedance",
] as const;
export type ConflictFindingConflictSubtype = (typeof CONFLICT_FINDING_CONFLICT_SUBTYPE)[number];

/** `conflict_findings.precedence_class` */
export const CONFLICT_FINDING_PRECEDENCE_CLASS = [
  "precedence_resolvable",
  "precedence_ambiguous",
  "precedence_incorporated",
  "requires_clarification",
  "no_precedence_provision",
] as const;
export type ConflictFindingPrecedenceClass = (typeof CONFLICT_FINDING_PRECEDENCE_CLASS)[number];

/** `conflict_findings.taxonomy_version` */
export const CONFLICT_FINDING_TAXONOMY_VERSION = [
  "1.2",
] as const;
export type ConflictFindingTaxonomyVersion = (typeof CONFLICT_FINDING_TAXONOMY_VERSION)[number];

/** `conflict_findings.ai_severity_band` */
export const CONFLICT_FINDING_AI_SEVERITY_BAND = [
  "low",
  "medium",
  "high",
] as const;
export type ConflictFindingAiSeverityBand = (typeof CONFLICT_FINDING_AI_SEVERITY_BAND)[number];

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

/** `document_revisions.status` */
export const DOCUMENT_REVISION_STATUS = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "superseded",
] as const;
export type DocumentRevisionStatus = (typeof DOCUMENT_REVISION_STATUS)[number];

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

/** `precedence_provisions.scope` */
export const PRECEDENCE_PROVISION_RECORD_SCOPE = [
  "project_wide",
  "division_scoped",
  "external",
  "none_found",
] as const;
export type PrecedenceProvisionRecordScope = (typeof PRECEDENCE_PROVISION_RECORD_SCOPE)[number];

/** `precedence_provisions.taxonomy_version` */
export const PRECEDENCE_PROVISION_RECORD_TAXONOMY_VERSION = [
  "1.2",
] as const;
export type PrecedenceProvisionRecordTaxonomyVersion = (typeof PRECEDENCE_PROVISION_RECORD_TAXONOMY_VERSION)[number];

/** `precedence_provisions.source` */
export const PRECEDENCE_PROVISION_RECORD_SOURCE = [
  "human_supplied_and_confirmed",
] as const;
export type PrecedenceProvisionRecordSource = (typeof PRECEDENCE_PROVISION_RECORD_SOURCE)[number];

/** `project_documents.category` */
export const PROJECT_DOCUMENT_CATEGORY = [
  "contract",
  "specification",
  "drawing_set",
  "geotech",
  "report",
  "permit",
  "insurance",
  "submittal_package",
  "other",
] as const;
export type ProjectDocumentCategory = (typeof PROJECT_DOCUMENT_CATEGORY)[number];

/** `project_roles.role` */
export const PROJECT_ROLE_ROLE = [
  "owner",
  "owner_rep",
  "architect",
  "engineer",
  "project_manager",
  "superintendent",
  "subcontractor",
  "consultant",
  "inspector",
  "other",
] as const;
export type ProjectRoleRole = (typeof PROJECT_ROLE_ROLE)[number];

/** `project_roles.status` */
export const PROJECT_ROLE_STATUS = [
  "active",
  "inactive",
] as const;
export type ProjectRoleStatus = (typeof PROJECT_ROLE_STATUS)[number];

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

/** `schedule_imports.source_format` */
export const SCHEDULE_IMPORT_SOURCE_FORMAT = [
  "csv",
  "xer",
] as const;
export type ScheduleImportSourceFormat = (typeof SCHEDULE_IMPORT_SOURCE_FORMAT)[number];

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

/** `schedule_items.activity_type` */
export const SCHEDULE_ITEM_ACTIVITY_TYPE = [
  "task",
  "start_milestone",
  "finish_milestone",
  "level_of_effort",
] as const;
export type ScheduleItemActivityType = (typeof SCHEDULE_ITEM_ACTIVITY_TYPE)[number];

/** `schedule_items.constraint_type` */
export const SCHEDULE_ITEM_CONSTRAINT_TYPE = [
  "start_on",
  "start_on_or_after",
  "start_on_or_before",
  "finish_on",
  "finish_on_or_after",
  "finish_on_or_before",
  "mandatory_start",
  "mandatory_finish",
  "as_late_as_possible",
] as const;
export type ScheduleItemConstraintType = (typeof SCHEDULE_ITEM_CONSTRAINT_TYPE)[number];

/** `schedule_relationships.type` */
export const SCHEDULE_RELATIONSHIP_TYPE = [
  "FS",
  "SS",
  "FF",
  "SF",
] as const;
export type ScheduleRelationshipType = (typeof SCHEDULE_RELATIONSHIP_TYPE)[number];

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

/** `workflow_actions.action` */
export const WORKFLOW_ACTION_ACTION = [
  "approve",
  "reject",
  "comment",
  "reassign",
  "cancel",
  "start",
] as const;
export type WorkflowActionAction = (typeof WORKFLOW_ACTION_ACTION)[number];

/** `workflow_instances.status` */
export const WORKFLOW_INSTANCE_STATUS = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type WorkflowInstanceStatus = (typeof WORKFLOW_INSTANCE_STATUS)[number];

/** `workflow_steps.approver_mode` */
export const WORKFLOW_STEP_APPROVER_MODE = [
  "role",
  "specific_users",
  "any_of_users",
] as const;
export type WorkflowStepApproverMode = (typeof WORKFLOW_STEP_APPROVER_MODE)[number];

/** `workflow_steps.on_reject` */
export const WORKFLOW_STEP_ON_REJECT = [
  "return_to_previous",
  "return_to_start",
  "terminate",
] as const;
export type WorkflowStepOnReject = (typeof WORKFLOW_STEP_ON_REJECT)[number];

/** `workflow_templates.entity_type` */
export const WORKFLOW_TEMPLATE_ENTITY_TYPE = [
  "submittal",
  "rfi",
] as const;
export type WorkflowTemplateEntityType = (typeof WORKFLOW_TEMPLATE_ENTITY_TYPE)[number];
