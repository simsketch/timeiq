import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Code2, ShieldCheck, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { MarketingShell } from "@/components/marketing-shell";
import { McpDemo } from "@/components/landing/mcp-demo";
import { McpDemoContent } from "@/components/landing/mcp-demo-content";
import styles from "./setup.module.css";

const MCP_URL = "https://api.timeiq.app/mcp";
const CODE_COMMAND = `claude mcp add --transport http timeiq ${MCP_URL}`;
const TOKEN_COMMAND = `${CODE_COMMAND} --header "Authorization: Bearer YOUR_TIMEIQ_TOKEN"`;
const CURSOR_CONFIG = JSON.stringify({ mcpServers: { timeiq: { url: MCP_URL, headers: { Authorization: "Bearer YOUR_TIMEIQ_TOKEN" } } } }, null, 2);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mcp");
  const title = t("title");
  const description = t("description");
  return {
    title: `${title} | TimeIQ`,
    description,
    alternates: { canonical: "https://timeiq.app/mcp" },
    openGraph: {
      type: "website",
      url: "https://timeiq.app/mcp",
      siteName: "TimeIQ",
      title,
      description,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: t("ogAlt") }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

// Keep these names and descriptions aligned with backend/app/mcp_server.py.
// Descriptions live in messages under mcp.toolDescriptions.<name>.
const TOOL_GROUPS = [
  { id: "availability", icon: CalendarDays, tools: ["get_profile", "get_free_times", "list_event_types", "list_bookings", "book_meeting", "reschedule_booking", "cancel_booking"] },
  {
    id: "group",
    icon: Users,
    tools: ["find_time_with", "list_group_meetings", "get_group_meeting", "book_group_meeting", "remind_group_meeting", "cancel_group_meeting"],
  },
  {
    id: "calendars",
    icon: CalendarDays,
    tools: ["list_calendars", "add_calendar", "sync_calendars", "list_calendar_events", "import_schedule_text", "get_schedule_email_address"],
  },
  {
    id: "time",
    icon: Clock,
    tools: ["list_clients", "log_time", "list_time_entries", "get_hours_and_money", "list_unbilled_time", "list_invoices", "create_invoice", "send_invoice"],
  },
] as const;

const FAQ = ["what", "account", "privacy", "fails", "selfHost"] as const;

function Snippet({ children }: { children: string }) {
  return <pre className="my-4 min-w-0 whitespace-pre-wrap break-words rounded-xl border border-foreground/10 bg-muted/70 p-4 text-xs leading-relaxed [overflow-wrap:anywhere]"><code>{children}</code></pre>;
}

export default async function McpPage() {
  const t = await getTranslations("mcp");
  const code = (chunks: React.ReactNode) => <code className="break-all text-foreground">{chunks}</code>;
  const settingsLink = (chunks: React.ReactNode) => <Link href="/settings" className="text-foreground underline underline-offset-4">{chunks}</Link>;
  return (
    <MarketingShell>
      <div className="container mx-auto px-4 pb-20 pt-8 sm:px-6 lg:px-10">
        <section className="grid items-center gap-10 pb-16 pt-4 lg:grid-cols-2 lg:gap-14 lg:pb-24 lg:pt-10" aria-labelledby="mcp-title">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Code2 className="h-3.5 w-3.5" aria-hidden /> {t("badge")}
            </p>
            <h1 id="mcp-title" className="font-display text-[2.5rem] leading-[1.08] tracking-[-0.03em] text-balance sm:text-5xl xl:text-6xl">
              {t.rich("heading", { em: (chunks) => <span className="font-display-italic text-aurora">{chunks}</span> })}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
              {t("lead")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#setup" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {t("connect")} <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <Link href="/sign-up" className="inline-flex min-h-12 items-center justify-center rounded-full border border-foreground/15 bg-white/60 px-6 text-sm font-medium hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t("signUp")}</Link>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t("worksWith")}</p>
          </div>
          <McpDemo fallback={<McpDemoContent />} />
        </section>

        <section id="setup" className="scroll-mt-6 border-t border-foreground/10 py-16" aria-labelledby="setup-title">
          <div className="mb-8 max-w-2xl">
            <h2 id="setup-title" className="font-display text-3xl tracking-tight sm:text-4xl">{t("setupTitle")}</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">{t("setupLead")}</p>
            <div className="mt-5 rounded-xl border border-foreground/10 bg-white/70 px-4 py-3">
              <p className="mb-1 text-xs text-muted-foreground">{t("serverUrl")}</p>
              <code className="break-all text-sm">{MCP_URL}</code>
            </div>
          </div>
          <div className="glass max-w-4xl rounded-[1.5rem] p-4 sm:p-6">
            <fieldset className={styles.clients}>
              <legend className="sr-only">{t("chooseClient")}</legend>
              {[["claude", "Claude"], ["chatgpt", "ChatGPT"], ["claude-code", "Claude Code"], ["cursor", t("cursorTab")]].map(([id, label]) => (
                <span key={id} className="contents">
                  <input className={styles.choice} id={`setup-${id}`} name="mcp-client" type="radio" value={id} defaultChecked={id === "claude"} aria-controls={`instructions-${id}`} />
                  <label className={styles.tab} htmlFor={`setup-${id}`}>{label}</label>
                </span>
              ))}
              <div id="instructions-claude" className={`${styles.panel} ${styles.claude}`}>
                <h3 className="text-lg font-semibold">{t("claude.title")}</h3>
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li>{t("claude.step1")}</li>
                  <li>{t("claude.step2")}</li>
                  <li>{t.rich("claude.step3", { url: MCP_URL, code })}</li>
                  <li>{t("claude.step4")}</li>
                </ol>
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t.rich("claude.note", { link: (chunks) => <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" className="underline underline-offset-4">{chunks}</a> })}</p>
              </div>
              <div id="instructions-chatgpt" className={`${styles.panel} ${styles.chatgpt}`}>
                <h3 className="text-lg font-semibold">ChatGPT</h3>
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li>{t("chatgpt.step1")}</li>
                  <li>{t("chatgpt.step2")}</li>
                  <li>{t.rich("chatgpt.step3", { url: MCP_URL, code })}</li>
                  <li>{t("chatgpt.step4")}</li>
                </ol>
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t.rich("chatgpt.note", { link: (chunks) => <a href="https://developers.openai.com/apps-sdk/deploy/connect-chatgpt" className="underline underline-offset-4">{chunks}</a> })}</p>
              </div>
              <div id="instructions-claude-code" className={`${styles.panel} ${styles.code}`}>
                <h3 className="text-lg font-semibold">Claude Code</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.rich("code.intro", { code })}</p>
                <Snippet>{CODE_COMMAND}</Snippet>
                <p className="text-sm leading-relaxed text-muted-foreground">{t.rich("code.token", { link: settingsLink })}</p>
                <Snippet>{TOKEN_COMMAND}</Snippet>
              </div>
              <div id="instructions-cursor" className={`${styles.panel} ${styles.cursor}`}>
                <h3 className="text-lg font-semibold">{t("cursor.title")}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.rich("cursor.intro", { link: settingsLink, code })}</p>
                <Snippet>{CURSOR_CONFIG}</Snippet>
                <p className="text-sm leading-relaxed text-muted-foreground">{t.rich("cursor.others", { link: (chunks) => <a href="https://prod.cursor.com/docs/mcp" className="text-foreground underline underline-offset-4">{chunks}</a> })}</p>
              </div>
            </fieldset>
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.rich("selfHost", { endpoint: `<${t("yourApi")}>/mcp`, code, strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong> })}</p>
        </section>

        <section className="border-t border-foreground/10 py-16" aria-labelledby="tools-title">
          <div className="mb-8 max-w-2xl">
            <h2 id="tools-title" className="font-display text-3xl tracking-tight sm:text-4xl">{t("toolsTitle")}</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">{t("toolsLead", { count: TOOL_GROUPS.reduce((n, g) => n + g.tools.length, 0) })}</p>
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {TOOL_GROUPS.map(({ id, icon: Icon, tools }) => (
              <div key={id} className="glass min-w-0 rounded-[1.5rem] p-5 sm:p-7">
                <Icon className="mb-4 h-5 w-5 text-[hsl(var(--aurora-1))]" aria-hidden />
                <h3 className="text-xl font-semibold tracking-tight">{t(`groups.${id}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`groups.${id}.description`)}</p>
                <dl className="mt-5 divide-y divide-foreground/10">
                  {tools.map((name) => (
                    <div key={name} className="py-3 first:pt-0 last:pb-0">
                      <dt className="break-words font-mono text-xs font-medium">{name}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`toolDescriptions.${name}`)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-[1.5rem] p-6 sm:p-10" aria-labelledby="safety-title">
          <ShieldCheck className="mb-4 h-6 w-6 text-[hsl(var(--aurora-1))]" aria-hidden />
          <h2 id="safety-title" className="font-display text-3xl tracking-tight">{t("safetyTitle")}</h2>
          <div className="mt-5 grid gap-6 text-sm leading-relaxed text-muted-foreground md:grid-cols-3">
            <p><strong className="mb-1 block font-semibold text-foreground">{t("safety1Title")}</strong>{t("safety1")}</p>
            <p><strong className="mb-1 block font-semibold text-foreground">{t("safety2Title")}</strong>{t.rich("safety2", { link: settingsLink })}</p>
            <p><strong className="mb-1 block font-semibold text-foreground">{t("safety3Title")}</strong>{t.rich("safety3", { link: (chunks) => <a href="https://github.com/simsketch/timeiq" className="text-foreground underline underline-offset-4">{chunks}</a> })}</p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl pt-16" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl tracking-tight sm:text-4xl">{t("faqTitle")}</h2>
          <div className="mt-8 divide-y divide-foreground/10">
            {FAQ.map((id) => (
              <details key={id} className="group py-5">
                <summary className="cursor-pointer text-base font-semibold leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{t(`faq.${id}.q`)}</summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(`faq.${id}.a`)}</p>
              </details>
            ))}
          </div>
          <a href="#setup" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4">{t("connect")} <ArrowRight className="h-4 w-4" aria-hidden /></a>
        </section>
      </div>
    </MarketingShell>
  );
}
