// Plain Node tests for the app's pure logic: npm run test:logic
import assert from "node:assert/strict";

import {
  allSignals, amountLabel, biggestThisWeek, dayLabel, filterSignals, freshness, keyNote, money,
  moveLabel, plainSummary, refine, signalKey, tierLabel, withDayHeaders, isHeader,
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
  assert.equal(lines[0], "The Department of Energy agreed to pay Fluor Corporation $373M more on a contract the company already had.");
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


import { agencyLabel, weeklyRecap } from "../src/logic";
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


import { lastTimeDetail, lastTimeHeadline, lastTimeLines } from "../src/logic";

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
  const d = lastTimeDetail({ ...s, history: { ...s.history!, windows: { "30": { n: 25, beat_pct: 36, avg_vs_spy: -1.4, median_vs_spy: -1, avg_raw: 1.8 } } } } as Signal)!;
  assert.equal(d, "That was $168M in Aug 2025, measured over the next 30 days. Out of its last 25 deals, the stock beat the market afterward 9 times.");
  assert.equal(lastTimeLines(contract()), null);
});
console.log(`\n${passed} logic tests passed`);
