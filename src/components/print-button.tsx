"use client";

import { Printer } from "lucide-react";
import { useRef } from "react";
import { Button } from "./ui";

/** Prints only the section the button sits in (its closest `.print-area`), e.g. a patient cost sheet. */
export function PrintButton({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  function print() {
    const area = ref.current?.closest(".print-area");
    if (!area) return window.print();
    area.classList.add("print-target");
    document.documentElement.classList.add("print-section");
    window.print();
    document.documentElement.classList.remove("print-section");
    area.classList.remove("print-target");
  }
  return (
    <span ref={ref}>
      <Button onClick={print}>
        <Printer aria-hidden className="size-4" /> {label}
      </Button>
    </span>
  );
}
