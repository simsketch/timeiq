import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Code2, ShieldCheck, Users } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { McpDemo } from "@/components/landing/mcp-demo";
import { McpDemoContent } from "@/components/landing/mcp-demo-content";
import styles from "./setup.module.css";

const TITLE = "Use TimeIQ inside Claude, ChatGPT and Cursor";
const DESCRIPTION = "Check your availability, find group meeting times, import schedules, log hours and prepare invoices from your AI assistant. Connect TimeIQ with MCP.";
const MCP_URL = "https://api.timeiq.app/mcp";
const CODE_COMMAND = `claude mcp add --transport http timeiq ${MCP_URL}`;
const TOKEN_COMMAND = `${CODE_COMMAND} --header "Authorization: Bearer YOUR_TIMEIQ_TOKEN"`;
const CURSOR_CONFIG = JSON.stringify({ mcpServers: { timeiq: { url: MCP_URL, headers: { Authorization: "Bearer YOUR_TIMEIQ_TOKEN" } } } }, null, 2);

export const metadata: Metadata = {
  title: `${TITLE} | TimeIQ`,
  description: DESCRIPTION,
  alternates: { canonical: "https://timeiq.app/mcp" },
  openGraph: {
    type: "website",
    url: "https://timeiq.app/mcp",
    siteName: "TimeIQ",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TimeIQ: all your calendars, one booking link" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.png"] },
};

// Keep these names and descriptions aligned with backend/app/mcp_server.py.
const TOOL_GROUPS = [
  {
    title: "Availability & bookings",
    icon: CalendarDays,
    description: "Check your real free time across connected calendars and working hours.",
    tools: [
      ["get_profile", "Get your name, time zone and public booking link."],
      ["get_free_times", "Find open windows over the next 5, 7 or 14 days, with a minimum length."],
      ["list_event_types", "Get your meeting types, durations, locations and booking links."],
      ["list_bookings", "List your confirmed or cancelled bookings."],
      ["cancel_booking", "Cancel a booking, email the guest and withdraw the invite after confirmation."],
    ],
  },
  {
    title: "Group meetings",
    icon: Users,
    description: "Collect people's availability, then book a time everyone can make.",
    tools: [
      ["find_time_with", "Create a group meeting with three suggestions from your free time. By default, email people a link to choose times after confirmation."],
      ["list_group_meetings", "List your group meetings and their current state."],
      ["get_group_meeting", "See who has answered and rank candidate times by attendance."],
      ["book_group_meeting", "Book a candidate time and send everyone a calendar invite after confirmation."],
      ["remind_group_meeting", "Re-send the invite link to people who have not answered, after confirmation."],
      ["cancel_group_meeting", "Cancel a meeting and notify invited people after confirmation."],
    ],
  },
  {
    title: "Calendars & schedule import",
    icon: CalendarDays,
    description: "Connect busy times and turn a pasted schedule into calendar events.",
    tools: [
      ["list_calendars", "List connected calendars and their sync health."],
      ["add_calendar", "Connect a calendar by its iCal, ICS or webcal link so busy times block bookings."],
      ["sync_calendars", "Refresh all connected calendars now."],
      ["list_calendar_events", "Read calendar events in a date range; defaults to the next 7 days."],
      ["import_schedule_text", "Turn dates and times in pasted text into events that block bookings. Undo the import from Calendars."],
      ["get_schedule_email_address", "Get your private schedule-import email address and recent imports."],
    ],
  },
  {
    title: "Time & invoices",
    icon: Clock,
    description: "Record client work and turn logged hours into invoices.",
    tools: [
      ["list_clients", "List your clients, hourly rates, currencies and billing emails."],
      ["log_time", "Log hours for a client, with a date and description."],
      ["list_time_entries", "Read time entries for a date range, optionally for one client."],
      ["get_hours_and_money", "See this week's hours and target, unbilled amounts, outstanding invoices and this month's payments, per currency."],
      ["list_unbilled_time", "Get unbilled hours and amounts for each client."],
      ["list_invoices", "List invoices with their status, totals and due dates."],
      ["create_invoice", "Create a draft invoice from a client's logged time in a date range."],
      ["send_invoice", "Email an invoice to the client's billing contacts after confirmation."],
    ],
  },
];

const FAQ = [
  { q: "What is MCP?", a: "The Model Context Protocol is a standard for connecting an AI assistant to an app's tools. TimeIQ's MCP server lets your assistant work with your TimeIQ account from a conversation." },
  { q: "Do I need a TimeIQ account?", a: "Yes. Sign up, connect your calendars and set your working hours in TimeIQ. Your assistant uses that same account. The hosted service follows your TimeIQ subscription; your assistant may have its own plan or workspace requirements for custom connectors." },
  { q: "Can it see other people's calendars?", a: "It reads calendars connected to your account. For a group meeting, it suggests times you are free and asks participants to share their availability through a link. It does not gain access to their private calendars." },
  { q: "Why does my connection fail?", a: "Check that the server URL ends in /mcp and that you have signed in and allowed the connection. For token setup, send Authorization: Bearer followed by your full token. If you revoked or lost it, create a new token in Settings → AI assistants. Check that your TimeIQ subscription is active and your client allows custom connectors." },
  { q: "Can I use a different client or self-host TimeIQ?", a: "Yes. Use an MCP client that supports Streamable HTTP and either browser sign-in or an Authorization header. For a self-hosted installation, replace the hosted URL with your own API's /mcp endpoint. Cloud clients need to be able to reach that URL." },
];

function Snippet({ children }: { children: string }) {
  return <pre className="my-4 min-w-0 whitespace-pre-wrap break-words rounded-xl border border-foreground/10 bg-muted/70 p-4 text-xs leading-relaxed [overflow-wrap:anywhere]"><code>{children}</code></pre>;
}

export default function McpPage() {
  return (
    <MarketingShell>
      <div className="container mx-auto px-4 pb-20 pt-8 sm:px-6 lg:px-10">
        <section className="grid items-center gap-10 pb-16 pt-4 lg:grid-cols-2 lg:gap-14 lg:pb-24 lg:pt-10" aria-labelledby="mcp-title">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Code2 className="h-3.5 w-3.5" aria-hidden /> TimeIQ for AI assistants
            </p>
            <h1 id="mcp-title" className="font-display text-[2.5rem] leading-[1.08] tracking-[-0.03em] text-balance sm:text-5xl xl:text-6xl">
              Use TimeIQ inside <span className="font-display-italic text-aurora">Claude, ChatGPT and Cursor.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
              Your calendars, meetings, hours and invoices, connected to your AI assistant through MCP.
              Ask when you&apos;re free, log client work or prepare an invoice in the chat you already have open.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#setup" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Connect TimeIQ <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <Link href="/sign-up" className="inline-flex min-h-12 items-center justify-center rounded-full border border-foreground/15 bg-white/60 px-6 text-sm font-medium hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Sign up</Link>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">Works with your connected calendars and TimeIQ account.</p>
          </div>
          <McpDemo fallback={<McpDemoContent />} />
        </section>

        <section id="setup" className="scroll-mt-6 border-t border-foreground/10 py-16" aria-labelledby="setup-title">
          <div className="mb-8 max-w-2xl">
            <h2 id="setup-title" className="font-display text-3xl tracking-tight sm:text-4xl">Connect your assistant.</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">Choose your client. Use the hosted server URL below, then connect your TimeIQ account.</p>
            <div className="mt-5 rounded-xl border border-foreground/10 bg-white/70 px-4 py-3">
              <p className="mb-1 text-xs text-muted-foreground">Server URL · Streamable HTTP</p>
              <code className="break-all text-sm">{MCP_URL}</code>
            </div>
          </div>
          <div className="glass max-w-4xl rounded-[1.5rem] p-4 sm:p-6">
            <fieldset className={styles.clients}>
              <legend className="sr-only">Choose your AI assistant</legend>
              {[["claude", "Claude"], ["chatgpt", "ChatGPT"], ["claude-code", "Claude Code"], ["cursor", "Cursor & others"]].map(([id, label]) => (
                <span key={id} className="contents">
                  <input className={styles.choice} id={`setup-${id}`} name="mcp-client" type="radio" value={id} defaultChecked={id === "claude"} aria-controls={`instructions-${id}`} />
                  <label className={styles.tab} htmlFor={`setup-${id}`}>{label}</label>
                </span>
              ))}
              <div id="instructions-claude" className={`${styles.panel} ${styles.claude}`}>
                <h3 className="text-lg font-semibold">Claude on the web or desktop</h3>
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li>Open Settings → Connectors (called Customize → Connectors in some versions).</li>
                  <li>Choose Add custom connector and name it TimeIQ.</li>
                  <li>Paste <code className="break-all text-foreground">{MCP_URL}</code> as the server URL.</li>
                  <li>Connect, sign in to TimeIQ and select Allow. Enable TimeIQ in the chat&apos;s connectors menu.</li>
                </ol>
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">On a managed workspace, an owner may need to add the connector first. <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" className="underline underline-offset-4">Claude&apos;s connector guide</a></p>
              </div>
              <div id="instructions-chatgpt" className={`${styles.panel} ${styles.chatgpt}`}>
                <h3 className="text-lg font-semibold">ChatGPT</h3>
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li>Open Settings → Connectors (or Apps), then enable developer mode under advanced settings if needed.</li>
                  <li>Add a custom connector or app named TimeIQ.</li>
                  <li>Set its MCP server URL to <code className="break-all text-foreground">{MCP_URL}</code>.</li>
                  <li>Connect, sign in to TimeIQ and select Allow. Select TimeIQ in your conversation&apos;s tools menu.</li>
                </ol>
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Custom connectors depend on your ChatGPT plan and workspace permissions. If the option is missing, check with your workspace owner. <a href="https://developers.openai.com/apps-sdk/deploy/connect-chatgpt" className="underline underline-offset-4">OpenAI&apos;s connection guide</a></p>
              </div>
              <div id="instructions-claude-code" className={`${styles.panel} ${styles.code}`}>
                <h3 className="text-lg font-semibold">Claude Code</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Run this in a terminal. Complete the browser sign-in when prompted and select Allow. If needed, run <code className="text-foreground">/mcp</code> in Claude Code to authenticate TimeIQ.</p>
                <Snippet>{CODE_COMMAND}</Snippet>
                <p className="text-sm leading-relaxed text-muted-foreground">You can also connect with a personal token. In TimeIQ, open <Link href="/settings" className="text-foreground underline underline-offset-4">Settings → AI assistants</Link>, create a token, then replace the placeholder below with it.</p>
                <Snippet>{TOKEN_COMMAND}</Snippet>
              </div>
              <div id="instructions-cursor" className={`${styles.panel} ${styles.cursor}`}>
                <h3 className="text-lg font-semibold">Cursor and other MCP clients</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Create a personal token in <Link href="/settings" className="text-foreground underline underline-offset-4">Settings → AI assistants</Link>. In Cursor, add this to your MCP configuration (<code className="text-foreground">~/.cursor/mcp.json</code>), replacing <code className="text-foreground">YOUR_TIMEIQ_TOKEN</code> with the token.</p>
                <Snippet>{CURSOR_CONFIG}</Snippet>
                <p className="text-sm leading-relaxed text-muted-foreground">For other clients, use the same URL and Authorization header with Streamable HTTP. Keep your token private and outside shared project files. <a href="https://prod.cursor.com/docs/mcp" className="text-foreground underline underline-offset-4">Cursor&apos;s MCP guide</a></p>
              </div>
            </fieldset>
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground"><strong className="font-medium text-foreground">Self-hosting?</strong> Your endpoint is <code className="break-all text-foreground">&lt;your API&gt;/mcp</code>. Replace the hosted server URL in these instructions with yours.</p>
        </section>

        <section className="border-t border-foreground/10 py-16" aria-labelledby="tools-title">
          <div className="mb-8 max-w-2xl">
            <h2 id="tools-title" className="font-display text-3xl tracking-tight sm:text-4xl">What you can ask TimeIQ to do.</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">25 tools, using the same account permissions and validation as the TimeIQ app. Your assistant chooses the tools that fit your request.</p>
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {TOOL_GROUPS.map(({ title, icon: Icon, description, tools }) => (
              <div key={title} className="glass min-w-0 rounded-[1.5rem] p-5 sm:p-7">
                <Icon className="mb-4 h-5 w-5 text-[hsl(var(--aurora-1))]" aria-hidden />
                <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
                <dl className="mt-5 divide-y divide-foreground/10">
                  {tools.map(([name, description]) => (
                    <div key={name} className="py-3 first:pt-0 last:pb-0">
                      <dt className="break-words font-mono text-xs font-medium">{name}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-[1.5rem] p-6 sm:p-10" aria-labelledby="safety-title">
          <ShieldCheck className="mb-4 h-6 w-6 text-[hsl(var(--aurora-1))]" aria-hidden />
          <h2 id="safety-title" className="font-display text-3xl tracking-tight">You decide what gets sent.</h2>
          <div className="mt-5 grid gap-6 text-sm leading-relaxed text-muted-foreground md:grid-cols-3">
            <p><strong className="mb-1 block font-semibold text-foreground">Review shared changes</strong>Tools that email people or change shared calendars ask you first. TimeIQ instructs your assistant to confirm and marks these tools for client approval. Keep approvals enabled in your client.</p>
            <p><strong className="mb-1 block font-semibold text-foreground">Disconnect any time</strong>Manage connections and revoke personal tokens in <Link href="/settings" className="text-foreground underline underline-offset-4">Settings → AI assistants</Link>. A revoked token stops working immediately.</p>
            <p><strong className="mb-1 block font-semibold text-foreground">Your account stays yours</strong>Tokens cannot delete your account or create other tokens. TimeIQ is open source: <a href="https://github.com/simsketch/timeiq" className="text-foreground underline underline-offset-4">read the code on GitHub</a>.</p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl pt-16" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl tracking-tight sm:text-4xl">A few practical questions.</h2>
          <div className="mt-8 divide-y divide-foreground/10">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group py-5">
                <summary className="cursor-pointer text-base font-semibold leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{q}</summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
          <a href="#setup" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4">Connect TimeIQ <ArrowRight className="h-4 w-4" aria-hidden /></a>
        </section>
      </div>
    </MarketingShell>
  );
}
