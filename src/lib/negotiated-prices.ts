// Medicare Drug Price Negotiation: Maximum Fair Prices (MFPs) for a 30-day supply, published by CMS.
// 2026 prices took effect January 1, 2026 (CMS announcement, August 15, 2024). List prices are the 2023 list prices CMS reported.

export interface NegotiatedPrice {
  /** Ingredient names as Vynthera matches them (lowercase). */
  ingredients: string[];
  brand: string;
  year: number;
  /** Negotiated price for a 30-day supply; undefined until CMS publishes it. */
  price30Day?: number;
  listPrice30Day?: number;
}

export const NEGOTIATION_SOURCE =
  "https://www.cms.gov/priorities/medicare-prescription-drug-affordability/overview/medicare-drug-price-negotiation-program";

export const NEGOTIATED_PRICES: NegotiatedPrice[] = [
  { ingredients: ["apixaban"], brand: "Eliquis", year: 2026, price30Day: 231, listPrice30Day: 521 },
  { ingredients: ["empagliflozin"], brand: "Jardiance", year: 2026, price30Day: 197, listPrice30Day: 573 },
  { ingredients: ["rivaroxaban"], brand: "Xarelto", year: 2026, price30Day: 197, listPrice30Day: 517 },
  { ingredients: ["sitagliptin"], brand: "Januvia", year: 2026, price30Day: 113, listPrice30Day: 527 },
  { ingredients: ["dapagliflozin"], brand: "Farxiga", year: 2026, price30Day: 178.5, listPrice30Day: 556 },
  { ingredients: ["sacubitril and valsartan", "sacubitril"], brand: "Entresto", year: 2026, price30Day: 295, listPrice30Day: 628 },
  { ingredients: ["etanercept"], brand: "Enbrel", year: 2026, price30Day: 2355, listPrice30Day: 7106 },
  { ingredients: ["ibrutinib"], brand: "Imbruvica", year: 2026, price30Day: 9319, listPrice30Day: 14934 },
  { ingredients: ["ustekinumab"], brand: "Stelara", year: 2026, price30Day: 4695, listPrice30Day: 13836 },
  { ingredients: ["insulin aspart"], brand: "Fiasp, NovoLog", year: 2026, price30Day: 119, listPrice30Day: 495 },
  // Selected for 2027; prices are filled in from CMS by the weekly import when available.
  { ingredients: ["semaglutide"], brand: "Ozempic, Rybelsus, Wegovy", year: 2027 },
  { ingredients: ["fluticasone furoate, umeclidinium and vilanterol", "fluticasone furoate, umeclidinium, and vilanterol"], brand: "Trelegy Ellipta", year: 2027 },
  { ingredients: ["enzalutamide"], brand: "Xtandi", year: 2027 },
  { ingredients: ["pomalidomide"], brand: "Pomalyst", year: 2027 },
  { ingredients: ["palbociclib"], brand: "Ibrance", year: 2027 },
  { ingredients: ["nintedanib"], brand: "Ofev", year: 2027 },
  { ingredients: ["linaclotide"], brand: "Linzess", year: 2027 },
  { ingredients: ["acalabrutinib"], brand: "Calquence", year: 2027 },
  { ingredients: ["deutetrabenazine"], brand: "Austedo, Austedo XR", year: 2027 },
  { ingredients: ["fluticasone furoate and vilanterol"], brand: "Breo Ellipta", year: 2027 },
  { ingredients: ["linagliptin"], brand: "Tradjenta", year: 2027 },
  { ingredients: ["rifaximin"], brand: "Xifaxan", year: 2027 },
  { ingredients: ["cariprazine"], brand: "Vraylar", year: 2027 },
  { ingredients: ["sitagliptin and metformin"], brand: "Janumet, Janumet XR", year: 2027 },
  { ingredients: ["apremilast"], brand: "Otezla", year: 2027 },
];

export function negotiatedPrices(drug: string, genericName?: string): NegotiatedPrice[] {
  const names = [drug, genericName].filter((n): n is string => Boolean(n)).map((n) => n.toLowerCase());
  return NEGOTIATED_PRICES.filter((p) => p.ingredients.some((i) => names.includes(i)));
}
