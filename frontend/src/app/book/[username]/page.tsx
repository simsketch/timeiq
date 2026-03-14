"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Calendar, MapPin } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface EventType {
  id: number;
  name: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
  location: string | null;
  color: string;
}

interface UserProfile {
  username: string;
  name: string;
  image_url: string | null;
  event_types: EventType[];
}

export default function BookingProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await apiFetch<UserProfile>(`/api/public/${username}`);
        setProfile(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">User Not Found</h1>
          <p className="text-muted-foreground">
            The booking page you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] relative overflow-hidden">
      {/* Subtle mesh background */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-200/20 rounded-full blur-3xl" />

      <div className="relative container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center mb-12">
          {profile.image_url ? (
            <img
              src={profile.image_url}
              alt={profile.name || profile.username}
              className="w-20 h-20 rounded-full mx-auto mb-4 border-2 border-white/80 shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
              <Calendar className="h-10 w-10 text-white" />
            </div>
          )}
          <h1 className="text-4xl font-bold tracking-tight mb-2">{profile.name || profile.username}</h1>
          <p className="text-muted-foreground">
            Choose a meeting type to schedule time together
          </p>
        </div>

        {profile.event_types.length === 0 ? (
          <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-12 text-center text-muted-foreground">
            No event types available at the moment
          </div>
        ) : (
          <div className={`grid gap-4 ${profile.event_types.length === 1 ? "max-w-md mx-auto" : "md:grid-cols-2"}`}>
            {profile.event_types.map((eventType) => (
              <Link
                key={eventType.id}
                href={`/book/${username}/${eventType.slug}`}
              >
                <div className="group h-full bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-black/[0.03] p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/10 hover:border-blue-200/60 cursor-pointer">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-3 h-3 rounded-full ring-4 ring-white/50"
                      style={{ backgroundColor: eventType.color }}
                    />
                    <h3 className="text-xl font-semibold tracking-tight">{eventType.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-3">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">{eventType.duration_minutes} minutes</span>
                  </div>
                  {eventType.location && (
                    <div className="flex items-center gap-2 text-muted-foreground mb-3">
                      <MapPin className="h-4 w-4" />
                      <span className="text-sm truncate">{eventType.location.startsWith("http") ? eventType.location.replace(/^https?:\/\//, "").split("/")[0] : eventType.location}</span>
                    </div>
                  )}
                  {eventType.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {eventType.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground">
            Powered by{" "}
            <Link href="/" className="text-primary hover:underline font-medium">
              TimeIQ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
