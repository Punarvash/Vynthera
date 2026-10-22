"use client";

import { Printer, Stethoscope, User } from "lucide-react";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Button } from "./ui";

/** Toggle between the physician view and the plain-language patient view; print the patient view as a handout. */
export function PatientViews({ physician, patient }: { physician: ReactNode; patient: ReactNode }) {
  const [view, setView] = useState<"physician" | "patient">("physician");

  function printHandout() {
    setView("patient");
    // Let React show the patient view before printing it.
    requestAnimationFrame(() => {
      document.documentElement.classList.add("print-handout");
      window.print();
      document.documentElement.classList.remove("print-handout");
    });
  }

  const tab = (id: typeof view, label: string, Icon: typeof User) => (
    <button
      type="button"
      aria-pressed={view === id}
      onClick={() => setView(id)}
      className={clsx(
        "inline-flex items-center gap-2 px-4 py-2 font-semibold",
        view === id ? "bg-navy text-cream" : "bg-surface text-navy hover:bg-cream",
      )}
    >
      <Icon aria-hidden className="size-4" /> {label}
    </button>
  );

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Choose a view" className="inline-flex overflow-hidden rounded-lg border border-navy">
          {tab("physician", "Physician view", Stethoscope)}
          {tab("patient", "Patient view", User)}
        </div>
        <Button onClick={printHandout}>
          <Printer aria-hidden className="size-4" /> Print handout
        </Button>
      </div>
      <div hidden={view !== "physician"}>{physician}</div>
      <div hidden={view !== "patient"} id="handout">
        {patient}
      </div>
    </div>
  );
}
