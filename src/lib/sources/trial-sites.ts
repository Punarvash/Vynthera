import { cacheLife } from "next/cache";
import { getJson } from "../http";

// ClinicalTrials.gov API v2: recruiting studies and the investigators and contacts at each site.
const BASE = "https://clinicaltrials.gov/api/v2/studies";
const SOURCE = "ClinicalTrials.gov";

interface RawContact {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
}

interface RawStudy {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    statusModule?: { overallStatus?: string };
    contactsLocationsModule?: {
      centralContacts?: RawContact[];
      overallOfficials?: { name?: string; affiliation?: string; role?: string }[];
      locations?: { facility?: string; status?: string; city?: string; state?: string; zip?: string; country?: string; contacts?: RawContact[] }[];
    };
  };
}

export interface TrialSite {
  nctId: string;
  title: string;
  url: string;
  facility: string;
  city: string;
  state: string;
  status: string;
  /** Site investigators and contacts as published on the study record. */
  people: { name: string; role: string; phone?: string; email?: string }[];
}

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export function stateName(code: string): string | undefined {
  return STATES[code];
}

/** Clean "Jane Doe, MD" role labels: PRINCIPAL_INVESTIGATOR -> Principal investigator. */
function role(r?: string): string {
  return (r ?? "Contact").toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Recruiting US study sites for a drug and/or condition, in a state when given (closest match first). */
export async function trialSites(params: { drug?: string; condition?: string; state?: string; city?: string }): Promise<TrialSite[]> {
  "use cache";
  cacheLife("days");
  const q = new URLSearchParams({
    "filter.overallStatus": "RECRUITING,NOT_YET_RECRUITING,ENROLLING_BY_INVITATION",
    pageSize: "40",
    fields: "NCTId,BriefTitle,OverallStatus,ContactsLocationsModule",
    "query.locn": params.state ? (stateName(params.state) ?? params.state) : "United States",
  });
  if (params.condition) q.set("query.cond", params.condition);
  if (params.drug) q.set("query.intr", params.drug);
  const data = await getJson<{ studies?: RawStudy[] }>(SOURCE, `${BASE}?${q}`);
  const wantState = params.state ? stateName(params.state) : undefined;
  const sites: TrialSite[] = [];
  for (const s of data.studies ?? []) {
    const p = s.protocolSection;
    const nctId = p?.identificationModule?.nctId;
    if (!nctId) continue;
    const officials = (p?.contactsLocationsModule?.overallOfficials ?? []).map((o) => ({ name: o.name ?? "", role: role(o.role) }));
    const central = (p?.contactsLocationsModule?.centralContacts ?? []).map((c) => ({ name: c.name ?? "", role: role(c.role), phone: c.phone, email: c.email }));
    for (const loc of p?.contactsLocationsModule?.locations ?? []) {
      if (loc.country !== "United States") continue;
      if (wantState && loc.state !== wantState) continue;
      // Sites that finished or withdrew from a still-recruiting study cannot take new patients.
      if (loc.status && !/^(RECRUITING|NOT_YET_RECRUITING|ENROLLING_BY_INVITATION|AVAILABLE)$/.test(loc.status)) continue;
      const people = (loc.contacts ?? []).map((c) => ({ name: c.name ?? "", role: role(c.role), phone: c.phone, email: c.email }));
      sites.push({
        nctId,
        title: p?.identificationModule?.briefTitle ?? nctId,
        url: `https://clinicaltrials.gov/study/${nctId}`,
        facility: loc.facility ?? "",
        city: loc.city ?? "",
        state: loc.state ?? "",
        status: (loc.status ?? p?.statusModule?.overallStatus ?? "").toLowerCase().replace(/_/g, " "),
        people: (people.length ? people : [...officials, ...central]).filter((x) => x.name).slice(0, 4),
      });
    }
  }
  const city = params.city?.toLowerCase();
  return sites.sort((a, b) => Number(b.city.toLowerCase() === city) - Number(a.city.toLowerCase() === city)).slice(0, 20);
}
