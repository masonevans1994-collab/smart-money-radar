// Pure helpers (no React Native imports) so they're easy to test.
import type { Feed, Signal } from "./types";

export type Tab = "top" | "latest" | "contract" | "insider" | "congress" | "watch" | "record";

export const TABS: { key: Tab; label: string }[] = [
  { key: "contract", label: "Contracts" },
  { key: "top", label: "Top" },
  { key: "latest", label: "Latest" },
  { key: "record", label: "Track record" },
  { key: "congress", label: "Congress" },
  { key: "insider", label: "Insiders" },
  { key: "watch", label: "★ Watchlist" },
];

export function money(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export function allSignals(feed: Feed): Signal[] {
  return [...(feed.contracts ?? []), ...feed.insiders, ...feed.congress]
    .sort((a, b) => b.score - a.score);
}

/** Stable identity for a signal across refreshes (used for NEW badges). */
export function signalKey(s: Signal): string {
  const amount = s.kind === "congress" ? s.amount_low : s.value;
  return `${s.kind}|${s.ticker}|${s.who}|${s.trade_date ?? ""}|${amount}`;
}

export function filterSignals(
  signals: Signal[], tab: Tab, query: string, watchlist: Set<string>,
): Signal[] {
  if (tab === "record") return [];
  const q = query.trim().toLowerCase();
  const rows = signals.filter((s) => {
    if (tab === "contract" && s.kind !== "contract") return false;
    if (tab === "insider" && s.kind !== "insider") return false;
    if (tab === "congress" && s.kind !== "congress") return false;
    if (tab === "watch" && !watchlist.has(s.ticker)) return false;
    if (!q) return true;
    const company = s.kind === "congress" ? "" : s.company;
    return `${s.ticker} ${s.who} ${company}`.toLowerCase().includes(q);
  });
  if (tab === "latest") {
    return [...rows].sort((a, b) =>
      (b.disclosed || "").localeCompare(a.disclosed || "") || b.score - a.score);
  }
  return rows;
}

export function related(all: Signal[], s: Signal) {
  const sameTicker = all.filter((x) => x !== s && x.ticker === s.ticker);
  const sameWho = all.filter((x) => x !== s && x.who === s.who && x.ticker !== s.ticker);
  return { sameTicker, sameWho };
}

export function scoreColor(score: number): string {
  return score >= 70 ? "#4cc38a" : score >= 45 ? "#f0b429" : "#8b98a8";
}

export function isSell(s: Signal): boolean {
  return s.kind === "congress" && s.type.startsWith("Sale");
}

export function tagFor(s: Signal): string {
  if (s.kind === "contract") return s.is_modification ? "Contract expansion" : "Contract win";
  return s.kind === "insider" ? "Insider buy" : s.type;
}

export function sourceFor(s: Signal): string {
  if (s.kind === "contract") {
    if (s.source === "DoD announcement") return "PENTAGON";
    if (s.source === "Company 8-K") return "SEC 8-K";
    return "USASPENDING";
  }
  if (s.kind === "insider") return "SEC";
  return (s.chamber ?? "Congress").toUpperCase();
}

export function amountLabel(s: Signal): string {
  if (s.kind !== "congress") return money(s.value);
  return s.amount_high
    ? `${money(s.amount_low)}–${money(s.amount_high)}`
    : `Over ${money(s.amount_low)}`;
}

export function changeLabel(s: Signal): string | null {
  if (s.change_pct === undefined || s.change_pct === null) return null;
  const sign = s.change_pct > 0 ? "+" : "";
  return `${sign}${s.change_pct.toFixed(1)}% since`;
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

export function isFeed(x: unknown): x is Feed {
  const f = x as Feed;
  return !!f && Array.isArray(f.insiders) && Array.isArray(f.congress);
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "–";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export type SortKey = "score" | "size" | "newest";

/** Short, recognizable agency name for chips: "Department of the Navy" -> "Navy". */
export function agencyLabel(s: Signal): string {
  if (s.kind !== "contract") return "";
  const raw = (s.sub_agency || s.agency || "Other").trim();
  const map: [RegExp, string][] = [
    [/navy|marine corps/i, "Navy"], [/army/i, "Army"], [/air force|space force/i, "Air Force"],
    [/defense logistics/i, "DLA"], [/missile defense/i, "Missile Defense"],
    [/defense|war\b/i, "Defense"], [/veterans/i, "VA"], [/aeronautics|nasa/i, "NASA"],
    [/homeland|customs|immigration|fema|coast guard/i, "Homeland"], [/energy/i, "Energy"],
    [/health|hhs|food and drug|disease|medicare|nih/i, "Health"], [/treasury|internal revenue/i, "Treasury"],
    [/general services/i, "GSA"], [/transportation|aviation/i, "Transportation"],
    [/agriculture/i, "Agriculture"], [/justice|investigation/i, "Justice"], [/state\b/i, "State"],
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

export function refine(rows: Signal[], agency: string | null, sort: SortKey): Signal[] {
  let out = agency ? rows.filter((s) => agencyLabel(s) === agency) : rows;
  if (sort === "size") {
    out = [...out].sort((a, b) =>
      (b.kind === "congress" ? b.amount_low : b.value) - (a.kind === "congress" ? a.amount_low : a.value));
  } else if (sort === "newest") {
    out = [...out].sort((a, b) => (b.trade_date ?? "").localeCompare(a.trade_date ?? ""));
  }
  return out;
}
