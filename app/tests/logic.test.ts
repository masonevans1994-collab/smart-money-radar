// Plain Node tests for the app's pure logic: npm run test:logic
import assert from "node:assert/strict";

import {
  allSignals, amountLabel, biggestThisWeek, dayLabel, filterSignals, freshness, keyNote, money,
  moveLabel, plainSummary, refine, signalKey, tierLabel, withDayHeaders, isHeader, shortName,
} from "../src/logic";
import type { Feed, Signal } from "../src/types";

import demoJson from "../src/demo.json";

const demo = demoJson as unknown as Feed;
const now = new Date("2026-11-01T12:00:00");

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

const contract = (over: Partial<Signal> = {}): Signal => ({
  kind: "contract", ticker: "FLR", who: "Fluor Marine Propulsion, LLC", company: "Fluor Corporation",
  headline: "Fluor won $373M more", score: 30, reasons: ["Won a $372.5M add-on"], trade_date: "2026-10-30",
  disclosed: "2026-10-30", url: "", value: 372.5e6, agency: "Department of Energy", sub_agency: "",
  description: "", source: "USAspending (modification)", is_modification: true, ...over,
} as Signal);

test("money formatting", () => {
  assert.equal(money(372.5e6), "$373M");
  assert.equal(money(53.4e6), "$53.4M");
  assert.equal(money(1.2e9), "$1.20B");
  assert.equal(money(15000), "$15K");
});

test("day labels", () => {
  assert.equal(dayLabel("2026-11-01", now), "Today");
  assert.equal(dayLabel("2026-10-31", now), "Yesterday");
  assert.match(dayLabel("2026-10-30", now), /Friday, Oct 30/);
});

test("newest-first grouping adds one heading per day", () => {
  const rows = refine([contract({ trade_date: "2026-10-29", value: 5e7 } as Partial<Signal>),
    contract(), contract({ ticker: "HON", value: 3.2e8 } as Partial<Signal>)], null, "newest");
  const items = withDayHeaders(rows, now);
  const heads = items.filter(isHeader);
  assert.equal(heads.length, 2);
  assert.match(heads[0].header, /Friday/);
  assert.equal(heads[0].detail, "2 awards, $693M");
});

test("plain-English summary for a contract add-on", () => {
  const lines = plainSummary(contract({ change_pct: 1 } as Partial<Signal>));
  assert.equal(lines[0], "The Department of Energy agreed to pay Fluor $373M more on a contract the company already had.");
  assert.match(lines[lines.length - 1], /The stock is up 1.0% since Oct 30/);
});

test("plain-English never tells anyone to buy or sell", () => {
  for (const s of allSignals(demo)) {
    for (const line of plainSummary(s)) {
      assert.doesNotMatch(line, /\b(you should|buy now|sell now|guaranteed|can't lose)\b/i, line);
    }
  }
});

test("labels and move text", () => {
  assert.equal(tierLabel(85), "Stands out");
  assert.equal(tierLabel(50), "Worth a look");
  assert.equal(tierLabel(10), "Routine");
  assert.equal(moveLabel(contract({ change_pct: -2.44 } as Partial<Signal>)), "Stock down 2.4%");
  assert.equal(moveLabel(contract({ change_pct: 0 } as Partial<Signal>)), "Stock unchanged");
  assert.equal(keyNote(contract()), "More money on a contract the company already had");
});

test("tab filters and search", () => {
  const all = allSignals(demo);
  const contracts = filterSignals(all, "contract", "", new Set());
  assert.ok(contracts.length > 0 && contracts.every((s) => s.kind === "contract"));
  assert.equal(filterSignals(all, "watch", "", new Set()).length, 0);
  assert.ok(filterSignals(all, "contract", "demo robotics", new Set()).length >= 1);
  assert.equal(filterSignals(all, "record", "", new Set()).length, 0);
  const people = filterSignals(all, "people", "", new Set());
  assert.ok(people.length > 0 && people.every((s) => s.kind !== "contract"));
});

test("stable keys and amount labels", () => {
  const s = contract();
  assert.equal(signalKey(s), signalKey({ ...s }));
  assert.equal(amountLabel(s), "$373M");
});

test("freshness and biggest award on a weekend", () => {
  const feed: Feed = { ...demo, contracts: [contract() as never, contract({ ticker: "HON", value: 9e8 } as Partial<Signal>) as never] };
  const f = freshness(feed, now);
  assert.equal(f.latest, "2026-10-30");
  assert.match(f.note ?? "", /weekends/);
  assert.equal(biggestThisWeek(feed, now)?.ticker, "HON");
});



// ---- game ----
import { callStats, checkIn, EMPTY, makeCall, milestones, resolveCalls } from "../src/game";

test("streak counts consecutive days only", () => {
  let p = checkIn(EMPTY, new Date("2026-11-01T09:00:00"));
  assert.equal(p.streak, 1);
  p = checkIn(p, new Date("2026-11-01T18:00:00"));            // same day: no change
  assert.equal(p.streak, 1);
  p = checkIn(p, new Date("2026-11-02T09:00:00"));
  assert.equal(p.streak, 2);
  p = checkIn(p, new Date("2026-11-05T09:00:00"));            // gap resets
  assert.equal(p.streak, 1);
  assert.equal(p.bestStreak, 2);
});

test("calls settle after 30 days against the latest price", () => {
  const award = contract({ price_now: 100 } as Partial<Signal>);
  let p = makeCall(EMPTY, award, "up", new Date("2026-10-01T12:00:00"));
  assert.equal(p.calls.length, 1);
  p = makeCall(p, award, "down", new Date("2026-10-02T12:00:00")); // one call per award
  assert.equal(p.calls.length, 1);
  p = resolveCalls(p, [{ ...award, price_now: 101 } as Signal], new Date("2026-10-15T12:00:00"));
  assert.equal(p.calls[0].result, undefined);                     // too early
  p = resolveCalls(p, [{ ...award, price_now: 108 } as Signal], new Date("2026-11-01T12:00:00"));
  assert.equal(p.calls[0].result, "right");
  assert.deepEqual(callStats(p), { open: 0, settled: 1, right: 1, pct: 100 });
  assert.ok(milestones(p).find((m) => m.id === "call")?.done);
});

test("a small move counts as about the same", () => {
  const award = contract({ price_now: 100 } as Partial<Signal>);
  let p = makeCall(EMPTY, award, "flat", new Date("2026-10-01T12:00:00"));
  p = resolveCalls(p, [{ ...award, price_now: 101.5 } as Signal], new Date("2026-11-01T12:00:00"));
  assert.equal(p.calls[0].result, "right");
});


import { agencyLabel, peersFor, weeklyRecap } from "../src/logic";
import { agencyDescription } from "../src/agencies";

test("weekly recap and agency descriptions", () => {
  const feed: Feed = { ...demo, contracts: [
    contract({ change_pct: 1 } as Partial<Signal>) as never,
    contract({ ticker: "HON", company: "Honeywell", value: 9e8, change_pct: 4, sub_agency: "Department of the Navy" } as Partial<Signal>) as never,
  ] };
  const r = weeklyRecap(feed, now)!;
  assert.equal(r.count, 2);
  assert.equal(r.biggest?.ticker, "HON");
  assert.equal(r.bestMover?.ticker, "HON");
  assert.equal(r.topAgency, "Navy");
  assert.match(agencyDescription("Department of Defense", "Defense Logistics Agency")!, /fuel, food/);
  assert.equal(agencyLabel(contract({ agency: "United States Department of Agriculture", sub_agency: "" } as Partial<Signal>)), "Agriculture");
  const moved = refine([contract({ change_pct: -1 } as Partial<Signal>), contract({ ticker: "B", change_pct: 7 } as Partial<Signal>)], null, "move");
  assert.equal(moved[0].ticker, "B");
  assert.equal(agencyDescription("Something Obscure"), null);
});


import { catchUp, compareRows, lastTimeDetail, lastTimeHeadline, lastTimeLines, recordSentence, shareText, statusNote, whyLine } from "../src/logic";

test("what-happened-last-time sentences use real past moves", () => {
  const s = contract({ history: { n: 25, verdict: "v", windows: {},
    closest: { date: "2025-08-22", value: 168e6, agency: "Department of Defense", d1: -0.8, d30: -4.1, d30_vs_spy: -9.15 } } } as Partial<Signal>);
  const lines = lastTimeLines(s)!;
  assert.equal(lines[0], "Closest match: $168M from Defense on Aug 22, 2025.");
  assert.equal(lines[1], "Over the next 30 days the stock fell 4.1%, 9.2 points worse than the market.");
  assert.equal(lines[2], "On the day itself it moved -0.8%.");
  assert.equal(lastTimeHeadline({ ...s, company: "Honeywell International Inc." } as Signal),
    "Last time Honeywell won a deal like this, its stock went down 4%.");
  assert.equal(keyNote(s), "Last time Fluor won a deal like this, its stock went down 4%.");
  const hist = (s as Extract<Signal, { kind: "contract" }>).history!;
  const d = lastTimeDetail({ ...s, history: { ...hist, windows: { "30": { n: 25, beat_pct: 36, avg_vs_spy: -1.4, median_vs_spy: -1, avg_raw: 1.8 } } } } as Signal)!;
  assert.equal(d, "That was $168M in Aug 2025, measured over the next 30 days. Out of its last 25 deals, the stock beat the market afterward 9 times.");
  assert.equal(lastTimeLines(contract()), null);
});

test("why lines come from measurable facts", () => {
  const hist = { n: 25, verdict: "v", windows: { "30": { n: 25, beat_pct: 36, avg_vs_spy: -1.4, median_vs_spy: -1, avg_raw: 1.8 } }, closest: null };
  const hon = contract({ company: "Honeywell International Inc.", value: 323e6, award_pct: 0.23, history: hist } as Partial<Signal>);
  assert.equal(whyLine(hon), "Why? $323M is only 0.2% of what Honeywell is worth. It would take about 435 deals this size to change the company. One barely registers.");
  const small = contract({ company: "Kratos Defense", value: 75e6, award_pct: 1.5, is_modification: false,
    history: { ...hist, windows: { "30": { n: 10, beat_pct: 70, avg_vs_spy: 8, median_vs_spy: 5, avg_raw: 9 } } } } as Partial<Signal>);
  assert.match(whyLine(small)!, /Government work is a big part of what Kratos Defense does/);
  const addon = contract({ company: "Fluor Corporation", is_modification: true, history: hist } as Partial<Signal>);
  assert.match(whyLine(addon)!, /adds money to a contract Fluor already had/);
  assert.equal(whyLine(contract({ history: undefined, is_modification: false } as Partial<Signal>)), null);
});

test("welcome-back summary and status notes", () => {
  const a = contract({ ticker: "A", company: "Alpha Co", value: 5e8 } as Partial<Signal>);
  const b = contract({ ticker: "B", company: "Beta Co", value: 1e8 } as Partial<Signal>);
  const seen = new Set([signalKey(b)]);
  assert.equal(catchUp([a, b], seen, "2026-10-25", now),
    "Welcome back. 1 new contract worth $500M since Sunday, Oct 25. Biggest: $500M to Alpha Co.");
  assert.equal(catchUp([a, b], seen, "2026-10-31", now), null);           // only a day away
  assert.equal(catchUp([b], seen, "2026-10-25", now), "Welcome back. Nothing new in contracts since Sunday, Oct 25.");
  assert.equal(statusNote({ ...demo, status: { contracts: "stale" } }), "The contracts site isn't answering right now, so these are from the last good update.");
  assert.equal(statusNote({ ...demo, status: { contracts: "ok", prices: "ok" } }), null);
});

import { matchesQuery, suggestedTopics, topicsFor } from "../src/topics";

test("plain-word search and topics", () => {
  const ship = contract({ description: "Advance planning for aircraft carrier refueling at the shipyard", company: "Huntington Ingalls", ticker: "HII" } as Partial<Signal>);
  const meds = contract({ description: "Surgical supplies and pharmaceuticals for VA hospitals", company: "Medline", ticker: "MDLN", agency: "Department of Veterans Affairs" } as Partial<Signal>);
  assert.deepEqual(topicsFor(ship).slice(0, 2), ["ships", "aircraft"]);
  assert.ok(topicsFor(meds).includes("medical supplies"));
  assert.ok(matchesQuery(ship, "ships"));
  assert.ok(matchesQuery(ship, "carrier huntington"));
  assert.ok(matchesQuery(meds, "hospital"));
  assert.ok(!matchesQuery(meds, "ships"));
  assert.ok(matchesQuery(meds, "mdln"));
  assert.deepEqual(suggestedTopics([ship, ship, meds])[0], "ships");
});

test("share text carries the plain-English story", () => {
  const hist = { n: 25, verdict: "v", windows: { "30": { n: 25, beat_pct: 36, avg_vs_spy: -1.4, median_vs_spy: -1, avg_raw: 1.8 } },
    closest: { date: "2024-11-14", value: 206e6, agency: "Department of Defense", d1: -0.3, d30: -1.53, d30_vs_spy: -1.2 } };
  const hon = contract({ company: "Honeywell International Inc.", value: 323e6, change_pct: 0, history: hist, url: "https://x" } as Partial<Signal>);
  const t = shareText(hon);
  assert.match(t, /^The Department of Energy agreed to pay Honeywell \$323M more/);
  assert.match(t, /Last time Honeywell won a deal like this, its stock went down 2%\./);
  assert.match(t, /This adds money to a contract Honeywell already had/);
  assert.match(t, /Stock unchanged since Oct 30\./);
  assert.match(t, /Not investment advice\.$/);
  assert.doesNotMatch(t, /Why\?/);
});

test("record sentences", () => {
  assert.equal(recordSentence({ id: "x", label: "L", n: 0 }), "Not enough history yet.");
  assert.equal(recordSentence({ id: "x", label: "L", n: 11, avg_vs_spy: 6.7, beat_spy_pct: 73 }),
    "After 11 of these, the stock did better than the market by 6.7 points on average. It beat the market 73% of the time.");
  assert.equal(recordSentence({ id: "x", label: "L", n: 40, avg_vs_spy: 0.2, beat_spy_pct: 50 }),
    "After 40 of these, the stock moved about like the market. It beat the market 50% of the time.");
});

test("compare peers and rows", () => {
  const a = contract({ ticker: "A", company: "Alpha", value: 5e8, sub_agency: "Department of the Navy", award_pct: 0.2, change_pct: 1.2, sector_pct: 0.5 } as Partial<Signal>);
  const b = contract({ ticker: "B", company: "Beta", value: 1e8, sub_agency: "Department of the Navy", award_pct: 4, change_pct: -3 } as Partial<Signal>);
  const c = contract({ ticker: "C", company: "Gamma", value: 9e8, sub_agency: "Department of Energy" } as Partial<Signal>);
  const b2 = contract({ ticker: "B", company: "Beta", value: 2e7, sub_agency: "Department of the Navy" } as Partial<Signal>);
  assert.deepEqual(peersFor([a, b, c, b2], a).map((p) => p.ticker), ["B"]);
  const rows = compareRows([a, b]);
  assert.deepEqual(rows[0], { label: "Deal", values: ["$500M", "$100M"] });
  assert.deepEqual(rows[1].values, ["0.20%", "4.0%"]);
  assert.deepEqual(rows[3].values, ["up 1.2%", "down 3.0%"]);
  assert.deepEqual(rows[4].values, ["up 0.5%", "–"]);
});
test("shortName says the name people use", () => {
  assert.equal(shortName({ company: "Honeywell International Inc.", ticker: "HON" }), "Honeywell");
  assert.equal(shortName({ company: "Accenture plc", ticker: "ACN" }), "Accenture");
  assert.equal(shortName({ company: "General Dynamics Corporation", ticker: "GD" }), "General Dynamics");
  assert.equal(shortName({ ticker: "KTOS" }), "KTOS");
});

test("a Friday award viewed on the weekend says too soon, not unchanged", () => {
  const fri = contract({ trade_date: "2026-10-30", price_date: "2026-10-30", price_then: 218.33, price_now: 218.33, change_pct: 0 });
  assert.equal(moveLabel(fri), "Too soon to tell");
  assert.match(plainSummary(fri).join(" "), /hasn't had a trading day/);
  const mon = contract({ trade_date: "2026-10-30", price_date: "2026-11-02", price_then: 218.33, price_now: 218.33, change_pct: 0 });
  assert.equal(moveLabel(mon), "Stock unchanged");
});

console.log(`\n${passed} logic tests passed`);

