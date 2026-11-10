"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Metrics = { spend: number; impressions: number; link_clicks: number; landing_page_views: number; meta_registrations: number; purchases: number; attributed_users: number };
type Report = { generated_at: string; currency: string; timezone: string; since: string; until: string; totals: Metrics; ads: (Metrics & { id: string; name: string; campaign: string })[] };

export function AdminAdPerformance() {
  const { getToken } = useAuth();
  const [days, setDays] = useState("7");
  const [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setReport(null); setError("");
      try {
        const token = await getToken();
        const data = await apiFetch<Report>(`/api/admin/ads?days=${days}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!cancelled) setReport(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load ads.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [days, refresh, getToken]);
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: report?.currency || "USD" }).format(value);
  return (
    <section className="rounded-2xl border bg-background/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Ad performance</h2><p className="mt-1 text-sm text-muted-foreground">Live results from Meta, alongside TimeIQ registrations.</p></div>
        <div className="flex items-center gap-2">
          <label htmlFor="ad-period" className="sr-only">Ad reporting period</label>
          <select id="ad-period" value={days} onChange={(e) => setDays(e.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm">
            <option value="7">Last 7 complete days</option><option value="30">Last 30 complete days</option><option value="0">Lifetime · includes today</option>
          </select>
          <Button variant="outline" disabled={loading} onClick={() => setRefresh((n) => n + 1)}>Refresh ads</Button>
        </div>
      </div>
      {loading && <p className="mt-5 text-sm" role="status">Loading ad results…</p>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-destructive/30 p-4 text-sm">{error}</p>}
      {report && <>
        <p className="mt-3 text-xs text-muted-foreground">{report.since}–{report.until} · {report.timezone} · {report.currency} · fetched {new Date(report.generated_at).toLocaleString()}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {([ ["Spend", money(report.totals.spend)], ["Link clicks", report.totals.link_clicks.toLocaleString()],
            ["Landing-page views", report.totals.landing_page_views.toLocaleString()], ["Attributed TimeIQ users", report.totals.attributed_users.toLocaleString()],
            ["Impressions", report.totals.impressions.toLocaleString()], ["Link click-through rate", `${(report.totals.impressions ? report.totals.link_clicks / report.totals.impressions * 100 : 0).toFixed(2)}%`],
            ["Cost per link click", report.totals.link_clicks ? money(report.totals.spend / report.totals.link_clicks) : "—"], ["Meta purchases", report.totals.purchases.toLocaleString()],
          ]).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b text-muted-foreground">{["Ad", "Spend", "Link clicks", "Page views", "TimeIQ users", "Meta sign-ups"].map((label) => <th key={label} scope="col" className="whitespace-nowrap p-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{report.ads.map((ad) => <tr key={ad.id} className="border-b last:border-0"><td className="p-3 font-medium">{ad.name}<span className="block text-xs font-normal text-muted-foreground">{ad.campaign}</span></td><td className="p-3">{money(ad.spend)}</td><td className="p-3">{ad.link_clicks}</td><td className="p-3">{ad.landing_page_views}</td><td className="p-3">{ad.attributed_users}</td><td className="p-3">{ad.meta_registrations}</td></tr>)}</tbody>
        </table></div>
        {!report.ads.length && <p className="mt-4 text-sm text-muted-foreground">No ad delivery reported for this period.</p>}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">TimeIQ users are accounts created in this period with a matching first ad visit; Meta sign-ups use Meta’s own attribution and may differ. Source tracking starts with this release. Missing source data stays “Unknown”; past sign-ups cannot be attributed retroactively. Browser storage blocking and switching devices can prevent attribution.</p>
      </>}
      <a href="https://www.facebook.com/adsmanager" target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm underline underline-offset-4">Open Meta Ads Manager</a>
    </section>
  );
}
