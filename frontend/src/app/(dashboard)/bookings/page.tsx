"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";

interface Booking {
  id: number;
  visitor_name: string;
  visitor_email: string;
  starts_at: string;
  ends_at: string;
  status: string;
  visitor_notes: string | null;
  event_type_id: number;
}

export default function BookingsPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [cancelledBookings, setCancelledBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [upcoming, past, cancelled] = await Promise.all([
        apiFetch<Booking[]>("/api/bookings?status=confirmed", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=completed", { headers }),
        apiFetch<Booking[]>("/api/bookings?status=cancelled", { headers }),
      ]);

      setUpcomingBookings(upcoming);
      setPastBookings(past);
      setCancelledBookings(cancelled);
    } catch (error) {
      console.error("Failed to fetch bookings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: number) {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: "Booking cancelled" });
      fetchBookings();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  function BookingCard({ booking, showCancel }: { booking: Booking; showCancel?: boolean }) {
    return (
      <Card className="bg-white/70 backdrop-blur-xl border-white/80 shadow-lg shadow-black/[0.03]">
        <CardContent className="py-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold">{booking.visitor_name}</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-1">
                {booking.visitor_email}
              </p>
              <p className="text-sm font-medium">
                {format(new Date(booking.starts_at), "EEEE, MMMM d, yyyy")}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(booking.starts_at), "h:mm a")} -{" "}
                {format(new Date(booking.ends_at), "h:mm a")}
              </p>
              {booking.visitor_notes && (
                <p className="text-sm mt-2 text-muted-foreground">
                  Note: {booking.visitor_notes}
                </p>
              )}
            </div>
            {showCancel && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleCancel(booking.id)}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">Loading...</div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
        <p className="text-muted-foreground mt-2">
          View and manage your scheduled meetings
        </p>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingBookings.length})
          </TabsTrigger>
          <TabsTrigger value="past">Past ({pastBookings.length})</TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled ({cancelledBookings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4 mt-6">
          {upcomingBookings.length === 0 ? (
            <Card className="bg-white/70 backdrop-blur-xl border-white/80 shadow-lg shadow-black/[0.03]">
              <CardContent className="py-8 text-center text-muted-foreground">
                No upcoming bookings
              </CardContent>
            </Card>
          ) : (
            upcomingBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} showCancel />
            ))
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4 mt-6">
          {pastBookings.length === 0 ? (
            <Card className="bg-white/70 backdrop-blur-xl border-white/80 shadow-lg shadow-black/[0.03]">
              <CardContent className="py-8 text-center text-muted-foreground">
                No past bookings
              </CardContent>
            </Card>
          ) : (
            pastBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))
          )}
        </TabsContent>

        <TabsContent value="cancelled" className="space-y-4 mt-6">
          {cancelledBookings.length === 0 ? (
            <Card className="bg-white/70 backdrop-blur-xl border-white/80 shadow-lg shadow-black/[0.03]">
              <CardContent className="py-8 text-center text-muted-foreground">
                No cancelled bookings
              </CardContent>
            </Card>
          ) : (
            cancelledBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
