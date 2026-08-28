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
  FlagTriangleRight,
  HardHat,
  Handshake,
  HelpCircle,
  LayoutGrid,
  Library,
  type LucideIcon,
  Microscope,
  Notebook,
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
 * The 27 modules, grouped exactly as in prototype/pocket_pm_v9.html.
 * Prototype nav ids are mapped to the real App Router paths.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutGrid }],
  },
  {
    label: "Pre-Construction",
    items: [
      { href: "/registry", label: "Submittal Registry", icon: Building2 },
      { href: "/prequal", label: "Prequalification", icon: ClipboardCheck },
    ],
  },
  {
    label: "Construction CM",
    items: [
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
      { href: "/inspection", label: "3-Phase Inspection", icon: Notebook },
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
      { href: "/aia/library", label: "Document Library", icon: Library },
      { href: "/aia/scanner", label: "Clause Risk Scanner", icon: Microscope },
      { href: "/aia/register", label: "Risk Register", icon: AlertTriangle },
      { href: "/aia/notices", label: "Notices & Deadlines", icon: Bell },
      { href: "/aia/subcontracts", label: "Subcontracts", icon: Handshake },
      { href: "/aia/closeout", label: "Closeout Docs", icon: FlagTriangleRight },
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
      { href: "/daily-log", label: "Daily Log AI", icon: ClipboardList },
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
