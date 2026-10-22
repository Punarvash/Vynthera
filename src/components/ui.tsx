import clsx from "clsx";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type BadgeTone = "industry" | "independent" | "neutral" | "offlabel" | "approved" | "preprint" | "ai" | "caution";

const BADGE_TONES: Record<BadgeTone, string> = {
  industry: "bg-[#fdecd3] text-[#7a3e00] border-[#f2c58a]",
  independent: "bg-[#dff1e6] text-[#1d5b36] border-[#a9d8bb]",
  neutral: "bg-[#eeebe5] text-[#3f3a34] border-[#d8d2c7]",
  offlabel: "bg-[#fbe3e1] text-[#8a1c12] border-[#efb1aa]",
  approved: "bg-[#dff1e6] text-[#1d5b36] border-[#a9d8bb]",
  preprint: "bg-[#ede5f7] text-[#4b2a7a] border-[#cdb9ea]",
  ai: "bg-[#f5eddf] text-[#5c4520] border-[#dcc9a6]",
  caution: "bg-[#fff4d6] text-[#6b4e00] border-[#f0d58a]",
};

export function Badge({ tone, children, title }: { tone: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-base font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const BUTTON_VARIANTS = {
  primary: "bg-navy text-cream hover:bg-navy-hover",
  secondary: "border border-navy text-navy bg-surface hover:bg-cream",
  ghost: "text-navy hover:bg-[#f1ebe0]",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return <button className={clsx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return <Link className={clsx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,20,24,0.04)]", className)} {...props} />;
}

/** A link to an original source. Opens in a new tab and says so to screen readers. */
export function SourceLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx("inline-flex items-center gap-1 font-medium text-navy underline hover:text-gold-text", className)}
    >
      {children}
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <h3 className="text-lg font-semibold text-ink">{children}</h3>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded-md bg-[#efe7d8]", className)} />;
}

export function LoadingBlock({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <p className="text-muted">{label}</p>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={clsx("h-5", i % 2 ? "w-4/5" : "w-full")} />
      ))}
    </div>
  );
}
