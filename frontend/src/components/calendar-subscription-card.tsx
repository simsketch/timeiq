"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("calendars.subscription");
  const tc = useTranslations("common");
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
      setError(error instanceof Error ? error.message : t("loadFailed"));
    }
  }, [getToken, t]);

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
        title: value ? t("namesHidden") : t("namesVisible"),
      });
    } catch (error: any) {
      setFeed(prev);
      toast({
        title: tc("error"),
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
        t("confirmRegenerate"),
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
      toast({ title: t("regenerated") });
    } catch (error: any) {
      toast({
        title: tc("error"),
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
    toast({ title: t("copied") });
  }

  return (
    <Card id="subscription" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("intro")}
        </p>

        {feed ? (
          <>
            <div className="flex gap-2">
              <Input value={feed.url} readOnly className="flex-1" />
              <Button
                type="button"
                variant="outline"
                onClick={copyFeedLink}
                title={t("copyLink")}
                aria-label={t("copyLinkLabel")}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={regenerateFeed}
                disabled={feedBusy}
                title={t("regenerateTitle")}
                aria-label={t("regenerateLabel")}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              {t.rich("oneClick", {
                link: (chunks) => <a href={feed.webcal_url} className="underline underline-offset-2">{chunks}</a>,
              })}
            </div>

            <div className="flex items-start justify-between gap-4 pt-2 border-t">
              <div>
                <Label htmlFor="obfuscate">{t("hideNames")}</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("hideNamesHint")}
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
            <Button variant="outline" onClick={fetchFeed}>{tc("retry")}</Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <ClockLoader size="sm" />
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </div>
        )}
      </CardContent>
    </Card>

  );
}
