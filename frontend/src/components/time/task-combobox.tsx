"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { authHeaders } from "@/lib/invoicing";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Task field for the Add row dialog. Lists every task already used for the
 * client, filtered as you type, while still accepting a brand new name.
 */
export function TaskCombobox({
  id,
  clientId,
  value,
  onChange,
  taken,
}: {
  id?: string;
  clientId: string;
  value: string;
  onChange: (value: string) => void;
  /** Tasks already on this week's sheet for the client; offered last, marked. */
  taken: Set<string>;
}) {
  const { getToken } = useAuth();
  const [tasks, setTasks] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    setTasks([]);
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const names = await apiFetch<string[]>(
          `/api/time-entries/tasks?client_id=${clientId}`,
          { headers: authHeaders(token) }
        );
        if (!cancelled) setTasks(names);
      } catch {
        // Suggestions are a convenience; typing a task still works without them.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, getToken]);

  const options = useMemo(() => {
    const q = norm(value);
    const matches = tasks.filter((t) => !q || norm(t).includes(q));
    // Exact match first, then tasks not yet on this week's sheet.
    return matches.sort(
      (a, b) =>
        Number(norm(b) === q) - Number(norm(a) === q) ||
        Number(taken.has(norm(a))) - Number(taken.has(norm(b)))
    );
  }, [tasks, value, taken]);

  useEffect(() => setActive(0), [value, clientId]);

  const show = open && options.length > 0;

  function pick(name: string) {
    onChange(name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        autoFocus
        required
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={id ? `${id}-list` : undefined}
        placeholder={tasks.length ? "Pick a task or type a new one" : "Platform support"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && show && norm(options[active]) !== norm(value)) {
            // First Enter picks the highlighted task; the next one submits.
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Enter") {
            // Let the form submit as usual.
            setOpen(false);
          } else if (e.key === "Escape" && show) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {show && (
        <ul
          id={id ? `${id}-list` : undefined}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {options.map((name, i) => {
            const onSheet = taken.has(norm(name));
            return (
              <li
                key={name}
                role="option"
                aria-selected={i === active}
                // mousedown fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(name);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5",
                  i === active && "bg-accent text-accent-foreground"
                )}
              >
                <span className="truncate">{name}</span>
                {norm(name) === norm(value) ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : onSheet ? (
                  <span className="shrink-0 text-xs text-muted-foreground">on sheet</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
