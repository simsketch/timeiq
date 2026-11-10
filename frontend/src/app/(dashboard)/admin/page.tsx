"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Analytics = {
  generated_at: string;
  users: { total: number; last_24h: number; last_7d: number; last_30d: number; active_subscriptions: number; trials: number; complimentary: number };
  signups: { date: string; count: number }[];
  activity: Record<string, number>;
  recent_users: { name: string | null; email: string; username: string; created_at: string; subscription_status: string }[];
};

const activityLabels: Record<string, string> = {
  connected_calendars: "Connected calendars",
  users_with_calendars: "Users with calendars",
  calendars_needing_attention: "Calendars needing attention",
  active_booking_types: "Active booking types",
  bookings: "Bookings · all time",
  bookings_30d: "Bookings · last 30 days",
  upcoming_bookings: "Upcoming confirmed bookings",
  cc_agent_meetings: "CC agent meetings · all time",
  cc_agent_booked: "CC agent meetings booked",
  email_imports_30d: "Emails processed · last 30 days",
  email_failures_30d: "Email failures · last 30 days",
};

export default function AdminPage() {
  const { getToken, isLoaded, userId } = useAuth();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const token = await getToken();
        const result = await apiFetch<Analytics>("/api/admin/analytics", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        });
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load analytics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, isLoaded, userId, refresh]);

  const cards = data ? [
    ["Registered users", data.users.total], ["New · last 24 hours", data.users.last_24h],
    ["New · last 7 days", data.users.last_7d], ["New · last 30 days", data.users.last_30d],
    ["Active subscriptions", data.users.active_subscriptions], ["Trials", data.users.trials],
    ["Complimentary accounts", data.users.complimentary],
  ] as const : [];
  const peak = Math.max(1, ...data?.signups.map((day) => day.count) ?? []);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Owner dashboard</p>
          <h1 className="mt-2 text-4xl font-display">Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">Application analytics · only available to simsketch@gmail.com</p>
        </div>
        <Button variant="outline" disabled={loading} onClick={() => setRefresh((n) => n + 1)}>Refresh</Button>
      </div>
      {loading && <p role="status">Loading analytics…</p>}
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">{error}</p>}
      {data && <>
        <p className="text-xs text-muted-foreground">Updated {new Date(data.generated_at).toLocaleString()}. Counts include your account. These are registered users, not website visitors.</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(([label, value]) => <div key={label} className="rounded-2xl border bg-background/70 p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          </div>)}
        </div>
        <section className="rounded-2xl border bg-background/70 p-5">
          <h2 className="text-lg font-semibold">Sign-ups over the last 30 days</h2>
          <p className="mt-1 text-sm text-muted-foreground">Daily totals in UTC. Hover or focus on a day for its count.</p>
          <div className="mt-6 flex h-32 items-end gap-1" aria-label="Daily sign-ups">
            {data.signups.map((day) => <div key={day.date} tabIndex={0} title={`${day.date}: ${day.count} sign-ups`} aria-label={`${day.date}: ${day.count} sign-ups`} className="flex h-full min-w-0 flex-1 items-end rounded-sm focus-visible:outline-2 focus-visible:outline-primary">
              <div className={day.count ? "w-full rounded-t bg-primary" : "w-full rounded-t bg-muted-foreground/20"} style={{ height: `${Math.max(3, day.count / peak * 100)}%` }} />
            </div>)}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{data.signups[0]?.date}</span><span>{data.signups.at(-1)?.date}</span></div>
        </section>
        <section>
          <h2 className="mb-4 text-lg font-semibold">Product activity</h2>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(data.activity).map(([key, value]) => <div key={key} className="flex items-center justify-between gap-4 rounded-xl border bg-background/70 p-4">
              <dt className="text-sm text-muted-foreground">{activityLabels[key] ?? key}</dt><dd className="text-xl font-semibold tabular-nums">{value}</dd>
            </div>)}
          </dl>
        </section>
        <section className="rounded-2xl border bg-background/70 p-5">
          <h2 className="text-lg font-semibold">Latest registered users</h2>
          <p className="mt-1 text-sm text-muted-foreground">Most recent 50 accounts. Website visits and ad clicks do not create accounts.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-muted-foreground">{["User", "Email", "Joined", "Subscription"].map((title) => <th key={title} scope="col" className="p-3 font-medium">{title}</th>)}</tr></thead>
              <tbody>{data.recent_users.map((user) => <tr key={user.username} className="border-b last:border-0">
                <td className="p-3">{user.name || user.username}<span className="block text-xs text-muted-foreground">@{user.username}</span></td>
                <td className="p-3">{user.email}</td><td className="whitespace-nowrap p-3">{new Date(user.created_at).toLocaleDateString()}</td><td className="p-3">{user.subscription_status}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
        <p className="text-sm text-muted-foreground">Ad-source attribution and chatbot usage are not recorded in the application database yet. Review spend and click attribution in <a href="https://www.facebook.com/adsmanager" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Meta Ads Manager</a>.</p>
      </>}
    </div>
  );
}
