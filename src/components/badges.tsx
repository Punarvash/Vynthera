import { AlertTriangle, BadgeCheck, Building2, FlaskConical, HelpCircle, Landmark, Sparkles } from "lucide-react";
import { Badge } from "./ui";
import { DESIGN_LABEL } from "@/lib/design";
import type { Funding, GradeLevel, LabelStatus, StudyDesign } from "@/lib/types";

export function FundingBadge({ funding }: { funding: Funding }) {
  switch (funding.kind) {
    case "industry":
      return (
        <Badge tone="industry" title={funding.reason}>
          <Building2 aria-hidden className="size-3.5" /> Industry-funded
        </Badge>
      );
    case "independent":
      return (
        <Badge tone="independent" title={funding.reason}>
          <Landmark aria-hidden className="size-3.5" /> Independent
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" title={funding.reason}>
          <HelpCircle aria-hidden className="size-3.5" /> Funding not reported
        </Badge>
      );
  }
}

export function LabelStatusBadge({ status }: { status: LabelStatus }) {
  switch (status.kind) {
    case "approved":
    case "likely-approved":
      return (
        <Badge tone="approved">
          <BadgeCheck aria-hidden className="size-3.5" /> FDA-approved{status.kind === "likely-approved" ? " (verify)" : ""}
        </Badge>
      );
    case "off-label":
    case "limitation":
      return (
        <Badge tone="offlabel">
          <AlertTriangle aria-hidden className="size-3.5" /> Off-label
        </Badge>
      );
    case "no-condition":
      return <Badge tone="neutral">Add a condition to check</Badge>;
    case "no-label":
      return <Badge tone="neutral">No FDA label found</Badge>;
  }
}

export function DesignBadge({ design, inferred }: { design: StudyDesign; inferred?: boolean }) {
  return (
    <Badge tone="neutral" title={inferred ? "Study design inferred from the title and abstract" : undefined}>
      {DESIGN_LABEL[design]}
      {inferred ? " (inferred)" : ""}
    </Badge>
  );
}

export function PreprintBadge() {
  return (
    <Badge tone="preprint" title="Preprints have not been peer reviewed">
      <FlaskConical aria-hidden className="size-3.5" /> Preprint, not peer reviewed
    </Badge>
  );
}

export function AiBadge({ children = "AI-generated summary, verify with sources" }: { children?: React.ReactNode }) {
  return (
    <Badge tone="ai">
      <Sparkles aria-hidden className="size-3.5" /> {children}
    </Badge>
  );
}

const GRADE_TONE: Record<GradeLevel, string> = {
  high: "bg-[#1d5b36] text-white",
  moderate: "bg-[#1b4b8a] text-white",
  low: "bg-[#8a5a00] text-white",
  "very-low": "bg-[#8a1c12] text-white",
  insufficient: "bg-[#5a6576] text-white",
  "needs-condition": "bg-[#5a6576] text-white",
};

export function GradePill({ level, label }: { level: GradeLevel; label: string }) {
  return <span className={`inline-block rounded-md px-2.5 py-0.5 text-base font-semibold ${GRADE_TONE[level]}`}>{label}</span>;
}
