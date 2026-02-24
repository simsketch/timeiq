"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, Clock, ArrowRight, Plus, Copy, Check,
  CalendarDays, ExternalLink
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
import Link from "next/link";

interface Booking {
  id: number;
  visitor_name: string;
  visitor_email: string;
  starts_at: string;
  event_type_id: number;
}

interface Stats {
  upcoming_bookings: number;
  total_event_types: number;
}

interface UserProfile {
  username: string;
  name: string | null;
  email: string;
}

export default function DashboardPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [stats, setStats] = useState<Stats>({ upcoming_bookings: 0, total_event_types: 0 });
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [statsData, bookingsData, profileData] = await Promise.all([
          apiFetch<Stats>("/api/dashboard/stats", { headers }),
          apiFetch<Booking[]>("/api/bookings?status=confirmed", { headers }),
          apiFetch<UserProfile>("/api/me", { headers }),
        ]);
        setStats(statsData);

        const now = new Date();
        const upcoming = bookingsData.filter(b => new Date(b.starts_at) >= now);
        const past = bookingsData
          .filter(b => new Date(b.starts_at) < now)
          .reverse(); // most recent past first
        setUpcomingBookings(upcoming.slice(0, 5));
        setPastBookings(past.slice(0, 5));
        setProfile(profileData);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [getToken]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  function getInitials(name: string) {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  }

  async function copyLink() {
    if (!profile) return;
    const url = `${window.location.origin}/book/${profile.username}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {greeting}, {user?.firstName || "there"}!
          </h1>
          <p className="text-muted-foreground mt-2">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/event-types">
            <Plus className="mr-2 h-4 w-4" />
            New event type
          </Link>
        </Button>
      </div>

      {/* Share link card — moved to top */}
      {profile && (
        <Card className="border-dashed bg-white/40 backdrop-blur-xl border-white/60 shadow-lg shadow-black/[0.02]">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
                <ExternalLink className="h-5 w-5 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Your booking link
                </p>
                <p className="text-sm font-mono truncate">
                  timeiq.app/book/{profile.username}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-white/70 backdrop-blur-xl border-white/80 shadow-lg shadow-black/[0.03]">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                <CalendarDays className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Upcoming Bookings
                </p>
                <p className="text-3xl font-bold">{stats.upcoming_bookings}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/70 backdrop-blur-xl border-white/80 shadow-lg shadow-black/[0.03]">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10">
                <Clock className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Event Types
                </p>
                <p className="text-3xl font-bold">{stats.total_event_types}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming meetings card */}
      <Card className="bg-white/70 backdrop-blur-xl border-white/80 shadow-lg shadow-black/[0.03]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Upcoming meetings</CardTitle>
              <CardDescription>Your next scheduled meetings</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/bookings">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {upcomingBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 mb-4">
                <Calendar className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No upcoming meetings</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                Share your booking link to start receiving bookings
              </p>
              <Button asChild variant="outline">
                <Link href="/event-types">
                  Create an event type
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {upcomingBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-sm font-semibold text-white">
                      {getInitials(booking.visitor_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{booking.visitor_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {booking.visitor_email}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium">
                      {format(new Date(booking.starts_at), "MMM d, yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(booking.starts_at), "h:mm a")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past meetings card */}
      {pastBookings.length > 0 && (
        <Card className="bg-white/50 backdrop-blur-xl border-white/60 shadow-lg shadow-black/[0.02]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-muted-foreground">Past meetings</CardTitle>
                <CardDescription>Recently completed meetings</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/bookings">
                  View all
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pastBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-500">
                      {getInitials(booking.visitor_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{booking.visitor_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {booking.visitor_email}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium">
                      {format(new Date(booking.starts_at), "MMM d, yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(booking.starts_at), "h:mm a")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
