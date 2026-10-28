import { FieldError } from "@/components/field-error";

// Big tap-sized choices backed by real radio buttons, so they work with one
// thumb and with a keyboard or screen reader.
export function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  defaultValue,
  columns = 2,
  error,
  onChange,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string }[];
  defaultValue?: T | null;
  columns?: 2 | 3 | 4;
  error?: string;
  onChange?: (value: T) => void;
}) {
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className={`grid gap-2 ${grid}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-12 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-center text-base font-semibold transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={defaultValue === option.value}
              onChange={onChange ? () => onChange(option.value) : undefined}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}
