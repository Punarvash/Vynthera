"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState } from "react";
import type { Suggestion, SuggestionKind } from "@/lib/suggest";

const KIND_LABEL: Record<SuggestionKind, string> = { drug: "Drug", condition: "Condition", class: "Drug class", pair: "Drug + condition" };

/**
 * A text input with typo-tolerant suggestions (ARIA combobox). Choosing a suggestion fills the box and
 * submits the form; typing and pressing Enter still searches exactly what was typed.
 */
export function AutocompleteInput({
  name,
  kinds,
  className,
  defaultValue,
  ...input
}: {
  name: string;
  kinds: SuggestionKind[];
  className?: string;
  id: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const listId = useId();
  const [value, setValue] = useState(defaultValue ?? "");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || value.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(value)}&kind=${kinds.join(",")}`, { signal: ctrl.signal });
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setItems(data.suggestions);
        setActive(-1);
        setOpen(true);
      } catch {
        // Aborted or offline: keep the box usable without suggestions.
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, kinds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (s: Suggestion) => {
    setValue(s.label);
    setOpen(false);
    typed.current = false;
    // Let React write the value before the form reads it.
    requestAnimationFrame(() => ref.current?.form?.requestSubmit());
  };

  const showing = open && items.length > 0;
  return (
    <div className="relative">
      <input
        ref={ref}
        {...input}
        name={name}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          typed.current = true;
          setValue(e.target.value);
        }}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!showing) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            choose(items[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={className}
      />
      {showing && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-lg border border-line bg-surface py-1 text-left shadow-lg">
          {items.map((s, i) => (
            <li
              key={`${s.kind}-${s.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
              onMouseEnter={() => setActive(i)}
              className={clsx("flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2", i === active && "bg-cream")}
            >
              <span>
                <span className="font-medium text-ink">{s.label}</span>
                {s.hint && <span className="ml-2 text-sm text-muted">{s.kind === "drug" ? `(${s.hint})` : s.hint}</span>}
              </span>
              <span className="shrink-0 text-xs uppercase tracking-wide text-muted">{KIND_LABEL[s.kind]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
