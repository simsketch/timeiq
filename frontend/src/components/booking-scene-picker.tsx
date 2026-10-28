"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Check, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { DEFAULT_SCENE, SCENE_IDS, SCENES, type SceneId } from "@/components/booking/scenes";

export function BookingScenePicker({ username, initial }: { username: string; initial: string | null | undefined }) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<SceneId>(
    initial && initial in SCENES ? (initial as SceneId) : DEFAULT_SCENE,
  );
  const [saving, setSaving] = useState<SceneId | null>(null);

  async function choose(id: SceneId) {
    if (id === selected || saving) return;
    const previous = selected;
    setSelected(id);
    setSaving(id);
    try {
      const token = await getToken();
      await apiFetch("/api/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ booking_scene: id }),
      });
      toast({ title: `Booking page scene set to ${SCENES[id].name}` });
    } catch (error) {
      setSelected(previous);
      toast({ title: "Couldn't change the scene", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Booking page scene</CardTitle>
        <p className="text-sm text-muted-foreground">
          The 3D scene beside your meeting list. Every scene shows your visitor&apos;s real time.
        </p>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Booking page scene" className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          {SCENE_IDS.map((id) => {
            const scene = SCENES[id];
            const isSelected = id === selected;
            return (
              <div key={id} className="group relative">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => choose(id)}
                  className={`block w-full overflow-hidden rounded-xl border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-foreground/30"
                  }`}
                >
                  <span className="relative block aspect-[4/5] bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static WebP stills, already sized */}
                    <img src={scene.still640} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    {isSelected && (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                  <span className="block p-3">
                    <span className="block text-sm font-medium">{scene.name}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{scene.blurb}</span>
                  </span>
                </button>
                <a
                  href={`/book/${username}?scene=${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-xs font-medium opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 focus-visible:opacity-100"
                >
                  Preview <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
