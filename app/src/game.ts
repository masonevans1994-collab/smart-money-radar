// Calls, streaks and milestones. Everything lives on the device; no accounts.
// Design rule: reward learning and attention, never trading with real money.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { plainHeadline, signalKey } from "./logic";
import type { Signal } from "./types";

export type Direction = "up" | "down" | "flat";

export interface Call {
  key: string;            // signalKey of the award
  ticker: string;
  headline: string;
  direction: Direction;
  madeOn: string;         // ISO date
  priceThen: number;      // latest price when the call was made
  resolveOn: string;      // madeOn + 30 days
  result?: "right" | "wrong";
  priceEnd?: number;
}

export interface Progress {
  calls: Call[];
  unseenSettled?: number;   // calls settled since the user last looked at the You tab
  streak: number;         // consecutive days opened
  lastOpen: string;       // ISO date
  bestStreak: number;
  opened: number;         // detail pages opened
  recordsOpened: number;  // official records opened
  guideRead: boolean;
  saved: number;          // stocks ever saved
}

const KEY = "progress:v1";
const FLAT_BAND = 2; // within ±2% counts as "no change"

export const EMPTY: Progress = {
  calls: [], streak: 0, lastOpen: "", bestStreak: 0, opened: 0, recordsOpened: 0,
  guideRead: false, saved: 0,
};

export function today(now = new Date()): string {
  const z = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return today(d);
}

export async function loadProgress(): Promise<Progress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Progress) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveProgress(p: Progress): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
}

/** Count today's visit; returns the updated progress. */
export function checkIn(p: Progress, now = new Date()): Progress {
  const t = today(now);
  if (p.lastOpen === t) return p;
  const streak = p.lastOpen === addDays(t, -1) ? p.streak + 1 : 1;
  return { ...p, lastOpen: t, streak, bestStreak: Math.max(p.bestStreak, streak) };
}

export function callFor(p: Progress, s: Signal): Call | undefined {
  return p.calls.find((c) => c.key === signalKey(s));
}

export function makeCall(p: Progress, s: Signal, direction: Direction, now = new Date()): Progress {
  if (s.price_now === undefined || callFor(p, s)) return p;
  const madeOn = today(now);
  const call: Call = {
    key: signalKey(s), ticker: s.ticker, headline: plainHeadline(s), direction, madeOn,
    priceThen: s.price_now, resolveOn: addDays(madeOn, 30),
  };
  return { ...p, calls: [call, ...p.calls].slice(0, 500) };
}

/** Settle calls whose 30 days are up, using the latest prices in the feed. */
export function resolveCalls(p: Progress, signals: Signal[], now = new Date()): Progress {
  const t = today(now);
  const latest = new Map<string, number>();
  for (const s of signals) if (s.price_now !== undefined) latest.set(s.ticker, s.price_now);
  let changed = false;
  let settledNow = 0;
  const calls = p.calls.map((c) => {
    if (c.result || c.resolveOn > t) return c;
    const end = latest.get(c.ticker);
    if (end === undefined) return c;
    const pct = ((end - c.priceThen) / c.priceThen) * 100;
    const actual: Direction = pct > FLAT_BAND ? "up" : pct < -FLAT_BAND ? "down" : "flat";
    changed = true;
    settledNow++;
    return { ...c, priceEnd: end, result: actual === c.direction ? "right" : "wrong" } as Call;
  });
  return changed ? { ...p, calls, unseenSettled: (p.unseenSettled ?? 0) + settledNow } : p;
}

export function callStats(p: Progress) {
  const settled = p.calls.filter((c) => c.result);
  const right = settled.filter((c) => c.result === "right").length;
  return { open: p.calls.length - settled.length, settled: settled.length, right,
    pct: settled.length ? Math.round((100 * right) / settled.length) : null };
}

export interface Milestone { id: string; title: string; detail: string; done: boolean }

export function milestones(p: Progress): Milestone[] {
  const st = callStats(p);
  return [
    { id: "first-open", title: "First look", detail: "Open any award", done: p.opened >= 1 },
    { id: "guide", title: "Knows the ropes", detail: "Read How it works", done: p.guideRead },
    { id: "record", title: "Fact checker", detail: "Open an official record", done: p.recordsOpened >= 1 },
    { id: "save", title: "Following along", detail: "Save a stock", done: p.saved >= 1 },
    { id: "call", title: "First call", detail: "Make a call on an award", done: p.calls.length >= 1 },
    { id: "ten", title: "Well read", detail: "Open 10 awards", done: p.opened >= 10 },
    { id: "streak3", title: "3-day streak", detail: "Check in 3 days in a row", done: p.bestStreak >= 3 },
    { id: "streak7", title: "7-day streak", detail: "Check in 7 days in a row", done: p.bestStreak >= 7 },
    { id: "settled", title: "Scored", detail: "Have 5 calls settle", done: st.settled >= 5 },
  ];
}
