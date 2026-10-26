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
        className="no-print -mx-4 flex overflow-x-auto border-b border-line px-4 [scrollbar-width:thin]"
      >
        {TAB_ORDER.map((t) => (
          <Tabs.Trigger
            key={t.id}
            value={t.id}
            className="shrink-0 border-b-[3px] border-transparent px-4 py-3 text-base font-semibold text-muted hover:text-ink data-[state=active]:border-gold data-[state=active]:text-ink"
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
