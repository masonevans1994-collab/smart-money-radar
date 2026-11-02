// Pure helpers (no React Native imports) so they're easy to test.
import { matchesQuery } from "./topics";
import type { Feed, Signal, TrackGroup } from "./types";

export type Tab = "contract" | "people" | "watch" | "record" | "you";
export type SortKey = "score" | "size" | "newest" | "move" | "share";

export const TABS: { key: Tab; label: string }[] = [
  { key: "contract", label: "Contracts" },
  { key: "people", label: "People" },
  { key: "watch", label: "Saved" },
  { key: "record", label: "Record" },
  { key: "you", label: "You" },
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
  if (tab === "record" || tab === "you") return [];
  const q = query.trim();
  return signals.filter((s) => {
    if (tab === "watch") { if (!watchlist.has(s.ticker)) return false; }
    else if (tab === "people") { if (s.kind === "contract") return false; }
    else if (s.kind !== tab) return false;
    return matchesQuery(s, q);
  });
}

export function refine(rows: Signal[], agency: string | null, sort: SortKey): Signal[] {
  let out = agency ? rows.filter((s) => agencyLabel(s) === agency) : rows;
  if (sort === "size") out = [...out].sort((a, b) => size(b) - size(a));
  else if (sort === "share") {
    // Biggest relative to the company first: the one cut where the history shows any pattern.
    const pct = (s: Signal) => (s.kind === "contract" ? s.award_pct ?? -1 : -1);
    out = [...out].sort((a, b) => pct(b) - pct(a));
  }
  else if (sort === "move") {
    out = [...out].sort((a, b) => Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0));
  }
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
    [/social security/i, "Social Security"], [/commerce/i, "Commerce"], [/education/i, "Education"],
    [/interior/i, "Interior"], [/labor/i, "Labor"], [/environmental/i, "EPA"],
  ];
  for (const [re, label] of map) if (re.test(raw)) return label;
  return raw.replace(/^(United States |U\.S\. )?Department of (the )?/i, "");
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
    if (s.source === "Company 8-K") return "Company's own SEC filing";
    return "USAspending.gov (official record)";
  }
  if (s.kind === "insider") return "SEC filing";
  return s.chamber === "Senate" ? "Senate disclosure" : "House disclosure";
}

export function amountLabel(s: Signal): string {
  if (s.kind !== "congress") return money(s.value);
  return s.amount_high
    ? `${money(s.amount_low)}–${money(s.amount_high)}`
    : `Over ${money(s.amount_low)}`;
}

/** The one line that says why this row matters. */
/** One-line headline in everyday words, for lists: "Honeywell: $323M more from Energy". */
export function plainHeadline(s: Signal): string {
  if (s.kind === "contract") {
    return s.is_modification
      ? `${shortName(s)}: ${amountLabel(s)} more from ${agencyLabel(s)}`
      : `${shortName(s)}: new ${amountLabel(s)} contract from ${agencyLabel(s)}`;
  }
  if (s.kind === "congress") {
    const verb = s.type.startsWith("Sale") ? "sold" : s.type === "Purchase" ? "bought" : "traded";
    return `${s.who} ${verb} ${amountLabel(s)} of ${shortName(s)}`;
  }
  return `${s.who} bought ${amountLabel(s)} of ${shortName(s)} stock`;
}

export function keyNote(s: Signal): string {
  if (s.kind === "contract") {
    const h = lastTimeHeadline(s);
    if (h) return h;
  }
  if (s.kind === "contract") {
    return s.history_note ?? s.reasons.find((r) => !r.startsWith("Won a"))
      ?? (s.is_modification ? "More money on a contract the company already had" : s.reasons[0] ?? "");
  }
  if (s.reasons.length > 1) return s.reasons[1];
  if (s.kind === "congress") {
    const what = s.company ? `${shortName(s)} stock` : "this stock";
    return s.type === "Purchase" ? `A member of Congress chose to buy ${what}`
      : s.type.startsWith("Sale") ? `A member of Congress sold some of ${s.company ? "their " + what : what}`
        : s.reasons[0] ?? "";
  }
  return s.reasons[0] ?? "";
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "–";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function changeLabel(s: Signal): string | null {
  if (s.change_pct === undefined || s.change_pct === null) return null;
  return pct(s.change_pct);
}

export function shortDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", withYear ? { month: "short", day: "numeric", year: "numeric" }
    : { month: "short", day: "numeric" });
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
  if (tab === "people") {
    const ps = peopleSummary(feed);
    if (ps.buys + ps.sells === 0) return { figure: "0", gold: false, caption: "trades reported by members of Congress or executives" };
    return { figure: `${ps.buys} ${ps.buys === 1 ? "buy" : "buys"}`, gold: false,
      caption: `and ${ps.sells} ${ps.sells === 1 ? "sale" : "sales"} reported by ${ps.members} ${ps.members === 1 ? "member" : "members"} of Congress${ps.execs ? ` and ${ps.execs} ${ps.execs === 1 ? "executive" : "executives"}` : ""}` };
  }
  if (tab === "watch") {
    return { figure: String(watchCount), gold: false,
      caption: watchCount === 1 ? "stock you're following" : "stocks you're following" };
  }
  if (tab === "you") return { figure: "You", gold: false, caption: "your streak, your calls and what you've learned" };
  return { figure: "Record", gold: false, caption: "how stocks did after each kind of signal" };
}

export interface PeopleSummary {
  buys: number; sells: number; members: number; execs: number;
  /** Stocks bought by the most people, most buyers first. */
  topBuys: { ticker: string; name: string; buyers: number; latest: Signal }[];
}

/** What the People tab is about: who's buying what, not just how many filings. */
export function peopleSummary(feed: Feed): PeopleSummary {
  const con = feed.congress ?? [], ins = feed.insiders ?? [];
  const buys = con.filter((t) => t.type === "Purchase").length + ins.length;
  const sells = con.filter((t) => t.type.startsWith("Sale")).length;
  const members = new Set(con.map((t) => t.who)).size;
  const execs = new Set(ins.map((t) => t.who)).size;
  const byTicker = new Map<string, { buyers: Set<string>; latest: Signal }>();
  for (const t of [...con.filter((x) => x.type === "Purchase"), ...ins] as Signal[]) {
    const cur = byTicker.get(t.ticker) ?? { buyers: new Set<string>(), latest: t };
    cur.buyers.add(t.who);
    if ((t.trade_date ?? "") > (cur.latest.trade_date ?? "")) cur.latest = t;
    byTicker.set(t.ticker, cur);
  }
  const topBuys = [...byTicker.entries()]
    .map(([ticker, v]) => ({ ticker, name: shortName(v.latest), buyers: v.buyers.size, latest: v.latest }))
    .sort((a, b) => b.buyers - a.buyers || (b.latest.trade_date ?? "").localeCompare(a.latest.trade_date ?? ""))
    .slice(0, 5);
  return { buys, sells, members, execs, topBuys };
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
    const hour = now.getHours();
    note = weekend
      ? "Nothing new on weekends; agencies post on business days."
      : hour < 12
        ? "It's early: agencies post through the day, and Radar checks every 30 minutes."
        : "Nothing posted yet today. Agencies usually report a deal within a few business days of signing it.";
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
  const lines: string[] = [];
  const story = plainSummary(s);
  if (story.length) lines.push(story[0]);
  else lines.push(s.headline);
  if (s.kind === "contract") {
    const last = lastTimeHeadline(s);
    if (last) lines.push(last);
    const why = whyLine(s);
    if (why) lines.push(why.replace(/^Why\? /, ""));
  }
  const mv = moveLabel(s);
  if (mv && s.trade_date) lines.push(`${mv} since ${shortDate(s.trade_date)}.`);
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

/** True when the market hasn't had a trading day since the award or trade
 *  (signed Friday, viewed on the weekend): there's no move to report yet. */
export function tooSoon(s: Signal): boolean {
  return !!s.price_date && !!s.trade_date && s.price_date <= s.trade_date;
}

export function moveLabel(s: Signal): string | null {
  if (s.change_pct === undefined || s.change_pct === null) return null;
  if (tooSoon(s)) return "Too soon to tell";
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

/** "Senior EVP & CFO" -> "senior EVP & CFO": lower-case the words, keep the acronyms. */
export function roleWords(role: string): string {
  return role.split(" ").map((w) => (/^[A-Z&]{2,5}$/.test(w) ? w : w.toLowerCase())).join(" ");
}

/** What happened after past awards of a similar size *relative to the company*.
 *  From a study of 1,817 awards of $25M+ to 49 public companies, Nov 2023 to Nov 2026,
 *  measured 30 trading days after signing against the S&P 500. */
export const SIZE_HISTORY = [
  { min: 10, n: 6, beat: 5, text: "Awards this big for a company are rare. In the past three years, the stock beat the market a month later in 5 of 6 such cases. That's far too few to count on." },
  { min: 3, n: 34, beat: 16, text: "In the past three years, after awards worth 3% to 10% of the company, the stock beat the market a month later 47% of the time: no better than a coin flip." },
  { min: 0.5, n: 313, beat: 175, text: "In the past three years, after awards worth 0.5% to 3% of the company, the stock beat the market a month later 56% of the time: only slightly better than a coin flip." },
  { min: 0, n: 1384, beat: 692, text: "For awards this small compared with the company, the stock beat the market a month later about half the time in the past three years. On its own, a deal like this rarely moves the stock." },
];

export function sizeHistoryLine(s: Signal): string | null {
  if (s.kind !== "contract" || s.award_pct == null) return null;
  return SIZE_HISTORY.find((b) => (s.award_pct as number) >= b.min)?.text ?? null;
}

/** A short story of what happened, in everyday words. */
export function plainSummary(s: Signal): string[] {
  const out: string[] = [];
  if (s.kind === "contract") {
    out.push(s.is_modification
      ? `${agencyFull(s)} agreed to pay ${shortName(s)} ${money(s.value)} more on a contract the company already had.`
      : `${agencyFull(s)} hired ${shortName(s)} for a new contract worth ${money(s.value)}.`);
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
    out.push(`${s.who}, ${s.role_label ? `the company's ${roleWords(s.role_label)}` : "a company insider"}, spent ${money(s.value)} of their own money on ${shortName(s)} stock.`);
    out.push("Executives sell their stock for lots of reasons, but they usually buy it for one: they think it's worth more than the price.");
  } else {
    const who = s.owner === "Self" ? s.who : `${s.who}'s ${s.owner.toLowerCase()}`;
    const verb = s.type.startsWith("Sale") ? "sold" : s.type === "Purchase" ? "bought" : "traded";
    out.push(`${who} ${verb} ${amountLabel(s).replace("–", " to ")} of ${s.company ? `${shortName(s)} (${s.ticker})` : s.ticker} stock. Members of Congress only have to report a range, not the exact amount.`);
    if (s.lag_days && s.lag_days > 45) {
      out.push(`They reported it ${s.lag_days} days later. The law allows 45.`);
    }
    if (s.type.startsWith("Sale")) {
      out.push("People sell stock for all sorts of reasons: taxes, a house, spreading money around. A sale says much less than a purchase does.");
    }
  }
  const mv = moveLabel(s);
  if (mv && s.trade_date && tooSoon(s)) {
    out.push(s.trade_date >= isoDay(new Date())
      ? "This was signed today, so there's no stock move to show yet. Check back after the next market close."
      : `The market hasn't had a trading day since ${shortDate(s.trade_date)} yet, so there's no stock move to show. Check back after the next market day.`);
  } else if (mv && s.trade_date) {
    out.push(`${mv.replace("Stock", "The stock is")} since ${shortDate(s.trade_date)}.`);
  }
  return out;
}

export function tickerHelp(s: Signal): string {
  return `${s.ticker} is the company's stock symbol, the code you'd search for in any investing app.`;
}

/** Glossary terms that apply to this item, for the "Explain" row. */
export function termsFor(s: Signal): string[] {
  const t = ["Stock symbol", "Public company"];
  if (s.kind === "contract") {
    t.unshift(s.is_modification ? "Add-on" : "Contract award");
    t.push("Agency");
    if (s.market_cap) t.push("Market value");
    if (s.history?.closest) t.push("Beat the market", "Points");
    if (s.sector_pct !== undefined) t.push("Group");
    if (tooSoon(s)) t.push("Too soon to tell");
    if (s.committee_flag) t.push("Committee");
  } else if (s.kind === "insider") {
    t.unshift("Insider", "Open-market buy");
  } else {
    t.unshift("Congressional trade");
  }
  t.push("Score");
  return t;
}

export const KEEP_IN_MIND = [
  "News like this is public. Professional traders often react within minutes, so the price may already reflect it.",
  "Contracts can be cut, delayed or paid out over many years.",
  "Radar shows what happened. It isn't investment advice and doesn't tell you to buy or sell. Stocks can lose value.",
  "Public records can contain errors. Check the official record before relying on this.",
];

/** The cautions that fit this kind of record. */
export function keepInMind(s: Signal): string[] {
  const [publicNews, contracts, advice, records] = KEEP_IN_MIND;
  if (s.kind === "contract") return [publicNews, contracts, advice, records];
  if (s.kind === "congress") {
    return [
      "Members of Congress report trades up to 45 days later, so the price has usually moved on by the time anyone sees it.",
      "A trade is a fact about one person's money, not information about the company.",
      advice, records,
    ];
  }
  return [publicNews, "Executives sell for many reasons; buys are the more telling signal, but they can still be wrong.", advice, records];
}

/** Largest contract signed in the past 7 days (a factual starting point). */
export function biggestThisWeek(feed: Feed, now = new Date()): Signal | null {
  const cutoff = weekStart(now);
  const recent = (feed.contracts ?? []).filter((c) => (c.trade_date ?? "") >= cutoff);
  if (!recent.length) return null;
  return recent.reduce((a, b) => (b.value > a.value ? b : a));
}

/** For the Saved tab: one summary per saved stock, built from everything in the feed. */
export interface SavedStock {
  ticker: string;
  company: string;
  contracts: Signal[];
  trades: Signal[];
  latest?: Signal;
}

export function savedStocks(all: Signal[], watchlist: Set<string>): SavedStock[] {
  const out: SavedStock[] = [];
  for (const t of watchlist) {
    const items = all.filter((s) => s.ticker === t);
    const contracts = items.filter((s) => s.kind === "contract");
    const trades = items.filter((s) => s.kind !== "contract");
    const latest = [...items].sort((a, b) => (b.trade_date ?? "").localeCompare(a.trade_date ?? ""))[0];
    const named = items.find((s) => s.kind !== "congress") as Exclude<Signal, { kind: "congress" }> | undefined;
    out.push({ ticker: t, company: named?.company ?? t, contracts, trades, latest });
  }
  return out.sort((a, b) => (b.latest?.trade_date ?? "").localeCompare(a.latest?.trade_date ?? ""));
}

/** The past week's contract story, for a recap card. */
export interface Recap {
  total: number;
  count: number;
  companies: number;
  biggest?: Signal;
  bestMover?: Signal;
  topAgency?: string;
  periodLabel: string;
}

export function weeklyRecap(feed: Feed, now = new Date()): Recap | null {
  const cutoff = weekStart(now);
  const recent = (feed.contracts ?? []).filter((c) => (c.trade_date ?? "") >= cutoff);
  if (!recent.length) return null;
  const withMove = recent.filter((c) => c.change_pct !== undefined && !tooSoon(c));
  const byAgency = new Map<string, number>();
  for (const c of recent) byAgency.set(agencyLabel(c), (byAgency.get(agencyLabel(c)) ?? 0) + c.value);
  const topAgency = [...byAgency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    total: recent.reduce((s, c) => s + c.value, 0),
    count: recent.length,
    companies: new Set(recent.map((c) => c.ticker)).size,
    biggest: recent.reduce((a, b) => (b.value > a.value ? b : a)),
    bestMover: withMove.length ? withMove.reduce((a, b) => ((b.change_pct ?? 0) > (a.change_pct ?? 0) ? b : a)) : undefined,
    topAgency,
    periodLabel: `${shortDate(cutoff)} to ${shortDate(isoDay(now))}`,
  };
}

/** One line a newcomer can read in a second, from real prices. */
/** "Honeywell International Inc." -> "Honeywell": the name people actually say. */
export function shortName(s: { company?: string; ticker: string }): string {
  if (!s.company) return s.ticker;
  const short = s.company.split(/ (Inc|Corp|plc|Co|Company|Corporation|Holdings|Technologies|International|Group|Ltd|Limited|N\.V\.|S\.A\.)\b/i)[0].replace(/,$/, "").trim();
  return short || s.company;
}

export function lastTimeHeadline(s: Signal): string | null {
  if (s.kind !== "contract" || !s.history?.closest || s.history.closest.d30 == null) return null;
  const c = s.history.closest;
  const d30 = c.d30 as number;
  const short = shortName(s);
  const n = Math.round(Math.abs(d30));
  const what = d30 > 0.5 ? `went up ${n}%` : d30 < -0.5 ? `went down ${n}%` : "barely moved";
  return `Last time ${short} won a deal like this, its stock ${what}.`;
}

/** The small print under the headline. */
export function lastTimeDetail(s: Signal): string | null {
  if (s.kind !== "contract" || !s.history?.closest) return null;
  const c = s.history.closest;
  const w30 = s.history.windows["30"];
  const ups = w30 ? Math.round((w30.beat_pct / 100) * w30.n) : null;
  const first = `That was ${money(c.value)} in ${shortDate(c.date, true).replace(/^(\w+) \d+, /, "$1 ")}, measured over the next 30 days.`;
  const second = w30 && ups !== null
    ? ` Out of its last ${w30.n} deals, the stock beat the market afterward ${ups} time${ups === 1 ? "" : "s"}.` : "";
  return first + second;
}

/** Plain sentences about the closest past award of similar size, from real prices. */
export function lastTimeLines(s: Signal): string[] | null {
  if (s.kind !== "contract" || !s.history?.closest) return null;
  const c = s.history.closest;
  const agency = c.agency.replace(/^Department of (the )?/i, "");
  const out = [`Closest match: ${money(c.value)} from ${agency} on ${shortDate(c.date, true)}.`];
  if (c.d30 != null) {
    const dir = c.d30 > 0 ? "rose" : c.d30 < 0 ? "fell" : "was flat";
    const vs = c.d30_vs_spy > 0 ? `${c.d30_vs_spy.toFixed(1)} points better than the market`
      : c.d30_vs_spy < 0 ? `${Math.abs(c.d30_vs_spy).toFixed(1)} points worse than the market` : "about the same as the market";
    out.push(`Over the next 30 days the stock ${dir}${c.d30 !== 0 ? ` ${Math.abs(c.d30).toFixed(1)}%` : ""}, ${vs}.`);
  }
  if (c.d1 != null) out.push(`On the day itself it moved ${c.d1 > 0 ? "+" : ""}${c.d1.toFixed(1)}%.`);
  return out;
}

/** The most likely reason the stock did (or didn't) react, from measurable facts. */
export function whyLine(s: Signal): string | null {
  if (s.kind !== "contract") return null;
  const short = shortName(s);
  const pct = s.award_pct;
  const w30 = s.history?.windows["30"];
  const reacts = w30 ? w30.beat_pct >= 60 && w30.avg_vs_spy >= 1 : null;
  if (pct != null && pct < 0.5) {
    const times = Math.round(100 / pct);
    return `Why? ${money(s.value)} is only ${pct.toFixed(pct < 0.1 ? 2 : 1)}% of what ${short} is worth. `
      + `It would take about ${times} deals this size to change the company. One barely registers.`;
  }
  if (s.is_modification && (reacts === false || reacts === null)) {
    return `Why? This adds money to a contract ${short} already had. Investors usually count on that money in advance, so it's rarely a surprise.`;
  }
  if (pct != null && pct >= 3) {
    return `Why? ${money(s.value)} is about ${pct.toFixed(pct >= 10 ? 0 : 1)}% of what ${short} is worth. `
      + `When one deal is that big for a company, its stock tends to react.`;
  }
  if (reacts === false) {
    return `Why? ${short}'s stock moves with the economy, its other businesses and the overall market far more than with any one government contract.`;
  }
  if (reacts === true) {
    return `Why? Government work is a big part of what ${short} does, so each award changes what investors expect it to earn.`;
  }
  return null;
}

/** "Defense stocks overall are up 2.1% over the same stretch, so most of this move is the sector." */
export function sectorLine(s: Signal): string | null {
  if (s.kind !== "contract" || s.sector_pct === undefined || s.change_pct === undefined || !s.sector || tooSoon(s)) return null;
  const sec = s.sector_pct, own = s.change_pct;
  const label = s.sector.charAt(0).toUpperCase() + s.sector.slice(1);
  const dir = sec > 0.2 ? `up ${sec.toFixed(1)}%` : sec < -0.2 ? `down ${Math.abs(sec).toFixed(1)}%` : "flat";
  const gap = own - sec;
  let verdict: string;
  if (Math.abs(own) < 0.5 && Math.abs(sec) < 0.5) verdict = "Neither has moved much.";
  else if (Math.abs(gap) < 1) verdict = "So this stock is just moving with its group, not because of the contract.";
  else if (gap > 0) verdict = `So this stock has done ${gap.toFixed(1)} points better than its group.`;
  else verdict = `So this stock has done ${Math.abs(gap).toFixed(1)} points worse than its group.`;
  return `${label} overall are ${dir} over the same stretch. ${verdict}`;
}

export interface AgencySummary {
  label: string;
  count: number;
  total: number;
  avgMove: number | null;
  upCount: number;
  contracts: Signal[];
}

export function agencySummary(all: Signal[], label: string): AgencySummary {
  const contracts = all.filter((s) => s.kind === "contract" && agencyLabel(s) === label)
    .sort((a, b) => (b.trade_date ?? "").localeCompare(a.trade_date ?? ""));
  const moved = contracts.filter((c) => c.change_pct !== undefined);
  return {
    label, count: contracts.length,
    total: contracts.reduce((s, c) => s + (c.kind === "contract" ? c.value : 0), 0),
    avgMove: moved.length ? moved.reduce((s, c) => s + (c.change_pct ?? 0), 0) / moved.length : null,
    upCount: moved.filter((c) => (c.change_pct ?? 0) > 0).length,
    contracts,
  };
}

/** A calm, specific note when a data source is down; null when all is well. */
export function statusNote(feed: Feed): string | null {
  const st = feed.status ?? {};
  if (st.contracts === "stale") return "The contracts site isn't answering right now, so these are from the last good update.";
  if (st.contracts === "unavailable") return "The contracts site isn't answering right now. Radar will try again at the next update.";
  if (st.prices === "unavailable") return "Stock prices aren't available right now, so moves since each award are hidden.";
  return null;
}

/** "Since you were last here: 4 new contracts worth $1.2B. Biggest: ..." */
export function catchUp(signals: Signal[], seenBefore: Set<string> | null, lastOpen: string | null,
  now = new Date()): string | null {
  if (!seenBefore || !lastOpen) return null;
  const daysAway = Math.round((now.getTime() - new Date(`${lastOpen}T12:00:00`).getTime()) / 86400000);
  if (daysAway < 2) return null;
  const fresh = signals.filter((s) => s.kind === "contract" && !seenBefore.has(signalKey(s)));
  const since = dayLabel(lastOpen, now).replace(/^(Today|Yesterday)$/, (m) => m.toLowerCase());
  if (!fresh.length) return `Welcome back. Nothing new in contracts since ${since}.`;
  const total = fresh.reduce((t, c) => t + (c.kind === "contract" ? c.value : 0), 0);
  const big = fresh.reduce((a, b) => ((b.kind === "contract" ? b.value : 0) > (a.kind === "contract" ? a.value : 0) ? b : a));
  const name = big.kind === "contract" ? big.company : big.ticker;
  return `Welcome back. ${fresh.length} new contract${fresh.length === 1 ? "" : "s"} worth ${money(total)} since `
    + `${since}. Biggest: ${amountLabel(big)} to ${name}.`;
}

export function recapShareText(r: Recap): string {
  const lines = [`This week the government signed ${r.count} contract${r.count === 1 ? "" : "s"} worth ${money(r.total)} with ${r.companies} public compan${r.companies === 1 ? "y" : "ies"}${r.topAgency ? `, led by ${r.topAgency}` : ""}.`];
  if (r.biggest) lines.push(`Biggest: ${amountLabel(r.biggest)} to ${shortName(r.biggest)}.`);
  if (r.bestMover) lines.push(`Best mover: ${shortName(r.bestMover)}, ${moveLabel(r.bestMover)?.toLowerCase().replace("stock ", "")} since its award.`);
  lines.push("Via Radar. From public records. Not investment advice.");
  return lines.join("\n");
}

/** One plain sentence per track-record group. */
export function recordSentence(g: TrackGroup): string {
  if (!g.n) return "Not enough history yet.";
  const vs = g.avg_vs_spy ?? 0;
  const dir = vs > 0.5 ? `did better than the market by ${vs.toFixed(1)} points on average`
    : vs < -0.5 ? `did worse than the market by ${Math.abs(vs).toFixed(1)} points on average` : "moved about like the market";
  return `After ${g.n} of these, the stock ${dir}. It beat the market ${g.beat_spy_pct ?? 0}% of the time.`;
}

/** Other recent winners from the same agency, biggest first (for comparison). */
export function peersFor(all: Signal[], s: Signal, max = 4): Signal[] {
  if (s.kind !== "contract") return [];
  const label = agencyLabel(s);
  const seen = new Set([s.ticker]);
  return all.filter((x) => x.kind === "contract" && x !== s && agencyLabel(x) === label)
    .sort((a, b) => (b.kind === "contract" ? b.value : 0) - (a.kind === "contract" ? a.value : 0))
    .filter((x) => { if (seen.has(x.ticker)) return false; seen.add(x.ticker); return true; })
    .slice(0, max);
}

export interface CompareRow { label: string; values: string[] }

/** Rows for a side-by-side table: the item first, then its peers. */
export function compareRows(items: Signal[]): CompareRow[] {
  const cs = items.filter((x): x is Extract<Signal, { kind: "contract" }> => x.kind === "contract");
  const pattern = (c: Extract<Signal, { kind: "contract" }>) => {
    const w = c.history?.windows["30"];
    if (!w || w.n < 5) return "not enough history";
    return `${w.beat_pct}% beat market (${w.n} deals)`;
  };
  const rows: CompareRow[] = [
    { label: "Deal", values: cs.map((c) => money(c.value)) },
    { label: "Signed", values: cs.map((c) => shortDate(c.trade_date)) },
    { label: "Stock since", values: cs.map((c) => moveLabel(c)?.replace("Stock ", "") ?? "–") },
    { label: "Group since", values: cs.map((c) => c.sector_pct != null && !tooSoon(c) ? `${c.sector_pct > 0 ? "up " : c.sector_pct < 0 ? "down " : ""}${Math.abs(c.sector_pct).toFixed(1)}%` : "–") },
    { label: "After past deals", values: cs.map(pattern) },
    { label: "Score", values: cs.map((c) => `${c.score}, ${tierLabel(c.score).toLowerCase()}`) },
  ];
  // Only worth a row when we actually know a company's size.
  if (cs.some((c) => c.award_pct != null)) {
    rows.splice(1, 0, { label: "Share of company", values: cs.map((c) => c.award_pct != null ? `${c.award_pct.toFixed(c.award_pct < 1 ? 2 : 1)}%` : "–") });
  }
  return rows;
}
