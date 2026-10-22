export function drugHref(name: string, condition?: string, tab?: string): string {
  const params = new URLSearchParams();
  if (condition) params.set("condition", condition);
  if (tab) params.set("tab", tab);
  const qs = params.toString();
  return `/drug/${encodeURIComponent(name.toLowerCase())}${qs ? `?${qs}` : ""}`;
}
