"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { Copy, RefreshCw } from "lucide-react";
import { ClockLoader } from "@/components/ui/clock-loader";

interface UserSettings {
  name: string;
  username: string;
  timezone: string;
}

interface FeedSettings {
  url: string;
  webcal_url: string;
  obfuscate: boolean;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Dubai",
  "Australia/Sydney",
  "UTC",
];

export default function SettingsPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings>({
    name: "",
    username: "",
    timezone: "America/New_York",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feed, setFeed] = useState<FeedSettings | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchFeed();
  }, []);

  async function fetchFeed() {
    try {
      const token = await getToken();
      const data = await apiFetch<FeedSettings>("/api/me/feed", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeed(data);
    } catch (error) {
      console.error("Failed to fetch feed settings:", error);
    }
  }

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

  async function fetchSettings() {
    try {
      const token = await getToken();
      const data = await apiFetch<UserSettings>("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSettings(data);
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      // Set defaults
      setSettings({
        name: user?.fullName || "",
        username: user?.username || user?.id || "",
        timezone: "America/New_York",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getToken();
      await apiFetch("/api/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      toast({ title: "Settings updated successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function copyBookingLink() {
    const link = `${window.location.origin}/book/${settings.username}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copied to clipboard" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label="Loading settings" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account preferences
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                value={settings.name}
                onChange={(e) =>
                  setSettings({ ...settings, name: e.target.value })
                }
                placeholder="Your full name"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This is the name shown to guests in emails and calendar invites
              </p>
            </div>

            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={settings.username}
                onChange={(e) =>
                  setSettings({ ...settings, username: e.target.value })
                }
                placeholder="your-username"
                pattern="[a-zA-Z0-9_-]+"
                title="Username can only contain letters, numbers, hyphens, and underscores"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be used in your booking URL
              </p>
            </div>

            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={settings.timezone}
                onValueChange={(value) =>
                  setSettings({ ...settings, timezone: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Booking Link</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={`${window.location.origin}/book/${settings.username}`}
                readOnly
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={copyBookingLink}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Share this link with anyone to let them book time with you
            </p>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Calendar Subscription</CardTitle>
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
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={regenerateFeed}
                  disabled={feedBusy}
                  title="Generate a new link (revokes the old one)"
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
          ) : (
            <div className="flex items-center gap-3 py-2">
              <ClockLoader size="sm" />
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Loading feed</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
