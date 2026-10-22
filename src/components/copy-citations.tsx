"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { formatCitation, type CitationInput } from "@/lib/citation";
import { Button } from "./ui";

export function CopyCitationsButton({ citations, label = "Copy citations" }: { citations: CitationInput[]; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    const text = citations.map((c, i) => `${i + 1}. ${formatCitation(c)}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <>
      <Button onClick={copy} disabled={citations.length === 0}>
        {state === "copied" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {state === "copied" ? "Copied" : label}
      </Button>
      <span role="status" className="sr-only">
        {state === "copied" ? `${citations.length} citations copied` : state === "failed" ? "Copy failed; your browser blocked clipboard access" : ""}
      </span>
    </>
  );
}
