"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ClockLoader } from "@/components/ui/clock-loader";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";

interface FeedSettings {
  url: string;
  webcal_url: string;
  obfuscate: boolean;
}

export function CalendarSubscriptionCard() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [feed, setFeed] = useState<FeedSettings | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    try {
      const token = await getToken();
      setError(null);
      const data = await apiFetch<FeedSettings>("/api/me/feed", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeed(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The subscription link did not load. Try again.");
    }
  }, [getToken]);

  useEffect(() => {
    // State updates follow the first await in fetchFeed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFeed();
  }, [fetchFeed]);

  async function toggleObfuscate(value: boolean) {
    if (!feed) return;
    const prev = feed;
    setFeed({ ...feed, obfuscate: value });
    setFeedBusy(true);
    try {
      const token = await getToken();
      const data = await apiFetch<FeedSettings>("/api/me/feed", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ obfuscate: value }),
      });
      setFeed(data);
      toast({
        title: value ? "Event names hidden" : "Event names visible",
      });
    } catch (error: any) {
      setFeed(prev);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFeedBusy(false);
    }
  }

  async function regenerateFeed() {
    if (
      !confirm(
        "Regenerate the subscription link? The old link will stop working in any calendar that uses it.",
      )
    ) {
      return;
    }
    setFeedBusy(true);
    try {
      const token = await getToken();
      const data = await apiFetch<FeedSettings>("/api/me/feed/regenerate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeed(data);
      toast({ title: "New link generated" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFeedBusy(false);
    }
  }

  function copyFeedLink() {
    if (!feed) return;
    navigator.clipboard.writeText(feed.url);
    toast({ title: "Subscription link copied" });
  }

  return (
    <Card id="subscription" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>Calendar subscription</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Subscribe to a read-only feed of your bookings and synced external
          events. Add this URL to Google Calendar, Apple Calendar, or any app
          that supports ICS subscriptions.
        </p>

        {feed ? (
          <>
            <div className="flex gap-2">
              <Input value={feed.url} readOnly className="flex-1" />
              <Button
                type="button"
                variant="outline"
                onClick={copyFeedLink}
                title="Copy link"
                aria-label="Copy subscription link"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={regenerateFeed}
                disabled={feedBusy}
                title="Generate a new link (revokes the old one)"
                aria-label="Generate a new subscription link"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              One-click subscribe:{" "}
              <a
                href={feed.webcal_url}
                className="underline underline-offset-2"
              >
                open in calendar app
              </a>
            </div>

            <div className="flex items-start justify-between gap-4 pt-2 border-t">
              <div>
                <Label htmlFor="obfuscate">Hide event names</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, all events show as &ldquo;Busy&rdquo; with no
                  title, description, location, or attendees.
                </p>
              </div>
              <Switch
                id="obfuscate"
                checked={feed.obfuscate}
                onCheckedChange={toggleObfuscate}
                disabled={feedBusy}
              />
            </div>
          </>
        ) : error ? (
          <div role="alert" className="space-y-3 text-sm">
            <p>{error}</p>
            <Button variant="outline" onClick={fetchFeed}>Try again</Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <ClockLoader size="sm" />
            <p className="text-sm text-muted-foreground">Loading feed</p>
          </div>
        )}
      </CardContent>
    </Card>

  );
}
