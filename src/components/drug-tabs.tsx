"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { TAB_ORDER, type TabId } from "@/lib/tabs";

/**
 * Same six tabs in the same order on every drug page; the open tab is kept in the URL for sharing.
 * Tabs listed in `lazy` are only rendered by the server when open (their data is slow or rate-limited),
 * so switching to one asks the server for the page with that tab.
 */
export function DrugTabs({ initial, panels, lazy = [] }: { initial: TabId; panels: Record<TabId, ReactNode>; lazy?: TabId[] }) {
  const router = useRouter();
  function onChange(value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    if (lazy.includes(value as TabId) && value !== initial) {
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
      return;
    }
    window.history.replaceState(window.history.state, "", url);
  }
  return (
    <Tabs.Root defaultValue={initial} onValueChange={onChange}>
      <Tabs.List
        aria-label="Drug information"
        className="no-print flex gap-1 overflow-x-auto rounded-xl border border-line/80 bg-surface p-1.5 shadow-[0_1px_2px_rgba(31,36,44,0.05)] [scrollbar-width:thin]"
      >
        {TAB_ORDER.map((t) => (
          <Tabs.Trigger
            key={t.id}
            value={t.id}
            className="shrink-0 rounded-lg px-4 py-2.5 text-[0.95rem] font-semibold text-muted transition-colors hover:bg-cream hover:text-ink data-[state=active]:bg-navy data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {TAB_ORDER.map((t) => (
        <Tabs.Content key={t.id} value={t.id} className="pt-6 focus-visible:outline-offset-4">
          {panels[t.id]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
