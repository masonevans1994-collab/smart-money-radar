// Pure helpers (no React Native imports) so they're easy to test.
import type { Feed, Signal } from "./types";

export type Tab = "top" | "latest" | "contract" | "insider" | "congress" | "watch";

export const TABS: { key: Tab; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "latest", label: "Latest" },
  { key: "contract", label: "Contracts" },
  { key: "insider", label: "Insiders" },
  { key: "congress", label: "Congress" },
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
  if (s.kind === "contract") return "Contract win";
  return s.kind === "insider" ? "Insider buy" : s.type;
}

export function sourceFor(s: Signal): string {
  if (s.kind === "contract") return s.source === "DoD announcement" ? "PENTAGON" : "USASPENDING";
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
