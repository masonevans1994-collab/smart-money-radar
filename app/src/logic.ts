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
  if (s.kind === "contract") return s.is_modification ? "More money on a contract" : "New contract";
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
    return s.history_note ?? s.reasons.find((r) => !r.startsWith("Won a"))
      ?? (s.is_modification ? "More money on a contract the company already had" : s.reasons[0] ?? "");
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

function weekStart(now = new Date()): string {
  const d = new Date(now); d.setDate(d.getDate() - 7);
  return isoDay(d);
}

export interface HeroText { figure: string; caption: string; gold: boolean }

export function heroFor(tab: Tab, feed: Feed, watchCount: number): HeroText {
  const contracts = feed.contracts ?? [];
  if (tab === "contract") {
    const f = freshness(feed);
    if (f.weekCount > 0) {
      const companies = new Set(contracts.filter((c) => (c.trade_date ?? "") >= weekStart())
        .map((c) => c.ticker)).size;
      return { figure: money(f.week), gold: true,
        caption: `awarded to ${companies} public ${companies === 1 ? "company" : "companies"} in the past 7 days` };
    }
    const total = contracts.reduce((sum, c) => sum + c.value, 0);
    return { figure: money(total), gold: true,
      caption: `awarded to public companies in the last 30 days` };
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

function isoDay(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

/** "Today", "Yesterday", or "Friday, Oct 30". */
export function dayLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "Date unknown";
  const today = isoDay(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (iso === today) return "Today";
  if (iso === isoDay(y)) return "Yesterday";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export interface DayHeader { header: string; detail: string; key: string }
export type ListItem = Signal | DayHeader;

export function isHeader(x: ListItem): x is DayHeader {
  return (x as DayHeader).header !== undefined;
}

/** Insert a heading before each new day (rows must already be newest-first). */
export function withDayHeaders(rows: Signal[], now = new Date()): ListItem[] {
  const out: ListItem[] = [];
  let i = 0;
  while (i < rows.length) {
    const day = rows[i].trade_date ?? "";
    let j = i;
    let total = 0;
    while (j < rows.length && (rows[j].trade_date ?? "") === day) {
      const r = rows[j];
      total += r.kind === "congress" ? r.amount_low : r.value;
      j++;
    }
    const n = j - i;
    const contracts = rows[i].kind === "contract";
    out.push({
      key: `h-${day}`, header: dayLabel(day, now),
      detail: contracts ? `${n} award${n === 1 ? "" : "s"}, ${money(total)}`
        : rows[i].kind === "insider" ? `${n} buy${n === 1 ? "" : "s"}, ${money(total)}`
          : `${n} trade${n === 1 ? "" : "s"}`,
    });
    out.push(...rows.slice(i, j));
    i = j;
  }
  return out;
}

/** What the top of the Contracts tab should say about freshness. */
export function freshness(feed: Feed, now = new Date()): { week: number; weekCount: number; latest: string | null; note: string | null } {
  const contracts = feed.contracts ?? [];
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const cutoff = isoDay(weekAgo);
  const recent = contracts.filter((c) => (c.trade_date ?? "") >= cutoff);
  const latest = contracts.map((c) => c.trade_date ?? "").sort().pop() || null;
  const today = isoDay(now);
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  let note: string | null = null;
  if (latest && latest < today) {
    note = weekend
      ? "Agencies don't post awards on weekends. These are the most recent ones."
      : "No awards posted yet today. Agencies usually report within a few business days.";
  }
  return { week: recent.reduce((s, c) => s + c.value, 0), weekCount: recent.length, latest, note };
}

/** Most recent contract win per ticker, for linking trades to awards. */
export function contractsByTicker(feed: Feed): Map<string, Signal> {
  const m = new Map<string, Signal>();
  for (const c of feed.contracts ?? []) {
    const cur = m.get(c.ticker);
    if (!cur || (c.trade_date ?? "") > (cur.trade_date ?? "")) m.set(c.ticker, c);
  }
  return m;
}

export function shareText(s: Signal): string {
  const lines = [s.headline];
  const note = keyNote(s);
  if (note && !s.headline.includes(note)) lines.push(note);
  if (s.change_pct !== undefined) lines.push(`Stock ${pct(s.change_pct)} since ${shortDate(s.trade_date)}.`);
  if (s.url) lines.push(s.url);
  lines.push("Via Radar. From public records. Not investment advice.");
  return lines.join("\n");
}

export const SCORE_GUIDE: [string, string][] = [
  ["70 to 100", "Stands out. Large for the company, its biggest win in years, or traded by a member of Congress beforehand."],
  ["45 to 69", "Worth a look. A sizable award or trade with at least one unusual detail."],
  ["Under 45", "Routine. Real money, but ordinary for this company or this kind of filing."],
];

// ---------- plain-English layer for people new to investing ----------

export function tierLabel(score: number): string {
  return score >= 70 ? "Stands out" : score >= 45 ? "Worth a look" : "Routine";
}

export function moveLabel(s: Signal): string | null {
  if (s.change_pct === undefined || s.change_pct === null) return null;
  const v = Math.abs(s.change_pct).toFixed(1);
  if (s.change_pct === 0) return "Stock unchanged";
  return s.change_pct > 0 ? `Stock up ${v}%` : `Stock down ${v}%`;
}

function agencyFull(s: Signal): string {
  if (s.kind !== "contract") return "";
  const sub = s.sub_agency && s.sub_agency !== s.agency ? s.sub_agency : "";
  const name = sub || s.agency || "A government agency";
  return /^(the |department|u\.s\.|army|navy|air force|space force|marine corps|defense logistics|missile defense)/i
    .test(name) ? `The ${name.replace(/^the /i, "")}` : name;
}

/** A short story of what happened, in everyday words. */
export function plainSummary(s: Signal): string[] {
  const out: string[] = [];
  if (s.kind === "contract") {
    out.push(s.is_modification
      ? `${agencyFull(s)} agreed to pay ${s.company} ${money(s.value)} more on a contract the company already had.`
      : `${agencyFull(s)} hired ${s.company} for a new contract worth ${money(s.value)}.`);
    if (s.award_pct != null && s.market_cap) {
      const p = s.award_pct;
      out.push(p >= 3
        ? `That's a lot for this company: about ${p.toFixed(p >= 10 ? 0 : 1)}% of what the whole company is worth (${money(s.market_cap)}).`
        : p < 0.5
          ? `For a company worth ${money(s.market_cap)}, that's a small amount, so on its own it may not change much.`
          : `That's about ${p.toFixed(1)}% of what the whole company is worth (${money(s.market_cap)}).`);
    } else if (s.history_note) {
      out.push(`${s.history_note}.`);
    }
    if (s.congress_before) {
      out.push("Public filings show a member of Congress bought this stock before the award was signed. That's a fact about timing only; it doesn't mean anyone did anything wrong.");
    }
  } else if (s.kind === "insider") {
    out.push(`${s.who}, ${s.role_label ? `the company's ${s.role_label.toLowerCase()}` : "a company insider"}, spent ${money(s.value)} of their own money on ${s.company} stock.`);
    out.push("Executives sell for lots of reasons, but they usually buy for one: they think the stock is worth more than its price.");
  } else {
    const who = s.owner === "Self" ? s.who : `${s.who}'s ${s.owner.toLowerCase()}`;
    const verb = s.type.startsWith("Sale") ? "sold" : s.type === "Purchase" ? "bought" : "traded";
    out.push(`${who} ${verb} ${amountLabel(s).replace("–", " to ")} of ${s.ticker} stock. Members of Congress only have to report a range, not the exact amount.`);
    if (s.lag_days && s.lag_days > 45) {
      out.push(`They reported it ${s.lag_days} days later. The law allows 45.`);
    }
  }
  const mv = moveLabel(s);
  if (mv && s.trade_date) {
    out.push(`${mv.replace("Stock", "The stock is")} since ${shortDate(s.trade_date)}.`);
  }
  return out;
}

export function tickerHelp(s: Signal): string {
  return `${s.ticker} is the company's stock symbol, the name you'd search for in any investing app.`;
}

export const KEEP_IN_MIND = [
  "News like this is public. Professional traders often react within minutes, so the price may already reflect it.",
  "Contracts can be cut, delayed or paid out over many years.",
  "Radar shows what happened. It isn't investment advice and doesn't tell you to buy or sell. Stocks can lose value.",
  "Public records can contain errors. Check the official record before relying on this.",
];
