"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/api";

/** Target of the Undo link in a schedule-import reply. Needs a click, so link scanners can't undo anything. */
function UndoInner() {
  const token = useSearchParams().get("token");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ removed: number; subject: string | null; status: string } | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "This undo link is missing its code.");

  async function undo() {
    setBusy(true);
    try {
      setResult(
        await apiFetch("/api/email-imports/undo-by-token", { method: "POST", body: JSON.stringify({ token }) })
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="relative z-10 glass glass-chroma rounded-[1.75rem] p-10 max-w-md w-full text-center space-y-5">
        {error ? (
          <>
            <p className="text-muted-foreground text-pretty">{error}</p>
            <Button asChild variant="outline"><Link href="/calendars">Open your calendars</Link></Button>
          </>
        ) : result ? (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-[hsl(var(--aurora-4))]" />
            <h1 className="font-display text-2xl tracking-[-0.02em]">
              {result.removed > 0
                ? `Removed ${result.removed} event${result.removed === 1 ? "" : "s"}`
                : "Nothing left to undo"}
            </h1>
            <p className="text-muted-foreground text-pretty">
              {result.removed > 0
                ? `Everything added from ${result.subject ? `"${result.subject}"` : "that email"} is gone from your calendar.`
                : "That import was already undone."}
            </p>
            <Button asChild variant="outline"><Link href="/calendars">Open your calendars</Link></Button>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl tracking-[-0.02em]">Undo this import?</h1>
            <p className="text-muted-foreground text-pretty">
              This removes every event TimeIQ added from that email. Nothing else on your calendar changes.
            </p>
            <Button variant="aurora" size="lg" onClick={undo} disabled={busy}>
              <Undo2 className="h-4 w-4" />
              {busy ? "Undoing…" : "Undo import"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function UndoImportPage() {
  return (
    <Suspense fallback={null}>
      <UndoInner />
    </Suspense>
  );
}
