export const TAB_ORDER = [
  { id: "evidence", label: "Evidence" },
  { id: "cases", label: "Cases" },
  { id: "manufacturer", label: "Manufacturer" },
  { id: "costs", label: "Costs" },
  { id: "specialists", label: "Specialists" },
  { id: "patient", label: "Patient info" },
] as const;

export type TabId = (typeof TAB_ORDER)[number]["id"];

export function parseTab(v: string | string[] | undefined): TabId {
  const s = Array.isArray(v) ? v[0] : v;
  return TAB_ORDER.find((t) => t.id === s)?.id ?? "evidence";
}
