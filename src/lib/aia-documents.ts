/**
 * The AIA forms this project's contract structure is built from.
 *
 * Reference data, carried over from the prototype's document library. Codes and
 * titles only — no clause text, no article numbers, and no claim about what any
 * of them say. The executed contract is the authority, and these forms are
 * routinely amended before signature.
 */
export interface AiaDocument {
  code: string;
  title: string;
  summary: string;
}

export interface AiaDocumentGroup {
  label: string;
  documents: AiaDocument[];
}

export const AIA_DOCUMENT_GROUPS: AiaDocumentGroup[] = [
  {
    label: "Owner–Contractor agreements (A-series)",
    documents: [
      {
        code: "A101",
        title: "Standard Form of Agreement — Stipulated Sum",
        summary: "Fixed-price lump sum. The most common form on commercial work.",
      },
      {
        code: "A102",
        title: "Standard Form of Agreement — Cost Plus with GMP",
        summary: "Cost-reimbursable with a guaranteed maximum price.",
      },
      {
        code: "A103",
        title: "Standard Form of Agreement — Cost Plus without GMP",
        summary: "Cost-reimbursable, no cap. Used for early procurement.",
      },
      {
        code: "A133",
        title: "Owner–CM as Constructor Agreement — GMP",
        summary: "CM at-risk delivery; the CM holds the subcontracts directly.",
      },
      {
        code: "A201",
        title: "General Conditions of the Contract",
        summary: "Incorporated by reference into A101/A102/A103. The rulebook.",
      },
      {
        code: "A401",
        title: "Contractor–Subcontractor Agreement",
        summary: "Flows the prime contract's obligations down to the subcontractor.",
      },
    ],
  },
  {
    label: "Contract administration (G-series)",
    documents: [
      { code: "G701", title: "Change Order", summary: "Executed change to sum, time, or scope." },
      {
        code: "G702",
        title: "Application and Certificate for Payment",
        summary: "The monthly pay application cover sheet.",
      },
      {
        code: "G703",
        title: "Continuation Sheet (Schedule of Values)",
        summary: "Line-item breakdown supporting G702.",
      },
      {
        code: "G710",
        title: "Architect's Supplemental Instructions",
        summary: "Minor change with no effect on sum or time.",
      },
      {
        code: "G714",
        title: "Construction Change Directive",
        summary: "Owner-directed change before the price is agreed.",
      },
      { code: "G716", title: "Request for Information", summary: "Formal request for clarification." },
    ],
  },
  {
    label: "Closeout (G-series)",
    documents: [
      {
        code: "G704",
        title: "Certificate of Substantial Completion",
        summary: "Starts warranties and shifts responsibility for the Work.",
      },
      {
        code: "G706",
        title: "Contractor's Affidavit of Payment of Debts and Claims",
        summary: "Sworn statement that payroll and suppliers are paid.",
      },
      {
        code: "G706A",
        title: "Contractor's Affidavit of Release of Liens",
        summary: "Sworn statement that liens are released.",
      },
      {
        code: "G707",
        title: "Consent of Surety to Final Payment",
        summary: "Surety's agreement to release of final payment and retainage.",
      },
    ],
  },
];
