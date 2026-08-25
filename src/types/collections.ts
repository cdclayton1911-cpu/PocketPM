/**
 * Record types for the PocketBase collections, transcribed from the backend
 * `migrate.js` that seeds them.
 *
 * IMPORTANT — 19 collections, not 21. The architecture PDF lists 21 and names
 * `closeout_items` and `contract_notices`, but neither exists in the migration.
 * They are deliberately absent here rather than invented. The AIA Closeout
 * module has no backing collection until that is resolved.
 *
 * All date fields are `text` in the schema, so they are `string` here (ISO-ish,
 * e.g. "2026-03-23"), never `Date`.
 *
 * Relations hold record ids. Use PocketBase's `expand` to resolve them, and the
 * `Expanded<>` helper in `./pocketbase` to type the result.
 */

import type {
  AuthRecord,
  BaseRecord,
  FileName,
  RelationId,
  RelationIds,
} from "./pocketbase";
import type {
  A401Status,
  ChangeOrderReason,
  ChangeOrderStatus,
  ChangeOrderType,
  ContractType,
  CostImpact,
  DeficiencySeverity,
  DeficiencyStatus,
  DfowPhase,
  Discipline,
  DrawingStatus,
  NoticeStatus,
  PayAppStatus,
  ProjectStatus,
  PunchPriority,
  PunchStatus,
  RfiPriority,
  RfiStatus,
  SafetyObservationType,
  SafetySeverity,
  SafetyStatus,
  SchedImpact,
  ScheduleStatus,
  SubcontractorStatus,
  SubmittalDisposition,
  SubmittalType,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "./enums";

// ── Identity & access ────────────────────────────────────────────────────────

/** `users` — auth collection. */
export interface User extends AuthRecord {
  name: string;
  role: UserRole;
  company_name: string;
  phone: string;
  avatar: FileName;
}

/** `invitations` — project invite tokens. Required: project, email, token. */
export interface Invitation extends BaseRecord {
  project: RelationId;
  email: string;
  invited_by: RelationId;
  token: string;
  role: UserRole;
  expires_at: string;
  accepted: boolean;
}

// ── Projects ─────────────────────────────────────────────────────────────────

/**
 * `projects` — the root entity; every other collection relates back to it.
 * Required: name, owner.
 *
 * Note `owner` (relation to a user) and `owner_name` (the client/owner org as
 * free text) are different things despite the similar names.
 */
export interface Project extends BaseRecord {
  name: string;
  description: string;
  owner: RelationId;
  members: RelationIds;
  status: ProjectStatus;
  owner_name: string;
  architect_name: string;
  contract_type: ContractType;
  contract_value: number;
  start_date: string;
  end_date: string;
  due_date: string;
  city: string;
  state: string;
  project_type: string;
  notes: string;
}

/** `tasks` — drives Kanban and Gantt views. Required: project, title. */
export interface Task extends BaseRecord {
  project: RelationId;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: RelationId;
  start_date: string;
  due_date: string;
  tags: string;
  sort_order: number;
}

// ── Pre-construction ─────────────────────────────────────────────────────────

/**
 * `subcontractors` — registry, prequalification, and compliance tracking.
 * Required: project, company_name, trade.
 */
export interface Subcontractor extends BaseRecord {
  project: RelationId;
  company_name: string;
  trade: string;
  status: SubcontractorStatus;
  license_number: string;
  license_expiry: string;
  insurance_expiry: string;
  bond_capacity: number;
  emr: number;
  quality_score: number;
  a401_status: A401Status;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: string;
  state: string;
  notes: string;
  documents: FileName[];
}

// ── Construction management ──────────────────────────────────────────────────

/** `rfis` — design clarification requests. Required: project, rfi_number, subject, question. */
export interface Rfi extends BaseRecord {
  project: RelationId;
  rfi_number: string;
  subject: string;
  drawing: string;
  spec_section: string;
  question: string;
  ball_in_court: string;
  response_days: number;
  submitted_date: string;
  due_date: string;
  answer: string;
  answer_date: string;
  status: RfiStatus;
  cost_impact: CostImpact;
  cost_amount: number;
  sched_impact: SchedImpact;
  sched_days: number;
  priority: RfiPriority;
  reference: string;
  created_by: RelationId;
  attachments: FileName[];
}

/** `submittals` — shop drawings, product data, samples. Required: project, submittal_number, description. */
export interface Submittal extends BaseRecord {
  project: RelationId;
  subcontractor: RelationId;
  submittal_number: string;
  description: string;
  spec_section: string;
  type: SubmittalType;
  submitted_date: string;
  ae_due_date: string;
  returned_date: string;
  disposition: SubmittalDisposition;
  revision: string;
  notes: string;
  created_by: RelationId;
  attachments: FileName[];
}

/** `punch_list` — closeout deficiency items. Required: project, description. */
export interface PunchListItem extends BaseRecord {
  project: RelationId;
  item_number: string;
  description: string;
  location: string;
  trade: string;
  subcontractor: RelationId;
  priority: PunchPriority;
  status: PunchStatus;
  due_date: string;
  closed_date: string;
  assigned_to: RelationId;
  notes: string;
  photos: FileName[];
}

/** `drawings` — sheet register. Required: project, sheet_number, title. */
export interface Drawing extends BaseRecord {
  project: RelationId;
  sheet_number: string;
  title: string;
  discipline: Discipline;
  revision: string;
  rev_date: string;
  status: DrawingStatus;
  notes: string;
  /** Single file, up to 100 MB. */
  file: FileName;
}

/** `schedule_items` — CPM activities. Required: project, activity. */
export interface ScheduleItem extends BaseRecord {
  project: RelationId;
  activity_id: string;
  activity: string;
  planned_start: string;
  planned_finish: string;
  actual_start: string;
  actual_finish: string;
  forecast_finish: string;
  duration_days: number;
  pct_complete: number;
  status: ScheduleStatus;
  is_milestone: boolean;
  predecessors: string;
  notes: string;
  sort_order: number;
}

/** `budget_items` — budget by CSI division. Required: project, csi_division, description. */
export interface BudgetItem extends BaseRecord {
  project: RelationId;
  csi_division: string;
  description: string;
  budget: number;
  committed: number;
  actual: number;
  pct_complete: number;
  notes: string;
  sort_order: number;
}

// ── Quality (CQM-C) ──────────────────────────────────────────────────────────

/** `dfow` — Definable Features of Work. Required: project, dfow_number, name. */
export interface Dfow extends BaseRecord {
  project: RelationId;
  subcontractor: RelationId;
  dfow_number: string;
  name: string;
  spec_sections: string;
  phase: DfowPhase;
  score: number;
  planned_start: string;
  notes: string;
  prep_date: string;
  init_date: string;
  complete_date: string;
}

/** `deficiencies` — items raised by three-phase inspection. Required: project, description. */
export interface Deficiency extends BaseRecord {
  project: RelationId;
  dfow: RelationId;
  subcontractor: RelationId;
  def_number: string;
  description: string;
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
  logged_by: RelationId;
  photos: FileName[];
}

// ── Financial ────────────────────────────────────────────────────────────────

/** `change_orders` — COs and PCOs. Required: project, co_number, description. */
export interface ChangeOrder extends BaseRecord {
  project: RelationId;
  co_number: string;
  description: string;
  type: ChangeOrderType;
  initiated_by: string;
  reason: ChangeOrderReason;
  scope: string;
  /** Signed — a deductive change order is negative. */
  amount: number;
  days_impact: number;
  submitted_date: string;
  approved_date: string;
  status: ChangeOrderStatus;
  rfi_reference: RelationId;
  notes: string;
  created_by: RelationId;
  attachments: FileName[];
}

/** `pay_applications` — AIA G702/G703. Required: project, app_number. */
export interface PayApplication extends BaseRecord {
  project: RelationId;
  app_number: number;
  period_start: string;
  period_end: string;
  scheduled_value: number;
  prev_billed: number;
  this_period: number;
  stored_materials: number;
  total_to_date: number;
  retainage_pct: number;
  retainage_amount: number;
  net_this_period: number;
  status: PayAppStatus;
  submitted_date: string;
  certified_date: string;
  paid_date: string;
  notes: string;
  /** G703 schedule-of-values line items, stored as a JSON string. */
  sov_json: string;
  created_by: RelationId;
}

// ── Safety ───────────────────────────────────────────────────────────────────

/** `safety_observations` — OSHA observations and near-miss log. Required: project, obs_date, description. */
export interface SafetyObservation extends BaseRecord {
  project: RelationId;
  subcontractor: RelationId;
  obs_date: string;
  description: string;
  location: string;
  trade: string;
  type: SafetyObservationType;
  severity: SafetySeverity;
  osha_reference: string;
  corrective_action: string;
  status: SafetyStatus;
  reported_by: RelationId;
  photos: FileName[];
}

// ── AIA contract administration ──────────────────────────────────────────────

/** `aia_notices` — formal notices and their deadlines. Required: project, notice_type. */
export interface AiaNotice extends BaseRecord {
  project: RelationId;
  notice_type: string;
  aia_article: string;
  trigger_event: string;
  trigger_date: string;
  notice_deadline: string;
  notice_sent_date: string;
  status: NoticeStatus;
  description: string;
  ai_draft: string;
  notes: string;
  created_by: RelationId;
  attachments: FileName[];
}

// ── Daily reporting & AI ─────────────────────────────────────────────────────

/** `daily_logs` — daily construction reports. Required: project, log_date. */
export interface DailyLog extends BaseRecord {
  project: RelationId;
  log_date: string;
  weather: string;
  temp_high: number;
  temp_low: number;
  total_workers: number;
  work_performed: string;
  visitors: string;
  deliveries: string;
  equipment: string;
  issues: string;
  safety_notes: string;
  /** The AI-written narrative, kept separate from the raw field inputs. */
  ai_generated: string;
  signed_by: string;
  signed_date: string;
  created_by: RelationId;
  attachments: FileName[];
}

/** `ai_sessions` — saved assistant threads. Required: project. */
export interface AiSession extends BaseRecord {
  project: RelationId;
  user: RelationId;
  /** Which module the thread came from, e.g. "assistant", "estimating". */
  module: string;
  title: string;
  /** Conversation turns, stored as a JSON string. */
  messages: string;
  tokens_used: number;
}

// ── Collection registry ──────────────────────────────────────────────────────

/**
 * Maps each collection name to its record type, so API helpers can infer the
 * return type from the collection name alone.
 */
export interface Collections {
  users: User;
  projects: Project;
  invitations: Invitation;
  tasks: Task;
  subcontractors: Subcontractor;
  rfis: Rfi;
  submittals: Submittal;
  punch_list: PunchListItem;
  change_orders: ChangeOrder;
  pay_applications: PayApplication;
  schedule_items: ScheduleItem;
  dfow: Dfow;
  deficiencies: Deficiency;
  daily_logs: DailyLog;
  safety_observations: SafetyObservation;
  drawings: Drawing;
  aia_notices: AiaNotice;
  budget_items: BudgetItem;
  ai_sessions: AiSession;
}

/** Every valid collection name. */
export type CollectionName = keyof Collections;

/** The record type for a given collection name. */
export type RecordOf<K extends CollectionName> = Collections[K];
