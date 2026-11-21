"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight } from "lucide-react";

export interface BookingFormData {
  name: string;
  email: string;
  notes: string;
  phone: string;
  company: string;
  url: string;
}

interface BookingFormProps {
  onSubmit: (data: BookingFormData) => void;
  loading?: boolean;
  collectPhone?: boolean;
  requirePhone?: boolean;
  collectCompany?: boolean;
  requireCompany?: boolean;
  collectUrl?: boolean;
  requireUrl?: boolean;
  defaultValues?: Partial<BookingFormData>;
  submitLabel?: string;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
        {label}
        {required && <span className="text-[hsl(var(--aurora-1))] ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const fieldClass =
  "h-11 rounded-xl border-foreground/10 bg-background/60 backdrop-blur-md placeholder:text-muted-foreground/60 focus-visible:ring-foreground/20 focus-visible:border-foreground/20 transition-colors";

export function BookingForm({
  onSubmit,
  loading = false,
  collectPhone = false,
  requirePhone = false,
  collectCompany = false,
  requireCompany = false,
  collectUrl = false,
  requireUrl = false,
  defaultValues,
  submitLabel,
}: BookingFormProps) {
  const t = useTranslations("booking.form");
  const [formData, setFormData] = useState<BookingFormData>({
    name: defaultValues?.name || "",
    email: defaultValues?.email || "",
    notes: defaultValues?.notes || "",
    phone: defaultValues?.phone || "",
    company: defaultValues?.company || "",
    url: defaultValues?.url || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t("name")} required>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t("namePlaceholder")}
            required
            className={fieldClass}
          />
        </Field>

        <Field label={t("email")} required>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder={t("emailPlaceholder")}
            required
            className={fieldClass}
          />
        </Field>
      </div>

      {(collectPhone || collectCompany) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {collectPhone && (
            <Field label={t("phone")} required={requirePhone}>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="(555) 123-4567"
                required={requirePhone}
                className={fieldClass}
              />
            </Field>
          )}

          {collectCompany && (
            <Field label={t("company")} required={requireCompany}>
              <Input
                value={formData.company}
                onChange={(e) =>
                  setFormData({ ...formData, company: e.target.value })
                }
                placeholder={t("companyPlaceholder")}
                required={requireCompany}
                className={fieldClass}
              />
            </Field>
          )}
        </div>
      )}

      {collectUrl && (
        <Field label={t("website")} required={requireUrl}>
          <Input
            type="url"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            placeholder="https://linkedin.com/in/yourprofile"
            required={requireUrl}
            className={fieldClass}
          />
        </Field>
      )}

      <Field label={t("notes")}>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder={t("notesPlaceholder")}
          rows={3}
          className="rounded-xl border-foreground/10 bg-background/60 backdrop-blur-md placeholder:text-muted-foreground/60 focus-visible:ring-foreground/20 focus-visible:border-foreground/20 transition-colors resize-none"
        />
      </Field>

      <Button
        type="submit"
        variant="aurora"
        size="lg"
        className="w-full mt-6 h-auto min-h-11 whitespace-normal text-balance"
        disabled={loading}
      >
        {loading ? t("submitting") : submitLabel ?? t("submit")}
        {!loading && <ArrowRight className="h-4 w-4" />}
      </Button>
    </form>
  );
}
