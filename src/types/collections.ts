// GENERATED — do not edit by hand.
// Source: docs/pb_schema.json  ·  Regenerate: npm run generate:types
//
// 20 application collections. The architecture PDF lists 21 and names
// closeout_items and contract_notices; neither exists on the deployed instance.
// See docs/schema-notes.md.
//
// Optionality: PocketBase returns every schema field on every record, using
// zero values ("" / 0 / []) rather than omitting them, so read types mark all
// fields present. `required` constrains writes and is noted in comments;
// enforce it with Zod at the form/API boundary.
//
// Every date field is `text` in the schema, so dates are strings, never Date.

import type {
  AuthRecord,
  BaseRecord,
  FileName,
  RelationId,
  RelationIds,
} from "./pocketbase";
import type {
  AiaNoticeStatus,
  ChangeOrderReason,
  ChangeOrderStatus,
  ChangeOrderType,
  DeficiencySeverity,
  DeficiencyStatus,
  DfowPhase,
  DocumentRevisionStatus,
  DrawingDiscipline,
  DrawingStatus,
  InvitationRole,
  PayApplicationStatus,
  ProjectContractType,
  ProjectStatus,
  PunchListItemPriority,
  PunchListItemStatus,
  RfiCostImpact,
  RfiPriority,
  RfiSchedImpact,
  RfiStatus,
  SafetyObservationSeverity,
  SafetyObservationStatus,
  SafetyObservationType,
  ScheduleItemStatus,
  SubcontractorA401Status,
  SubcontractorStatus,
  SubmittalDisposition,
  SubmittalType,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "./enums";

/**
 * `ai_sessions`
 * Required on create: project
 *
 * listRule: user = @request.auth.id
 */
export interface AiSession extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  user: RelationId; // -> users
  module: string;
  title: string;
  messages: string;
  tokens_used: number; // 0..*
}

/**
 * `aia_notices`
 * Required on create: project, notice_type
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface AiaNotice extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  notice_type: string; // required
  aia_article: string;
  trigger_event: string;
  trigger_date: string;
  notice_deadline: string;
  notice_sent_date: string;
  status: AiaNoticeStatus;
  description: string;
  ai_draft: string;
  notes: string;
  created_by: RelationId; // -> users
  attachments: FileName[]; // max 5, 50MB
}

/**
 * `budget_items`
 * Required on create: project, csi_division, description
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface BudgetItem extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  csi_division: string; // required
  description: string; // required
  budget: number; // 0..*
  committed: number; // 0..*
  actual: number; // 0..*
  pct_complete: number; // 0..100
  notes: string;
  sort_order: number;
}

/**
 * `change_orders`
 * Required on create: project, co_number, description
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface ChangeOrder extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  co_number: string; // required
  description: string; // required
  type: ChangeOrderType;
  initiated_by: string;
  reason: ChangeOrderReason;
  scope: string;
  amount: number;
  days_impact: number; // 0..*
  submitted_date: string;
  approved_date: string;
  status: ChangeOrderStatus;
  rfi_reference: RelationId; // -> rfis
  notes: string;
  created_by: RelationId; // -> users
  attachments: FileName[]; // max 5, 50MB
}

/**
 * `daily_logs`
 * Required on create: project, log_date
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface DailyLog extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  log_date: string; // required
  weather: string;
  temp_high: number;
  temp_low: number;
  total_workers: number; // 0..*
  work_performed: string;
  visitors: string;
  deliveries: string;
  equipment: string;
  issues: string;
  safety_notes: string;
  ai_generated: string;
  signed_by: string;
  signed_date: string;
  created_by: RelationId; // -> users
  attachments: FileName[]; // max 10, 10MB
}

/**
 * `deficiencies`
 * Required on create: project, description
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface Deficiency extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  dfow: RelationId; // -> dfow
  subcontractor: RelationId; // -> subcontractors
  def_number: string;
  description: string; // required
  location: string;
  trade: string;
  severity: DeficiencySeverity;
  code_reference: string;
  logged_date: string;
  due_date: string;
  closed_date: string;
  corrective_action: string;
  verified_by: string;
  status: DeficiencyStatus;
  logged_by: RelationId; // -> users
  photos: FileName[]; // max 5, 10MB
}

/**
 * `dfow`
 * Required on create: project, dfow_number, name
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface Dfow extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  subcontractor: RelationId; // -> subcontractors
  dfow_number: string; // required
  name: string; // required
  spec_sections: string;
  phase: DfowPhase;
  score: number; // 0..100
  planned_start: string;
  notes: string;
  prep_date: string;
  init_date: string;
  complete_date: string;
}

/**
 * `document_revisions`
 * Required on create: project
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface DocumentRevision extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  submittal: RelationId; // -> submittals
  rfi: RelationId; // -> rfis
  revision_number: number; // 0..*
  status: DocumentRevisionStatus;
  is_current: boolean;
  file: FileName; // max 1, 100MB
  issued_at: string;
  issued_by: string;
  stamped_by: string;
  stamped_at: string;
  review_due_at: string;
  notes: string;
  created_by: RelationId; // -> users
}

/**
 * `drawings`
 * Required on create: project, sheet_number, title
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface Drawing extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  sheet_number: string; // required
  title: string; // required
  discipline: DrawingDiscipline;
  revision: string;
  rev_date: string;
  status: DrawingStatus;
  notes: string;
  file: FileName; // max 1, 100MB
}

/**
 * `invitations`
 * Required on create: project, email, token
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface Invitation extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  email: string; // required
  invited_by: RelationId; // -> users
  token: string; // required
  role: InvitationRole;
  expires_at: string;
  accepted: boolean;
}

/**
 * `pay_applications`
 * Required on create: project, app_number
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface PayApplication extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  app_number: number; // required
  period_start: string;
  period_end: string;
  scheduled_value: number; // 0..*
  prev_billed: number; // 0..*
  this_period: number; // 0..*
  stored_materials: number; // 0..*
  total_to_date: number; // 0..*
  retainage_pct: number; // 0..100
  retainage_amount: number; // 0..*
  net_this_period: number; // 0..*
  status: PayApplicationStatus;
  submitted_date: string;
  certified_date: string;
  paid_date: string;
  notes: string;
  sov_json: string;
  created_by: RelationId; // -> users
}

/**
 * `projects`
 * Required on create: name, owner
 *
 * listRule: @request.auth.id != "" && (owner = @request.auth.id || members.id ?= @request.auth.id)
 */
export interface Project extends BaseRecord {
  name: string; // required
  description: string;
  owner: RelationId; // required, -> users
  members: RelationIds; // -> users
  status: ProjectStatus;
  owner_name: string;
  architect_name: string;
  contract_type: ProjectContractType;
  contract_value: number; // 0..*
  start_date: string;
  end_date: string;
  due_date: string;
  city: string;
  state: string;
  project_type: string;
  notes: string;
}

/**
 * `punch_list`
 * Required on create: project, description
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface PunchListItem extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  item_number: string;
  description: string; // required
  location: string;
  trade: string;
  subcontractor: RelationId; // -> subcontractors
  priority: PunchListItemPriority;
  status: PunchListItemStatus;
  due_date: string;
  closed_date: string;
  assigned_to: RelationId; // -> users
  notes: string;
  photos: FileName[]; // max 5, 10MB
}

/**
 * `rfis`
 * Required on create: project, rfi_number, subject, question
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface Rfi extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  rfi_number: string; // required
  subject: string; // required
  drawing: string;
  spec_section: string;
  question: string; // required
  ball_in_court: string;
  response_days: number; // 1..60
  submitted_date: string;
  due_date: string;
  answer: string;
  answer_date: string;
  status: RfiStatus;
  cost_impact: RfiCostImpact;
  cost_amount: number; // 0..*
  sched_impact: RfiSchedImpact;
  sched_days: number; // 0..*
  priority: RfiPriority;
  reference: string;
  created_by: RelationId; // -> users
  attachments: FileName[]; // max 5, 50MB
}

/**
 * `safety_observations`
 * Required on create: project, obs_date, description
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface SafetyObservation extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  subcontractor: RelationId; // -> subcontractors
  obs_date: string; // required
  description: string; // required
  location: string;
  trade: string;
  type: SafetyObservationType;
  severity: SafetyObservationSeverity;
  osha_reference: string;
  corrective_action: string;
  status: SafetyObservationStatus;
  reported_by: RelationId; // -> users
  photos: FileName[]; // max 5, 10MB
}

/**
 * `schedule_items`
 * Required on create: project, activity
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface ScheduleItem extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  activity_id: string;
  activity: string; // required
  planned_start: string;
  planned_finish: string;
  actual_start: string;
  actual_finish: string;
  forecast_finish: string;
  duration_days: number; // 0..*
  pct_complete: number; // 0..100
  status: ScheduleItemStatus;
  is_milestone: boolean;
  predecessors: string;
  notes: string;
  sort_order: number;
}

/**
 * `subcontractors`
 * Required on create: project, company_name, trade
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface Subcontractor extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  company_name: string; // required
  trade: string; // required
  status: SubcontractorStatus;
  license_number: string;
  license_expiry: string;
  insurance_expiry: string;
  bond_capacity: number; // 0..*
  emr: number; // 0..5
  quality_score: number; // 0..100
  a401_status: SubcontractorA401Status;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: string;
  state: string;
  notes: string;
  documents: FileName[]; // max 10, 50MB
}

/**
 * `submittals`
 * Required on create: project, submittal_number, description
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface Submittal extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  subcontractor: RelationId; // -> subcontractors
  submittal_number: string; // required
  description: string; // required
  spec_section: string;
  type: SubmittalType;
  submitted_date: string;
  ae_due_date: string;
  returned_date: string;
  disposition: SubmittalDisposition;
  revision: string;
  notes: string;
  created_by: RelationId; // -> users
  attachments: FileName[]; // max 10, 50MB
}

/**
 * `tasks`
 * Required on create: project, title
 *
 * listRule: @request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)
 */
export interface Task extends BaseRecord {
  project: RelationId; // required, -> projects, cascade delete
  title: string; // required
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: RelationId; // -> users
  start_date: string;
  due_date: string;
  tags: string;
  sort_order: number;
}

/**
 * `users` — auth collection
 * Required on create: username
 *
 * listRule: @request.auth.id != ""
 */
export interface User extends AuthRecord {
  username: string; // required
  name: string;
  avatar: FileName; // max 1, 5MB
  role: UserRole;
  company_name: string;
  phone: string;
}

/**
 * Maps each collection name to its record type, so API helpers can infer a
 * return type from the collection name alone.
 */
export interface Collections {
  ai_sessions: AiSession;
  aia_notices: AiaNotice;
  budget_items: BudgetItem;
  change_orders: ChangeOrder;
  daily_logs: DailyLog;
  deficiencies: Deficiency;
  dfow: Dfow;
  document_revisions: DocumentRevision;
  drawings: Drawing;
  invitations: Invitation;
  pay_applications: PayApplication;
  projects: Project;
  punch_list: PunchListItem;
  rfis: Rfi;
  safety_observations: SafetyObservation;
  schedule_items: ScheduleItem;
  subcontractors: Subcontractor;
  submittals: Submittal;
  tasks: Task;
  users: User;
}

/** Every valid collection name. */
export type CollectionName = keyof Collections;

/** The record type for a given collection name. */
export type RecordOf<K extends CollectionName> = Collections[K];
