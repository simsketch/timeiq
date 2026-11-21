import type { Ref } from "react";
import { useTranslations } from "next-intl";

// Copy lives in messages under landing.mcp.<key>; tools are real MCP tool names and stay as is.
const EXAMPLES = [
  { key: "availability", tools: "get_profile → get_free_times" },
  { key: "group", tools: "get_free_times → find_time_with" },
  { key: "week", tools: "list_bookings → list_calendar_events" },
  { key: "import", tools: "import_schedule_text" },
] as const;

export const MCP_EXAMPLE_COUNT = EXAMPLES.length;

export function McpDemoContent({
  selected = 0,
  onSelect,
  ref,
  announce = true,
  compact = false,
  title,
}: {
  selected?: number;
  onSelect?: (index: number) => void;
  ref?: Ref<HTMLDivElement>;
  /** Announce answer changes to screen readers; off while the demo plays itself. */
  announce?: boolean;
  compact?: boolean;
  title?: string;
}) {
  const t = useTranslations("landing.mcp");
  const { key, tools } = EXAMPLES[selected];
  const example = {
    prompt: t(`${key}.prompt`),
    answer: t(`${key}.answer`),
    rows: [[t(`${key}.row1Label`), t(`${key}.row1Value`)], [t(`${key}.row2Label`), t(`${key}.row2Value`)]],
    note: t(`${key}.note`),
    tools,
  };

  return (
    <div ref={ref} className={`glass glass-chroma min-w-0 rounded-[1.5rem] p-4 ${compact ? "" : "sm:p-6"}`}>
      <div className="flex items-center justify-between gap-3 border-b border-foreground/10 pb-4">
        <span className="text-sm font-semibold">{title ?? t("title")}</span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{t("badge")}</span>
      </div>
      {!compact && <div className="my-4 grid grid-cols-2 gap-2" aria-label={t("promptsLabel")}>
        {EXAMPLES.map((item, index) => (
          <button
            key={item.key}
            type="button"
            disabled={!onSelect}
            aria-pressed={selected === index}
            aria-controls="mcp-demo-answer"
            onClick={onSelect ? () => onSelect(index) : undefined}
            className={`min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected === index ? "border-[hsl(var(--aurora-1))]/30 bg-[hsl(var(--aurora-1))]/10 text-foreground" : "border-foreground/10 bg-white/60 text-muted-foreground enabled:hover:bg-white"}`}
          >
            {t(`${item.key}.label`)}
          </button>
        ))}
      </div>}
      <div id="mcp-demo-answer" aria-live={announce ? "polite" : "off"} aria-atomic="true" className={compact ? "mt-4 space-y-3" : "min-h-[29rem] space-y-4 sm:min-h-[25rem]"}>
        <div className="ml-5 rounded-2xl rounded-tr-sm bg-foreground px-4 py-3 text-sm leading-relaxed text-background sm:ml-10">
          <p className="mb-1 text-xs text-background/70">{t("you")}</p>
          {example.prompt}
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-foreground/10 bg-white/80 p-4">
          <p className="mb-2 text-xs font-semibold text-[hsl(var(--aurora-1))]">TimeIQ</p>
          <p className="text-sm leading-relaxed">{compact && selected === 0 ? t("compactAnswer") : example.answer}</p>
          <dl className="mt-4 divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-background/70 px-3">
            {example.rows.map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 text-xs">
                <dt className="font-semibold">{label}</dt>
                <dd className="text-muted-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{example.note}</p>
        </div>
        {!compact && <p className="break-words font-mono text-[11px] leading-relaxed text-muted-foreground">{example.tools}</p>}
      </div>
      <p className="mt-4 border-t border-foreground/10 pt-3 text-xs leading-relaxed text-muted-foreground">
        {compact ? t("compactNote") : t("note")}
      </p>
    </div>
  );
}
