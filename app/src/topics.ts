// Plain-word topics for contracts, so people can search by what a deal is for.
import type { Signal } from "./types";

const TOPICS: [string, RegExp][] = [
  ["ships", /\bship|submarine|destroyer|carrier|shipyard|naval vessel|hull\b/i],
  ["aircraft", /aircraft|airplane|helicopter|jet\b|fighter|bomber|aviation|f-35|f-16|c-130|kc-46/i],
  ["missiles", /missile|interceptor|munition|rocket motor|hypersonic|torpedo/i],
  ["drones", /drone|unmanned|uav|uas\b|autonomous/i],
  ["satellites and space", /satellite|launch|spacecraft|orbit|space station|lunar|nasa/i],
  ["software and IT", /software|cloud|cyber|network|data center|it services|information technology|computing|license/i],
  ["weapons and ammo", /ammunition|rifle|weapon|ordnance|artillery|armor|tank\b/i],
  ["vehicles", /vehicle|truck|tactical|humvee|armored|fleet/i],
  ["fuel", /\bfuel|jet fuel|diesel|gasoline|petroleum|propulsion/i],
  ["medical supplies", /medical|surgical|pharmac|drug|vaccine|hospital|health|clinic|prosthe|dental/i],
  ["construction", /construction|renovat|building|facility|repair|maintenance|infrastructure|roof|hvac/i],
  ["research", /research|development|study|laborator|prototype|science/i],
  ["training", /training|simulat|education|instruction/i],
  ["food", /\bfood|meal|ration|dining|subsistence|grocery/i],
  ["energy and nuclear", /nuclear|reactor|energy|power plant|uranium|electric/i],
  ["money and payments", /payment|financial|banking|mint|currency|engraving|coin/i],
  ["security", /security|guard|surveillance|screening|detection|border/i],
  ["telecom", /radio|communications|telecom|antenna|wireless|signal/i],
  ["clothing and gear", /uniform|apparel|boot|textile|body armor|helmet|gear/i],
];

export function topicsFor(s: Signal): string[] {
  if (s.kind !== "contract") return [];
  const text = `${s.description} ${s.company} ${s.sub_agency} ${s.agency}`;
  const out = TOPICS.filter(([, re]) => re.test(text)).map(([t]) => t);
  return out.slice(0, 3);
}

/** Search words across topics, description, company, agency and ticker. */
export function matchesQuery(s: Signal, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    s.ticker, s.who,
    s.kind === "contract" ? `${s.company} ${s.description} ${s.agency} ${s.sub_agency} ${topicsFor(s).join(" ")}` : "",
    s.kind === "insider" ? s.company : "",
  ].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Suggested searches: the topics that actually appear in the current feed, most common first. */
export function suggestedTopics(signals: Signal[], max = 6): string[] {
  const counts = new Map<string, number>();
  for (const s of signals) for (const t of topicsFor(s)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([t]) => t);
}
