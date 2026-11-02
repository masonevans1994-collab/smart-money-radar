// Plain-word topics for contracts, so people can search by what a deal is for.
import type { Signal } from "./types";

const TOPICS: [string, RegExp][] = [
  ["ships", /\b(ships?|shipbuilding|submarines?|destroyers?|carriers?|shipyards?|naval vessels?|hulls?)\b/i],
  ["aircraft", /\b(aircraft|airplanes?|helicopters?|jets?|fighters?|bombers?|aviation|engines?|f-35|f-16|c-130|kc-46)\b/i],
  ["missiles", /\b(missiles?|interceptors?|munitions?|rocket motors?|hypersonic|torpedo(es)?)\b/i],
  ["drones", /\b(drones?|unmanned|uav|uas|autonomous)\b/i],
  ["satellites and space", /\b(satellites?|launch|spacecraft|orbit|orbital|space station|lunar|nasa)\b/i],
  ["software and IT", /\b(software|cloud|cyber\w*|networks?|data centers?|it services|information technology|computing|licenses?)\b/i],
  ["weapons and ammo", /\b(ammunition|rifles?|weapons?|ordnance|artillery|armor|tanks?)\b/i],
  ["vehicles", /\b(vehicles?|trucks?|tactical|humvee|armored|fleet)\b/i],
  ["fuel", /\b(fuels?|jet fuel|diesel|gasoline|petroleum|propulsion)\b/i],
  ["medical supplies", /\b(medical|surgical|pharmac\w*|drugs?|vaccines?|hospitals?|health|healthcare|clinics?|clinical|prosthe\w*|dental)\b/i],
  ["construction", /\b(construction|renovat\w*|buildings?|facility|facilities|repairs?|maintenance|infrastructure|roof|roofing|hvac)\b/i],
  ["research", /\b(research|development|study|laborator\w*|prototypes?|science|scientific)\b/i],
  ["training", /\b(training|simulat\w*|education|instruction)\b/i],
  ["food", /\b(foods?|meals?|rations?|dining|subsistence|grocery|commodities|sorghum|wheat|grain)\b/i],
  ["energy and nuclear", /\b(nuclear|reactors?|energy|power plants?|uranium|electric|electricity)\b/i],
  ["money and payments", /\b(payments?|financial|banking|mint|currency|engraving|coins?|bullion)\b/i],
  ["security", /\b(security|guards?|surveillance|screening|detection|border)\b/i],
  ["telecom", /\b(radios?|communications?|telecom\w*|antennas?|wireless|signals?)\b/i],
  ["clothing and gear", /\b(uniforms?|apparel|boots?|textiles?|body armor|helmets?|gear)\b/i],
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
    s.kind === "congress" ? `${s.company ?? ""} ${s.type} ${s.owner}` : "",
  ].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Suggested searches: the topics that actually appear in the current feed, most common first. */
export function suggestedTopics(signals: Signal[], max = 6): string[] {
  const counts = new Map<string, number>();
  for (const s of signals) for (const t of topicsFor(s)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([t]) => t);
}
