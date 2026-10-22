"use client";

import { useState, type ReactNode } from "react";

/** Progressive disclosure: show the first few items, reveal the rest on request. */
export function ShowMore({ items, initial = 5, noun = "results" }: { items: ReactNode[]; initial?: number; noun?: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initial);
  const hidden = items.length - initial;
  return (
    <div>
      <ul className="space-y-3">
        {visible.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 font-semibold text-navy underline hover:text-gold-text"
        >
          {expanded ? "Show fewer" : `Show ${hidden} more ${noun}`}
        </button>
      )}
    </div>
  );
}
