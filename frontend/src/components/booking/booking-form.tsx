"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface BookingFormData {
  name: string;
  email: string;
  notes: string;
  phone: string;
  company: string;
  reason: string;
}

interface BookingFormProps {
  onSubmit: (data: BookingFormData) => void;
  loading?: boolean;
  collectPhone?: boolean;
  collectCompany?: boolean;
  collectReason?: boolean;
  defaultValues?: Partial<BookingFormData>;
  submitLabel?: string;
}

export function BookingForm({
  onSubmit,
  loading = false,
  collectPhone = false,
  collectCompany = false,
  collectReason = false,
  defaultValues,
  submitLabel = "Confirm Booking",
}: BookingFormProps) {
  const [formData, setFormData] = useState<BookingFormData>({
    name: defaultValues?.name || "",
    email: defaultValues?.email || "",
    notes: defaultValues?.notes || "",
    phone: defaultValues?.phone || "",
    company: defaultValues?.company || "",
    reason: defaultValues?.reason || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Your name"
          required
        />
      </div>

      <div>
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="your@email.com"
          required
        />
      </div>

      {collectPhone && (
        <div>
          <Label htmlFor="phone">Phone number *</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="(555) 123-4567"
            required
          />
        </div>
      )}

      {collectCompany && (
        <div>
          <Label htmlFor="company">Company *</Label>
          <Input
            id="company"
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            placeholder="Your company"
            required
          />
        </div>
      )}

      {collectReason && (
        <div>
          <Label htmlFor="reason">What is this meeting about? *</Label>
          <Textarea
            id="reason"
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            placeholder="Brief description of what you'd like to discuss"
            rows={2}
            required
          />
        </div>
      )}

      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any additional information..."
          rows={3}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Booking..." : submitLabel}
      </Button>
    </form>
  );
}
