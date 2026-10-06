"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const LOOKS_LIKE_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** "a@x.com, b@y.com" -> ["a@x.com", "b@y.com"]; commas, semicolons or spaces split. */
export const splitEmails = (raw: string | null | undefined) =>
  (raw ?? "").split(/[,;\s]+/).filter(Boolean);

/**
 * Billing addresses as removable chips. Enter, comma, space or Tab turns the
 * typed address into a chip, pasting a list adds them all, and Backspace in an
 * empty field removes the last one. The value is stored as "a, b".
 *
 * Text left in the field when it loses focus becomes a chip too, even if it
 * doesn't look like an address; it shows in red and the server names it on
 * save, so nothing typed is silently dropped.
 */
export function EmailChips({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const emails = splitEmails(value);

  function add(raw: string) {
    const next = [...emails];
    for (const part of splitEmails(raw)) {
      if (!next.some((e) => e.toLowerCase() === part.toLowerCase())) next.push(part);
    }
    onChange(next.join(", "));
    setDraft("");
  }

  function remove(i: number) {
    onChange(emails.filter((_, j) => j !== i).join(", "));
    inputRef.current?.focus();
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
    >
      {emails.map((email, i) => {
        const valid = LOOKS_LIKE_EMAIL.test(email);
        return (
          <span
            key={email}
            title={valid ? undefined : "This doesn't look like an email address"}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-md py-0.5 pl-2 pr-1",
              valid
                ? "bg-secondary text-secondary-foreground"
                : "bg-destructive/10 text-destructive ring-1 ring-destructive/40"
            )}
          >
            <span className="truncate">{email}</span>
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(i);
              }}
              className="rounded-sm p-0.5 opacity-60 hover:bg-foreground/10 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
      <input
        id={id}
        ref={inputRef}
        type="email"
        multiple
        inputMode="email"
        autoComplete="off"
        value={draft}
        placeholder={emails.length ? "Add another" : "billing@company.com"}
        onChange={(e) => {
          // A pasted or typed separator commits what came before it.
          const v = e.target.value;
          if (/[,;\s]/.test(v)) add(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === "Tab") && draft.trim()) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && emails.length) {
            remove(emails.length - 1);
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        className="min-w-[10rem] flex-1 bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
