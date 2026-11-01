// Pure helpers (no React Native imports) so they're easy to test.
import type { Feed, Signal } from "./types";

export type Tab = "contract" | "congress" | "insider" | "watch" | "record";
export type SortKey = "score" | "size" | "newest";

export const TABS: { key: Tab; label: string }[] = [
  { key: "contract", label: "Contracts" },
  { key: "congress", label: "Congress" },
  { key: "insider", label: "Insiders" },
  { key: "watch", label: "Saved" },
  { key: "record", label: "Record" },
];

export function money(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(v >= 1e10 ? 0 : 2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export function allSignals(feed: Feed): Signal[] {
  return [...(feed.contracts ?? []), ...feed.insiders, ...feed.congress]
    .sort((a, b) => b.score - a.score);
}

/** Stable identity for a signal across refreshes (used for "New" markers). */
export function signalKey(s: Signal): string {
  const amount = s.kind === "congress" ? s.amount_low : s.value;
  return `${s.kind}|${s.ticker}|${s.who}|${s.trade_date ?? ""}|${amount}`;
}

function size(s: Signal): number {
  return s.kind === "congress" ? s.amount_low : s.value;
}

export function filterSignals(
  signals: Signal[], tab: Tab, query: string, watchlist: Set<string>,
): Signal[] {
  if (tab === "record") return [];
  const q = query.trim().toLowerCase();
  return signals.filter((s) => {
    if (tab === "watch") { if (!watchlist.has(s.ticker)) return false; }
    else if (s.kind !== tab) return false;
    if (!q) return true;
    const company = s.kind === "congress" ? "" : s.company;
    return `${s.ticker} ${s.who} ${company}`.toLowerCase().includes(q);
  });
}

export function refine(rows: Signal[], agency: string | null, sort: SortKey): Signal[] {
  let out = agency ? rows.filter((s) => agencyLabel(s) === agency) : rows;
  if (sort === "size") out = [...out].sort((a, b) => size(b) - size(a));
  else if (sort === "newest") {
    out = [...out].sort((a, b) =>
      (b.trade_date ?? "").localeCompare(a.trade_date ?? "") || b.score - a.score);
  }
  return out;
}

export function related(all: Signal[], s: Signal) {
  const sameTicker = all.filter((x) => x !== s && x.ticker === s.ticker);
  const sameWho = all.filter((x) => x !== s && x.who === s.who && x.ticker !== s.ticker);
  return { sameTicker, sameWho };
}

/** Short, recognizable agency name: "Department of the Navy" -> "Navy". */
export function agencyLabel(s: Signal): string {
  if (s.kind !== "contract") return "";
  const raw = (s.sub_agency || s.agency || "Other").trim();
  const map: [RegExp, string][] = [
    [/navy|marine corps/i, "Navy"], [/army/i, "Army"], [/air force|space force/i, "Air Force"],
    [/defense logistics/i, "Defense Logistics"], [/missile defense/i, "Missile Defense"],
    [/defense|war\b/i, "Defense"], [/veterans/i, "Veterans Affairs"], [/aeronautics|nasa/i, "NASA"],
    [/homeland|customs|immigration|fema|coast guard/i, "Homeland Security"], [/energy/i, "Energy"],
    [/health|hhs|food and drug|disease|medicare|nih/i, "Health"], [/treasury|internal revenue/i, "Treasury"],
    [/general services/i, "GSA"], [/transportation|aviation/i, "Transportation"],
    [/agriculture/i, "Agriculture"], [/justice|investigation/i, "Justice"], [/\bstate\b/i, "State"],
  ];
  for (const [re, label] of map) if (re.test(raw)) return label;
  return raw.replace(/^Department of (the )?/i, "");
}

export function topAgencies(signals: Signal[], max = 7): string[] {
  const counts = new Map<string, number>();
  for (const s of signals) {
    if (s.kind !== "contract") continue;
    const a = agencyLabel(s);
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([a]) => a);
}

export function scoreTier(score: number): "high" | "mid" | "low" {
  return score >= 70 ? "high" : score >= 45 ? "mid" : "low";
}

export function isSell(s: Signal): boolean {
  return s.kind === "congress" && s.type.startsWith("Sale");
}

export function tagFor(s: Signal): string {
  if (s.kind === "contract") return s.is_modification ? "Contract expansion" : "New contract";
  return s.kind === "insider" ? "Insider buy" : s.type;
}

export function sourceFor(s: Signal): string {
  if (s.kind === "contract") {
    if (s.source === "DoD announcement") return "Pentagon announcement";
    if (s.source === "Company 8-K") return "Company SEC filing";
    return "USAspending.gov";
  }
  if (s.kind === "insider") return "SEC Form 4";
  return s.chamber === "Senate" ? "Senate disclosure" : "House disclosure";
}

export function amountLabel(s: Signal): string {
  if (s.kind !== "congress") return money(s.value);
  return s.amount_high
    ? `${money(s.amount_low)}–${money(s.amount_high)}`
    : `Over ${money(s.amount_low)}`;
}

/** The one line that says why this row matters. */
export function keyNote(s: Signal): string {
  if (s.kind === "contract") {
    return s.history_note ?? s.reasons.find((r) => !r.startsWith("Won a")) ?? s.reasons[0] ?? "";
  }
  return s.reasons[1] ?? s.reasons[0] ?? "";
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "–";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function changeLabel(s: Signal): string | null {
  if (s.change_pct === undefined || s.change_pct === null) return null;
  return pct(s.change_pct);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function timeAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export interface HeroText { figure: string; caption: string; gold: boolean }

export function heroFor(tab: Tab, feed: Feed, watchCount: number): HeroText {
  const contracts = feed.contracts ?? [];
  if (tab === "contract") {
    const total = contracts.reduce((sum, c) => sum + c.value, 0);
    const companies = new Set(contracts.map((c) => c.ticker)).size;
    return {
      figure: money(total), gold: true,
      caption: `awarded to ${companies} public ${companies === 1 ? "company" : "companies"} in the last 30 days`,
    };
  }
  if (tab === "congress") {
    const buys = feed.congress.filter((t) => t.type === "Purchase").length;
    return { figure: String(feed.congress.length), gold: false,
      caption: `stock trades disclosed by members of Congress, ${buys} of them purchases` };
  }
  if (tab === "insider") {
    return { figure: String(feed.insiders.length), gold: false,
      caption: "open-market buys by company executives and directors" };
  }
  if (tab === "watch") {
    return { figure: String(watchCount), gold: false,
      caption: watchCount === 1 ? "stock you're following" : "stocks you're following" };
  }
  return { figure: "Record", gold: false, caption: "how stocks did after each kind of signal" };
}

export function isFeed(x: unknown): x is Feed {
  const f = x as Feed;
  return !!f && Array.isArray(f.insiders) && Array.isArray(f.congress);
}
