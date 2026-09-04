import { Label } from "@/components/ui/label";

/**
 * Labelled form control with an error slot.
 *
 * Shared by every dialog so field spacing, label styling, and error placement
 * stay identical across modules.
 */
export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * A plain <select>.
 *
 * Deliberately NOT shadcn's Select: that is a Radix listbox which renders no
 * native form control, so it does not appear in FormData. These dialogs read
 * values straight off the form, so they need a real <select>.
 *
 * `humanize` turns snake_case enum values into readable options while keeping
 * the submitted value exact.
 */
export function NativeSelect({
  options,
  humanize = true,
  labels,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly string[];
  humanize?: boolean;
  /**
   * Display text per value. Takes precedence over `humanize`.
   *
   * Exists so a stored value stays canonical while the option reads properly —
   * "fire_protection" is what is written, "Fire Protection" is what is shown.
   */
  labels?: Record<string, string>;
}) {
  return (
    <select
      {...props}
      className="h-9 w-full rounded-r6 border border-input bg-card px-2 text-sm text-foreground disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? (humanize ? option.replace(/_/g, " ") : option)}
        </option>
      ))}
    </select>
  );
}

/** Empty number inputs submit "", which would coerce to 0. Drop them instead. */
export function dropEmptyNumbers(raw: Record<string, string>, keys: string[]): Record<string, string> {
  const out = { ...raw };
  for (const key of keys) {
    if (out[key] === "") delete out[key];
  }
  return out;
}
