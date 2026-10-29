"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";

export function BookingLinkCard({ username, onSaved }: { username: string; onSaved: (username: string) => void }) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState(username);
  const [saving, setSaving] = useState(false);
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/book/${username}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getToken();
      const updated = await apiFetch<{ username: string }>("/api/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: draft }),
      });
      onSaved(updated.username);
      setDraft(updated.username);
      toast({ title: "Settings updated successfully" });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "The username did not save. Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copied to clipboard" });
    } catch {
      toast({ title: "Copy this link", description: link });
    }
  }

  return (
    <Card id="booking-link" className="scroll-mt-6">
      <CardHeader><CardTitle>Your booking link</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={save} className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="username" value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="your-username" pattern="[a-zA-Z0-9_-]+"
              title="Username can only contain letters, numbers, hyphens, and underscores"
              required disabled={saving} className="flex-1 min-w-40" />
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save username"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Your username sets your booking URL. Save changes before sharing your link.</p>
        </form>
        <div className="flex gap-2">
          <Input aria-label="Your booking link" value={link} readOnly className="flex-1 min-w-0" />
          <Button type="button" variant="outline" onClick={copyLink} aria-label="Copy booking link"><Copy className="h-4 w-4" /></Button>
          <Button asChild variant="outline" size="icon">
            <a href={`/book/${username}`} target="_blank" rel="noopener noreferrer" aria-label="Open booking page"><ExternalLink className="h-4 w-4" /></a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Share this link with anyone to let them book time with you.</p>
      </CardContent>
    </Card>
  );
}
