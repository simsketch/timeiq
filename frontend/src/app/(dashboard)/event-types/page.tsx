"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Copy, CopyPlus, Edit, Trash2 } from "lucide-react";
import { ClockLoader } from "@/components/ui/clock-loader";
import { BookingExtrasFields, DEFAULT_BOOKING_EXTRAS } from "@/components/booking-extras-fields";
import { EmbedSnippets } from "@/components/embed-snippets";
import { BookingLinkCard } from "@/components/booking-link-card";
import { BookingScenePicker } from "@/components/booking-scene-picker";
import { BookingBrandingCard } from "@/components/booking-branding-card";
import { ConnectCard } from "@/components/connect-card";
import { BookingPriceFields } from "@/components/booking-price-fields";
import { bookingPrice } from "@/lib/booking-payments";

interface EventType {
  price_cents: number | null;
  currency: string;
  id: number;
  name: string;
  slug: string;
  duration: number;
  description: string | null;
  location: string | null;
  color: string;
  is_active: boolean;
  buffer_time: number;
  max_bookings_per_day: number | null;
  min_notice_minutes: number;
  max_days_ahead: number | null;
  reminder_minutes: number[];
  remind_host: boolean;
  collect_phone: boolean;
  require_phone: boolean;
  collect_company: boolean;
  require_company: boolean;
  collect_url: boolean;
  require_url: boolean;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90];
const COLOR_OPTIONS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"
];

export default function EventTypesPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const t = useTranslations("eventTypes");
  const tc = useTranslations("common");
  const locale = useLocale();
  // Booking links use the TimeIQ username from /api/me, which can differ from Clerk's.
  const [profile, setProfile] = useState<{ username: string; booking_scene: string | null; booking_logo?: string | null; booking_white_label?: boolean } | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const username = profile?.username ?? null;
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [formData, setFormData] = useState({
    name: "",
    duration_minutes: 30,
    description: "",
    location: "",
    color: COLOR_OPTIONS[0],
    buffer_minutes: 0,
    max_bookings_per_day: "",
    ...DEFAULT_BOOKING_EXTRAS,
    collect_phone: false,
    require_phone: false,
    collect_company: false,
    require_company: false,
    collect_url: false,
    require_url: false,
  });

  useEffect(() => {
    fetchEventTypes();
    fetchUsername();
  }, []);

  async function fetchUsername() {
    try {
      const token = await getToken();
      const me = await apiFetch<NonNullable<typeof profile>>("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(me);
      setProfileError(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : t("linkLoadError"));
    }
  }

  async function fetchEventTypes() {
    try {
      const token = await getToken();
      const data = await apiFetch<EventType[]>("/api/event-types", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEventTypes(data);
    } catch (error) {
      console.error("Failed to fetch event types:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const token = await getToken();
      const original = eventTypes.find((et) => et.id === editingId);
      const priceCents = price === "" ? null : Math.round(Number(price) * 100);
      const payload = {
        ...formData,
        ...(!original || priceCents !== original.price_cents || currency !== original.currency
          ? { price_cents: priceCents, currency } : {}),
        location: formData.location || null,
        max_bookings_per_day: formData.max_bookings_per_day ? parseInt(formData.max_bookings_per_day) : null,
      };

      if (editingId) {
        await apiFetch(`/api/event-types/${editingId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        toast({ title: t("updated") });
      } else {
        await apiFetch("/api/event-types", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        toast({ title: t("created") });
      }

      setDialogOpen(false);
      resetForm();
      fetchEventTypes();
    } catch (error: any) {
      toast({ title: tc("error"), description: error.message, variant: "destructive" });
    }
  }

  async function toggleActive(id: number, isActive: boolean) {
    try {
      const token = await getToken();
      await apiFetch(`/api/event-types/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !isActive }),
      });
      fetchEventTypes();
    } catch (error: any) {
      toast({ title: tc("error"), description: error.message, variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/event-types/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: t("deleted") });
      fetchEventTypes();
    } catch (error: any) {
      // A 409 explains which upcoming bookings keep this event type in place.
      toast({ title: t("deleteFailed"), description: error.message, variant: "destructive" });
    }
  }

  function handleEdit(eventType: EventType) {
    setPrice(eventType.price_cents == null ? "" : (eventType.price_cents / 100).toFixed(2));
    setCurrency(eventType.currency);
    setEditingId(eventType.id);
    setFormData({
      name: eventType.name,
      duration_minutes: eventType.duration,
      description: eventType.description || "",
      location: eventType.location || "",
      color: eventType.color,
      buffer_minutes: eventType.buffer_time,
      max_bookings_per_day: eventType.max_bookings_per_day?.toString() || "",
      min_notice_minutes: eventType.min_notice_minutes ?? 0,
      max_days_ahead: eventType.max_days_ahead ?? null,
      reminder_minutes: eventType.reminder_minutes ?? [1440],
      remind_host: eventType.remind_host ?? false,
      collect_phone: eventType.collect_phone,
      require_phone: eventType.require_phone,
      collect_company: eventType.collect_company,
      require_company: eventType.require_company,
      collect_url: eventType.collect_url,
      require_url: eventType.require_url,
    });
    setDialogOpen(true);
  }

  // Opens the create dialog prefilled from an existing event type; saving makes a new one.
  function handleClone(eventType: EventType) {
    handleEdit(eventType);
    setEditingId(null);
    setFormData((f) => ({ ...f, name: t("copyName", { name: eventType.name }) }));
  }

  function resetForm() {
    setPrice("");
    setCurrency("usd");
    setEditingId(null);
    setFormData({
      name: "",
      duration_minutes: 30,
      description: "",
      location: "",
      color: COLOR_OPTIONS[0],
      buffer_minutes: 0,
      max_bookings_per_day: "",
      ...DEFAULT_BOOKING_EXTRAS,
      collect_phone: false,
      require_phone: false,
      collect_company: false,
      require_company: false,
      collect_url: false,
      require_url: false,
    });
  }

  async function copyBookingLink(slug: string) {
    if (!username) {
      toast({
        title: t("copyFailed"),
        description: t("profileLoading"),
        variant: "destructive",
      });
      fetchUsername();
      return;
    }
    const link = `${window.location.origin}/book/${username}/${slug}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: t("linkCopied") });
    } catch {
      toast({ title: t("copyThisLink"), description: link });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <ClockLoader size="lg" label={t("loadingPage")} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
      </div>

      {profile ? (
        <BookingLinkCard username={profile.username} onSaved={(username) => setProfile({ ...profile, username })} />
      ) : (
        <Card>
          <CardHeader><CardTitle>{t("link.title")}</CardTitle></CardHeader>
          <CardContent>
            {profileError ? (
              <div role="alert" className="space-y-3 text-sm">
                <p>{profileError}</p>
                <Button variant="outline" onClick={fetchUsername}>{tc("retry")}</Button>
              </div>
            ) : <ClockLoader label={t("loadingLink")} />}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("heading")}</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingId ? t("editTitle") : t("createTitle")}</DialogTitle>
                <DialogDescription>
                  {t("dialogDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="name">{t("name")}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t("namePlaceholder")}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="duration">{t("duration")}</Label>
                  <Select
                    value={formData.duration_minutes.toString()}
                    onValueChange={(value) => setFormData({ ...formData, duration_minutes: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((dur) => (
                        <SelectItem key={dur} value={dur.toString()}>
                          {t("minutes", { count: dur })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">{t("description")}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t("descriptionPlaceholder")}
                  />
                </div>
                <div>
                  <Label htmlFor="location">{t("location")}</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder={t("locationPlaceholder")}
                    maxLength={500}
                  />
                </div>
                <div>
                  <Label>{t("color")}</Label>
                  <div className="flex gap-2 mt-2">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={t("colorOption", { color })}
                        aria-pressed={formData.color === color}
                        className="w-8 h-8 rounded-full border-2"
                        style={{
                          backgroundColor: color,
                          borderColor: formData.color === color ? "#000" : "transparent",
                        }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="buffer">{t("buffer")}</Label>
                  <Input
                    id="buffer"
                    type="number"
                    value={formData.buffer_minutes}
                    onChange={(e) => setFormData({ ...formData, buffer_minutes: parseInt(e.target.value) || 0 })}
                    min="0"
                  />
                </div>
                <div>
                  <Label htmlFor="maxBookings">{t("maxPerDay")}</Label>
                  <Input
                    id="maxBookings"
                    type="number"
                    value={formData.max_bookings_per_day}
                    onChange={(e) => setFormData({ ...formData, max_bookings_per_day: e.target.value })}
                    placeholder={t("maxPerDayPlaceholder")}
                    min="1"
                  />
                </div>
                <BookingExtrasFields value={formData} onChange={(change) => setFormData({ ...formData, ...change })} />
                <div className="space-y-3 pt-2">
                  <BookingPriceFields onSetupClick={() => { setDialogOpen(false); resetForm(); }} price={price} currency={currency} onChange={(p, c) => { setPrice(p); setCurrency(c); }} />
                  <Label className="text-sm font-medium">{t("collect")}</Label>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="collect_phone" className="text-sm font-normal">{t("phone")}</Label>
                      <Switch
                        id="collect_phone"
                        checked={formData.collect_phone}
                        onCheckedChange={(checked) => setFormData({ ...formData, collect_phone: checked, ...(!checked && { require_phone: false }) })}
                      />
                    </div>
                    <div className="flex items-center justify-between pl-4">
                      <Label htmlFor="require_phone" className={`text-xs ${formData.collect_phone ? "text-muted-foreground" : "text-muted-foreground/40"}`}>{t("required")}</Label>
                      <Switch
                        id="require_phone"
                        checked={formData.require_phone}
                        onCheckedChange={(checked) => setFormData({ ...formData, require_phone: checked })}
                        disabled={!formData.collect_phone}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="collect_company" className="text-sm font-normal">{t("company")}</Label>
                      <Switch
                        id="collect_company"
                        checked={formData.collect_company}
                        onCheckedChange={(checked) => setFormData({ ...formData, collect_company: checked, ...(!checked && { require_company: false }) })}
                      />
                    </div>
                    <div className="flex items-center justify-between pl-4">
                      <Label htmlFor="require_company" className={`text-xs ${formData.collect_company ? "text-muted-foreground" : "text-muted-foreground/40"}`}>{t("required")}</Label>
                      <Switch
                        id="require_company"
                        checked={formData.require_company}
                        onCheckedChange={(checked) => setFormData({ ...formData, require_company: checked })}
                        disabled={!formData.collect_company}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="collect_url" className="text-sm font-normal">{t("url")}</Label>
                      <Switch
                        id="collect_url"
                        checked={formData.collect_url}
                        onCheckedChange={(checked) => setFormData({ ...formData, collect_url: checked, ...(!checked && { require_url: false }) })}
                      />
                    </div>
                    <div className="flex items-center justify-between pl-4">
                      <Label htmlFor="require_url" className={`text-xs ${formData.collect_url ? "text-muted-foreground" : "text-muted-foreground/40"}`}>{t("required")}</Label>
                      <Switch
                        id="require_url"
                        checked={formData.require_url}
                        onCheckedChange={(checked) => setFormData({ ...formData, require_url: checked })}
                        disabled={!formData.collect_url}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editingId ? t("update") : t("create")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {eventTypes.map((eventType) => (
          <Card key={eventType.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full ring-4 ring-white/50"
                    style={{ backgroundColor: eventType.color }}
                  />
                  <CardTitle className="text-lg">{eventType.name}</CardTitle>
                </div>
                <Switch
                  checked={eventType.is_active}
                  onCheckedChange={() => toggleActive(eventType.id, eventType.is_active)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {t("minutes", { count: eventType.duration })}
                {eventType.price_cents != null && ` · ${bookingPrice(eventType.price_cents, eventType.currency, locale)}`}
              </p>
              {eventType.description && (
                <p className="text-sm mb-4">{eventType.description}</p>
              )}
              {eventType.location && (
                <p className="text-sm text-muted-foreground mb-4 truncate" title={eventType.location}>
                  {eventType.location}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyBookingLink(eventType.slug)}
                  title={t("copyLink")}
                  aria-label={t("copyLink")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEdit(eventType)}
                  title={tc("edit")}
                  aria-label={tc("edit")}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleClone(eventType)}
                  title={t("clone")}
                  aria-label={t("clone")}
                >
                  <CopyPlus className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(eventType.id)}
                  title={tc("delete")}
                  aria-label={tc("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3"><EmbedSnippets username={username} slug={eventType.slug} /></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {eventTypes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t("empty")}</p>
        </div>
      )}
      <ConnectCard />

      <Card id="embed" className="scroll-mt-6">
        <CardHeader><CardTitle>{t("embedTitle")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("embedBody")}</p>
          <EmbedSnippets username={username} />
        </CardContent>
      </Card>

      {profile && <BookingBrandingCard username={profile.username} initialLogo={profile.booking_logo} initialWhiteLabel={profile.booking_white_label} />}
      {profile && <BookingScenePicker username={profile.username} initial={profile.booking_scene} />}
    </div>
  );
}
