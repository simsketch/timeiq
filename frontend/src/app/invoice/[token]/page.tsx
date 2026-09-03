"use client";

import { use, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClockLoader } from "@/components/ui/clock-loader";
import { InvoiceView } from "@/components/invoices/invoice-view";
import { LogoIcon } from "@/components/logo";
import { apiFetch } from "@/lib/api";
import { API_BASE, PublicInvoice } from "@/lib/invoicing";

export default function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    apiFetch<PublicInvoice>(`/api/public/invoices/${token}`)
      .then((inv) => {
        setInvoice(inv);
        setState("ok");
      })
      .catch(() => setState("missing"));
  }, [token]);

  return (
    <div className="relative min-h-screen">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoIcon />
            <span className="font-semibold">TimeIQ</span>
          </div>
          {state === "ok" && (
            <Button asChild>
              <a href={`${API_BASE}/api/public/invoices/${token}/pdf`} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </a>
            </Button>
          )}
        </div>
        {state === "loading" && (
          <div className="flex justify-center py-20">
            <ClockLoader size="lg" label="Loading invoice" />
          </div>
        )}
        {state === "missing" && (
          <div className="rounded-2xl border bg-background p-10 text-center text-muted-foreground">
            This invoice is unavailable. It may have been voided or the link is incorrect.
          </div>
        )}
        {state === "ok" && invoice && <InvoiceView invoice={invoice} />}
      </div>
    </div>
  );
}
