"use client";

/**
 * A labelled set of checkboxes whose checked labels become the AI input.
 *
 * The value sent is the label text, not a code: the prompts read better with
 * "Fall protection — work at height above 6 ft" than with "fall_protection",
 * and nothing persists these, so there is no schema to keep stable.
 */
export function CheckboxList({
  legend,
  options,
  selected,
  onChange,
  disabled,
}: {
  legend: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {legend}
      </legend>
      {options.map((option) => (
        <label key={option} className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 shrink-0 accent-primary"
            checked={selected.includes(option)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, option]
                  : selected.filter((value) => value !== option),
              )
            }
          />
          <span>{option}</span>
        </label>
      ))}
    </fieldset>
  );
}
