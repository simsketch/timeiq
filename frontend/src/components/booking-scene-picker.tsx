"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api";
import { DEFAULT_SCENE, NO_SCENE, RANDOM_SCENE, SCENE_IDS, SCENES, type SceneId } from "@/components/booking/scenes";

type Choice = SceneId | typeof NO_SCENE | typeof RANDOM_SCENE;

function initialChoice(initial: string | null | undefined): Choice {
  if (initial === NO_SCENE || initial === RANDOM_SCENE) return initial;
  return initial && initial in SCENES ? (initial as SceneId) : DEFAULT_SCENE;
}

export function BookingScenePicker({ username, initial }: { username: string; initial: string | null | undefined }) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const t = useTranslations("eventTypes");
  const tc = useTranslations("common");
  const label = (choice: Choice) => (choice === NO_SCENE ? t("look.none") : choice === RANDOM_SCENE ? t("look.random") : t(`scenes.${choice}.name`));
  const [selected, setSelected] = useState<Choice>(() => initialChoice(initial));
  const [saving, setSaving] = useState<Choice | null>(null);

  async function choose(choice: Choice) {
    if (choice === selected || saving) return;
    const previous = selected;
    setSelected(choice);
    setSaving(choice);
    try {
      const token = await getToken();
      await apiFetch("/api/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ booking_scene: choice }),
      });
      toast({
        title: choice === NO_SCENE ? t("look.setNone")
          : choice === RANDOM_SCENE ? t("look.setRandom")
          : t("look.set", { name: label(choice) }),
      });
    } catch (error) {
      setSelected(previous);
      toast({ title: t("look.failed"), description: error instanceof Error ? error.message : tc("retry"), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  const pageUrl = (choice: Choice) => `/book/${username}?scene=${choice}`;
  const choices: Choice[] = [...SCENE_IDS, RANDOM_SCENE, NO_SCENE];

  return (
    <Card id="look" className="scroll-mt-6">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>{t("look.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("look.body")}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a href={pageUrl(selected)} target="_blank" rel="noopener noreferrer">
            {t("look.preview")} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </Button>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label={t("look.group")} className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          {choices.map((choice) => {
            const isSelected = choice === selected;
            const scene = choice === NO_SCENE || choice === RANDOM_SCENE ? null : SCENES[choice];
            return (
              <div key={choice} className="group relative">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => choose(choice)}
                  className={`block w-full overflow-hidden rounded-xl border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-foreground/30"
                  }`}
                >
                  <span className="relative block aspect-[4/5] bg-muted">
                    {scene ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static WebP stills, already sized
                      <img src={scene.still640} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : choice === RANDOM_SCENE ? (
                      // A shuffled deck of four scenes.
                      <span aria-hidden className="grid h-full grid-cols-2 grid-rows-2 gap-px bg-border">
                        {SCENE_IDS.slice(0, 4).map((id) => (
                          // eslint-disable-next-line @next/next/no-img-element -- static WebP stills, already sized
                          <img key={id} src={SCENES[id].still640} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        ))}
                      </span>
                    ) : (
                      // A miniature of the plain page: avatar, heading and two meeting rows.
                      <span aria-hidden className="flex h-full flex-col justify-center gap-2.5 bg-[#faf9f6] px-[18%]">
                        <span className="h-5 w-5 rounded-full bg-foreground/10" />
                        <span className="h-2.5 w-4/5 rounded bg-foreground/15" />
                        <span className="h-2 w-3/5 rounded bg-foreground/10" />
                        <span className="mt-2 h-px w-full bg-foreground/10" />
                        <span className="h-2 w-2/3 rounded bg-foreground/10" />
                        <span className="h-px w-full bg-foreground/10" />
                        <span className="h-2 w-1/2 rounded bg-foreground/10" />
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                  <span className="block p-3">
                    <span className="block text-sm font-medium">{label(choice)}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {scene ? t(`scenes.${scene.id}.blurb`)
                        : choice === RANDOM_SCENE ? t("look.randomBlurb")
                        : t("look.noneBlurb")}
                    </span>
                  </span>
                </button>
                <a
                  href={pageUrl(choice)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-xs font-medium opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 focus-visible:opacity-100"
                >
                  {t("look.previewShort")} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
