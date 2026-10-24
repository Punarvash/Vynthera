"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/** A "?" button that explains a term on tap, click or keyboard; Escape or clicking elsewhere closes it. */
export function InfoTip({ term, label }: { term: GlossaryKey; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block align-middle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What is ${label}?`}
        onClick={() => setOpen((v) => !v)}
        className="ml-1 rounded-full text-muted hover:text-navy"
      >
        <HelpCircle aria-hidden className="size-4" />
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute left-0 top-6 z-20 w-72 max-w-[80vw] rounded-lg border border-line bg-surface p-3 text-left text-sm font-normal text-ink shadow-lg"
        >
          {GLOSSARY[term]}
        </span>
      )}
    </span>
  );
}
