import {
  DRAWING_DISCIPLINE,
  type DrawingDiscipline,
  type ProjectDocumentCategory,
  type ProjectRoleRole,
} from "@/types";

/**
 * Human labels for stored enum values.
 *
 * The rule: **the stored value is canonical lowercase snake_case; capitalisation
 * is presentation and lives here.** Application code, generated types,
 * PocketBase records, and any future retrieval metadata all use the same
 * representation, so a filter for `discipline = "fire_protection"` cannot miss
 * a record spelled `"Fire Protection"`.
 *
 * `drawings.discipline` used to be stored capitalised, with a space in
 * "Fire Protection". scripts/normalize-enums.mjs fixed the schema and the data;
 * this map is where the readable form went.
 *
 * Two enums are deliberately NOT here, because their stored form is already the
 * correct display form: `change_orders.type` (PCO, CO, CCD, ASI) and
 * `projects.contract_type` (A101, A102, A103, A133). Lowercasing an AIA form
 * number would not be normalisation, it would be an error.
 */
export const DISCIPLINE_LABEL: Record<DrawingDiscipline, string> = {
  architectural: "Architectural",
  structural: "Structural",
  mechanical: "Mechanical",
  electrical: "Electrical",
  plumbing: "Plumbing",
  fire_protection: "Fire Protection",
  civil: "Civil",
  landscape: "Landscape",
  other: "Other",
};

/** Falls back to the raw value, so an unmapped option shows rather than vanishing. */
export function disciplineLabel(value: string): string {
  return DISCIPLINE_LABEL[value as DrawingDiscipline] ?? value;
}

/** Options for a <select>, in schema order, as [value, label] pairs. */
export const DISCIPLINE_OPTIONS = DRAWING_DISCIPLINE.map(
  (value) => [value, DISCIPLINE_LABEL[value]] as const,
);

/** `project_documents.category`. Stored lowercase; shown properly here. */
export const CATEGORY_LABEL: Record<ProjectDocumentCategory, string> = {
  contract: "Contract",
  specification: "Specification",
  drawing_set: "Drawing Set",
  geotech: "Geotech",
  report: "Report",
  permit: "Permit",
  insurance: "Insurance",
  submittal_package: "Submittal Package",
  other: "Other",
};

export function categoryLabel(value: string): string {
  return CATEGORY_LABEL[value as ProjectDocumentCategory] ?? value;
}

/** `project_roles.role`. */
export const ROLE_LABEL: Record<ProjectRoleRole, string> = {
  owner: "Owner",
  owner_rep: "Owner's Rep",
  architect: "Architect",
  engineer: "Engineer",
  project_manager: "Project Manager",
  superintendent: "Superintendent",
  subcontractor: "Subcontractor",
  consultant: "Consultant",
  inspector: "Inspector",
  other: "Other",
};

export function roleLabel(value: string): string {
  return ROLE_LABEL[value as ProjectRoleRole] ?? value;
}
