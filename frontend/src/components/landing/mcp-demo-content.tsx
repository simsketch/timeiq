import type { Ref } from "react";

const EXAMPLES = [
  {
    label: "Check availability",
    prompt: "When am I free Thursday afternoon?",
    tools: "get_profile → get_free_times",
    answer: "You have two open windows on Thursday, in your time zone (America/New_York). These fit your working hours and account for every connected calendar.",
    rows: [["1:00–2:30 pm", "90 minutes free"], ["3:30–5:00 pm", "90 minutes free"]],
    note: "Your existing events stay on your calendar.",
  },
  {
    label: "Find a group time",
    prompt: "Find 30 minutes with sam@example.com and priya@example.com next week.",
    tools: "get_free_times → find_time_with",
    answer: "I can email Sam and Priya a link to pick their times next week, with three suggestions from your free time. Shall I send it?",
    rows: [["30-minute meeting", "Sam + Priya"], ["Next week", "Collect availability by email"]],
    note: "Waiting for your confirmation before emailing anyone.",
  },
  {
    label: "What's this week",
    prompt: "What's on my calendar this week?",
    tools: "list_bookings → list_calendar_events",
    answer: "Three bookings and two soccer practices this week. Thursday is the busiest, with a 2 pm intro call before practice at 5:30.",
    rows: [["Thu 2:00 pm", "Intro call with Dana"], ["Thu 5:30 pm", "Soccer practice"]],
    note: "Read from every connected calendar.",
  },
  {
    label: "Add a schedule",
    prompt: "Add this to my calendar: band rehearsal Tuesdays 6–7 pm through December.",
    tools: "import_schedule_text",
    answer: "I added 7 band rehearsals, every Tuesday from 6 to 7 pm through December 15. They block your booking link at those times.",
    rows: [["Band rehearsal", "Tuesdays, 6–7 pm"], ["7 events", "Through Dec 15"]],
    note: "You can undo the import from TimeIQ.",
  },
];

export const MCP_EXAMPLE_COUNT = EXAMPLES.length;

export function McpDemoContent({
  selected = 0,
  onSelect,
  ref,
  announce = true,
  compact = false,
  title = "Your assistant + TimeIQ",
}: {
  selected?: number;
  onSelect?: (index: number) => void;
  ref?: Ref<HTMLDivElement>;
  /** Announce answer changes to screen readers; off while the demo plays itself. */
  announce?: boolean;
  compact?: boolean;
  title?: string;
}) {
  const example = EXAMPLES[selected];

  return (
    <div ref={ref} className={`glass glass-chroma min-w-0 rounded-[1.5rem] p-4 ${compact ? "" : "sm:p-6"}`}>
      <div className="flex items-center justify-between gap-3 border-b border-foreground/10 pb-4">
        <span className="text-sm font-semibold">{title}</span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Example chat</span>
      </div>
      {!compact && <div className="my-4 grid grid-cols-2 gap-2" aria-label="Example prompts">
        {EXAMPLES.map((item, index) => (
          <button
            key={item.label}
            type="button"
            disabled={!onSelect}
            aria-pressed={selected === index}
            aria-controls="mcp-demo-answer"
            onClick={onSelect ? () => onSelect(index) : undefined}
            className={`min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected === index ? "border-[hsl(var(--aurora-1))]/30 bg-[hsl(var(--aurora-1))]/10 text-foreground" : "border-foreground/10 bg-white/60 text-muted-foreground enabled:hover:bg-white"}`}
          >
            {item.label}
          </button>
        ))}
      </div>}
      <div id="mcp-demo-answer" aria-live={announce ? "polite" : "off"} aria-atomic="true" className={compact ? "mt-4 space-y-3" : "min-h-[29rem] space-y-4 sm:min-h-[25rem]"}>
        <div className="ml-5 rounded-2xl rounded-tr-sm bg-foreground px-4 py-3 text-sm leading-relaxed text-background sm:ml-10">
          <p className="mb-1 text-xs text-background/70">You</p>
          {example.prompt}
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-foreground/10 bg-white/80 p-4">
          <p className="mb-2 text-xs font-semibold text-[hsl(var(--aurora-1))]">TimeIQ</p>
          <p className="text-sm leading-relaxed">{compact && selected === 0 ? "Two openings on Thursday, across your connected calendars:" : example.answer}</p>
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
        {compact ? "Illustrative example with sample data. Your assistant’s wording will vary." : "Sample data. Choose a prompt to see how the tools work. Your assistant’s wording will vary."}
      </p>
    </div>
  );
}
