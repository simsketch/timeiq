"use client";

/** Small building blocks shared by the calculators. */

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  min = 0,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  // Typed values can fall outside min/max (the browser doesn't enforce them), so flag it.
  const invalid = !Number.isFinite(value) || value < min || (max !== undefined && value > max);
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div
        className={`mt-1.5 flex items-center rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring ${
          invalid ? "border-destructive" : ""
        }`}
      >
        {prefix && <span className="pl-3 text-muted-foreground">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          className="w-full min-w-0 bg-transparent px-3 py-2.5 text-base tabular-nums outline-none"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          max={max}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
        {suffix && <span className="pr-3 text-sm text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Result({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-xl border bg-background/70 p-4">
      <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${big ? "text-3xl sm:text-4xl" : "text-2xl"} mt-1 font-semibold tabular-nums tracking-tight`}>{value}</div>
    </div>
  );
}

/** First message whose condition fails, so a calculator can explain instead of showing a bogus number. */
export function firstProblem(rules: [ok: boolean, message: string][]): string | null {
  return rules.find(([ok]) => !ok)?.[1] ?? null;
}

/** Inline note shown with the results when the inputs can't produce a real answer. */
export function InputProblem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </p>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="glass glass-chroma rounded-[1.5rem] p-6 sm:p-8">{children}</div>;
}

export const money = (n: number, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "—";

export const num = (n: number, digits = 0) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
