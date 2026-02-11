"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Calendar } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface EventType {
  id: number;
  name: string;
  slug: string;
  duration_minutes: number;
  description: string | null;
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
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-2">{profile.name || profile.username}</h1>
          <p className="text-muted-foreground">
            Choose a meeting type to schedule time together
          </p>
        </div>

        {profile.event_types.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No event types available at the moment
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {profile.event_types.map((eventType) => (
              <Link
                key={eventType.id}
                href={`/book/${username}/${eventType.slug}`}
              >
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: eventType.color }}
                      />
                      <CardTitle className="text-xl">{eventType.name}</CardTitle>
                    </div>
                    <CardDescription className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {eventType.duration_minutes} minutes
                    </CardDescription>
                  </CardHeader>
                  {eventType.description && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {eventType.description}
                      </p>
                    </CardContent>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}

        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground">
            Powered by{" "}
            <Link href="/" className="text-primary hover:underline">
              TimeIQ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
