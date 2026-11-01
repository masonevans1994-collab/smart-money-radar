import AsyncStorage from "@react-native-async-storage/async-storage";

import { FEED_URL } from "./config";
import demoFeed from "./demo.json";
import { isFeed } from "./logic";
import type { Feed } from "./types";

const FEED_KEY = "feed:v1";
const WATCH_KEY = "watchlist:v1";

export type FeedSource = "live" | "cached" | "demo";

/** Load the latest feed: network first, then last saved copy, then demo. */
export async function loadFeed(): Promise<{ feed: Feed; source: FeedSource; error?: string }> {
  if (FEED_URL) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${FEED_URL}?t=${Date.now()}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json: unknown = await res.json();
      if (!isFeed(json)) throw new Error("Unexpected data format");
      await AsyncStorage.setItem(FEED_KEY, JSON.stringify(json)).catch(() => {});
      return { feed: json, source: "live" };
    } catch (e) {
      const cached = await AsyncStorage.getItem(FEED_KEY).catch(() => null);
      const msg = e instanceof Error ? e.message : "Network error";
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (isFeed(parsed)) return { feed: parsed, source: "cached", error: msg };
      }
      return { feed: demoFeed as unknown as Feed, source: "demo", error: msg };
    }
  }
  return { feed: demoFeed as unknown as Feed, source: "demo" };
}

export async function loadWatchlist(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(WATCH_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function saveWatchlist(list: Set<string>): Promise<void> {
  await AsyncStorage.setItem(WATCH_KEY, JSON.stringify([...list])).catch(() => {});
}

const SEEN_KEY = "seen:v1";

/** Keys the user has already been shown. null means first launch. */
export async function loadSeen(): Promise<Set<string> | null> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

export async function saveSeen(keys: string[]): Promise<void> {
  // Keep the list bounded so storage never grows without limit.
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(0, 3000))).catch(() => {});
}

const ONBOARD_KEY = "onboarded:v1";

export async function needsOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARD_KEY)) !== "1";
  } catch {
    return false;
  }
}

export async function finishOnboarding(): Promise<void> {
  await AsyncStorage.setItem(ONBOARD_KEY, "1").catch(() => {});
}
