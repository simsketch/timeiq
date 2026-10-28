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
    label: "Log your hours",
    prompt: "Log 2 hours for Acme on the redesign today.",
    tools: "list_clients → log_time",
    answer: "Logged 2 hours for Acme today. You can find the entry in your TimeIQ timesheet, ready for your next invoice.",
    rows: [["Acme", "2 hours"], ["Redesign", "Added to today's timesheet"]],
    note: "Logged time stays unbilled until you create an invoice.",
  },
  {
    label: "Prepare an invoice",
    prompt: "Send Acme their unbilled invoice.",
    tools: "list_unbilled_time → create_invoice → send_invoice",
    answer: "Acme has 8 unbilled hours at $100/hour. I prepared an $800 draft from that time. Shall I email it to billing@acme.example?",
    rows: [["Acme · draft invoice", "$800.00 USD"], ["8 hours × $100", "billing@acme.example"]],
    note: "Waiting for your confirmation before sending the invoice.",
  },
];

export function McpDemoContent({ selected = 0, onSelect }: { selected?: number; onSelect?: (index: number) => void }) {
  const example = EXAMPLES[selected];

  return (
    <div className="glass glass-chroma min-w-0 rounded-[1.5rem] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-foreground/10 pb-4">
        <span className="text-sm font-semibold">Your assistant + TimeIQ</span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Example chat</span>
      </div>
      <div className="my-4 grid grid-cols-2 gap-2" aria-label="Example prompts">
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
      </div>
      <div id="mcp-demo-answer" aria-live="polite" aria-atomic="true" className="min-h-[28rem] space-y-4 sm:min-h-[25rem]">
        <div className="ml-5 rounded-2xl rounded-tr-sm bg-foreground px-4 py-3 text-sm leading-relaxed text-background sm:ml-10">
          <p className="mb-1 text-xs text-background/70">You</p>
          {example.prompt}
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-foreground/10 bg-white/80 p-4">
          <p className="mb-2 text-xs font-semibold text-[hsl(var(--aurora-1))]">TimeIQ</p>
          <p className="text-sm leading-relaxed">{example.answer}</p>
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
        <p className="break-words font-mono text-[11px] leading-relaxed text-muted-foreground">{example.tools}</p>
      </div>
      <p className="mt-4 border-t border-foreground/10 pt-3 text-xs leading-relaxed text-muted-foreground">
        Sample data. Choose a prompt to see how the tools work. Your assistant&apos;s wording will vary.
      </p>
    </div>
  );
}
