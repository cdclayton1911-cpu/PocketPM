import {
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  FolderOpen,
  FolderSearch,
  HardHat,
  Handshake,
  HelpCircle,
  LayoutGrid,
  Library,
  type LucideIcon,
  Microscope,
  Repeat,
  Ruler,
  ScrollText,
  Search,
  Sigma,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Count shown on the right of the item.
   *
   * Deliberately unset everywhere. The prototype hardcodes demo counts
   * (Submittals 4, RFIs 2, Deficiency 3, Change Orders 1, Risk Register 3);
   * shipping those would show numbers unrelated to the user's data. Populate
   * from real per-project counts once the modules can supply them.
   */
  badge?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The navigable modules, grouped as in prototype/pocket_pm_v9.html, with
 * prototype nav ids mapped to real App Router paths.
 *
 * 25 of the prototype's 27. Two are deliberately not listed because they have
 * no backing collection — see the inline notes below. Listing a module that
 * cannot store anything would be a menu entry that leads nowhere.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutGrid }],
  },
  {
    label: "Pre-Construction",
    items: [
      { href: "/project-documents", label: "Project Documents", icon: FolderOpen },
      { href: "/registry", label: "Submittal Registry", icon: Building2 },
      { href: "/prequal", label: "Prequalification", icon: ClipboardCheck },
    ],
  },
  {
    label: "Construction CM",
    items: [
      { href: "/documents", label: "Document Finder", icon: FolderSearch },
      { href: "/drawings", label: "Drawings", icon: Ruler },
      { href: "/submittals", label: "Submittals", icon: FileText },
      { href: "/rfis", label: "RFIs", icon: HelpCircle },
      { href: "/punch-list", label: "Punch List", icon: ClipboardCheck },
      { href: "/budget", label: "Budget & Cost", icon: DollarSign },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
    ],
  },
  {
    label: "Quality (CQM-C)",
    items: [
      { href: "/dfow", label: "DFOW Manager", icon: Search },
      // 3-Phase Inspection is intentionally absent: it has no backing
      // collection. The prototype's version was static HTML checkboxes, and
      // DFOW already tracks the preparatory/initial/follow-up phases it would
      // duplicate. See docs/schema-notes.md.
      { href: "/deficiency", label: "Deficiency Tracker", icon: AlertTriangle },
      { href: "/pdca", label: "PDCA Dashboard", icon: BarChart3 },
    ],
  },
  {
    label: "Estimating",
    items: [
      { href: "/estimating", label: "AI Estimating", icon: Sigma },
      { href: "/change-orders", label: "Change Orders", icon: Repeat },
      { href: "/pay-application", label: "Pay Application", icon: CreditCard },
    ],
  },
  {
    label: "AIA Contracts",
    items: [
      { href: "/aia/dashboard", label: "Contract Dashboard", icon: ScrollText },
      // Renamed from "Document Library": it holds no files at all — it is AI
      // briefings on standard AIA forms — and the old name collided with the
      // Document Finder, which does search real files. See docs/upload-audit.md.
      { href: "/aia/library", label: "AIA Forms Guide", icon: Library },
      { href: "/aia/scanner", label: "Clause Risk Scanner", icon: Microscope },
      { href: "/aia/register", label: "Risk Register", icon: AlertTriangle },
      { href: "/aia/notices", label: "Notices & Deadlines", icon: Bell },
      { href: "/aia/subcontracts", label: "Subcontracts", icon: Handshake },
      // Closeout Docs is intentionally absent: the `closeout_items` collection
      // named in the architecture PDF does not exist on the deployed
      // PocketBase, so there is nowhere to store the tracker's rows.
      // See docs/schema-notes.md.
    ],
  },
  {
    label: "Safety",
    items: [
      { href: "/osha", label: "OSHA Safety", icon: HardHat },
      { href: "/safety-plans", label: "Safety Plans", icon: Award },
    ],
  },
  {
    label: "AI Tools",
    items: [
      { href: "/assistant", label: "PM Assistant", icon: Bot },
      // Labelled "Daily Log", not the prototype's "Daily Log AI": the module is
      // CRUD-only until the AI modules have credits. See docs/ai.md.
      { href: "/daily-log", label: "Daily Log", icon: ClipboardList },
    ],
  },
];

/** Flat list, for title lookup. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * True when `href` is the section the current path belongs to.
 *
 * Uses a prefix match so nested routes (e.g. /registry/abc123) keep their parent
 * highlighted, with a "/" boundary check so /aia/register never matches
 * /aia/registry-something.
 */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Page title for a path.
 *
 * Longest match wins, so /aia/register resolves to "Risk Register" rather than
 * whichever /aia item happens to be listed first.
 */
export function titleForPath(pathname: string): string {
  const match = NAV_ITEMS.filter((item) => isActivePath(pathname, item.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.label ?? "Pocket PM";
}
