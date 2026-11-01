import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import {
  type FeedSource, loadFeed, loadSeen, loadWatchlist, saveSeen, saveWatchlist,
} from "./src/data";
import { allSignals, filterSignals, signalKey, type Tab, TABS, timeAgo } from "./src/logic";
import { SignalCard } from "./src/SignalCard";
import { SignalDetail } from "./src/SignalDetail";
import { TrackRecord } from "./src/TrackRecord";
import { colors } from "./src/theme";
import type { Feed, Signal } from "./src/types";

function Radar() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [source, setSource] = useState<FeedSource>("demo");
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("contract");
  const [query, setQuery] = useState("");
  const [watch, setWatch] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Signal | null>(null);
  // Keys seen before this launch; anything else gets a NEW badge.
  const [seenBefore, setSeenBefore] = useState<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const r = await loadFeed();
    const prev = await loadSeen();
    const keys = allSignals(r.feed).map(signalKey);
    // First launch: nothing is "new". Later: badge what wasn't there before.
    setSeenBefore((cur) => cur ?? prev ?? new Set(keys));
    saveSeen([...new Set([...keys, ...(prev ?? [])])]);
    setFeed(r.feed);
    setSource(r.source);
    setError(r.error);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh();
    loadWatchlist().then(setWatch);
  }, [refresh]);

  const toggleStar = useCallback((ticker: string) => {
    setWatch((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      saveWatchlist(next);
      return next;
    });
  }, []);

  const signals = useMemo(() => (feed ? allSignals(feed) : []), [feed]);
  const rows = useMemo(
    () => filterSignals(signals, tab, query, watch), [signals, tab, query, watch]);
  const hot = signals.filter((s) => s.score >= 70).length;
  const newCount = seenBefore ? signals.filter((s) => !seenBefore.has(signalKey(s))).length : 0;

  if (!feed) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const header = (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>
          Smart Money <Text style={{ color: colors.accent }}>Radar</Text>
        </Text>
        <Text style={styles.sub}>
          {source === "live" ? "Updated " : source === "cached" ? "Offline · saved " : "Demo data · "}
          {timeAgo(feed.generated)}
          {newCount > 0 ? ` · ${newCount} new since last visit` : ""}
        </Text>
      </View>

      {source !== "live" && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {source === "demo"
              ? "Showing made-up demo data until the live feed is available."
              : `Couldn't refresh (${error}). Showing your last saved data.`}
          </Text>
        </View>
      )}

      <View style={styles.stats}>
        <Stat n={feed.contracts?.length ?? 0} label="Contract wins" />
        <Stat n={feed.congress.length} label="Congress trades" />
        <Stat n={feed.insiders.length} label="Insider buys" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs} style={{ flexGrow: 0 }}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {hot > 0 && (tab === "top" || tab === "contract") && !query && (
        <Text style={styles.hint}>{hot} signals scored 70 or higher</Text>
      )}
      {tab !== "record" && <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search ticker, person or company"
        placeholderTextColor={colors.muted}
        style={styles.search}
        autoCapitalize="characters"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />}
    </View>
  );

  return (
    <SafeAreaView style={styles.fill} edges={["top"]}>
      <FlatList
        data={rows}
        keyExtractor={(s: Signal, i: number) => `${s.kind}-${s.ticker}-${s.who}-${s.trade_date}-${i}`}
        renderItem={({ item }: { item: Signal }) => (
          <SignalCard signal={item} starred={watch.has(item.ticker)}
            isNew={!!seenBefore && !seenBefore.has(signalKey(item))}
            onPress={() => setOpen(item)} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={tab === "record" ? <TrackRecord record={feed.track_record} /> : (
          <Text style={styles.empty}>
            {tab === "watch" && !query
              ? "Your watchlist is empty.\nOpen any signal and tap ☆ Watch."
              : "No signals match."}
          </Text>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      />
      <SignalDetail
        signal={open}
        all={signals}
        onOpen={setOpen}
        starred={!!open && watch.has(open.ticker)}
        onToggleStar={toggleStar}
        onClose={() => setOpen(null)}
      />
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.fill}>
        <Radar />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 16, paddingTop: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  banner: {
    backgroundColor: "#3a2d0a", borderColor: "#5c4610", borderWidth: 1, borderRadius: 10,
    padding: 10, marginHorizontal: 16, marginTop: 12,
  },
  bannerText: { color: colors.warn, fontSize: 13, lineHeight: 18 },
  stats: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 14 },
  stat: {
    flex: 1, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1,
    borderRadius: 12, padding: 10,
  },
  statN: { color: colors.text, fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statL: { color: colors.muted, fontSize: 12 },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 16, marginTop: 14 },
  hint: { color: colors.muted, fontSize: 12, marginHorizontal: 16, marginTop: 8 },
  tab: {
    backgroundColor: colors.chip, borderColor: colors.line, borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7,
  },
  tabOn: { backgroundColor: colors.text, borderColor: colors.text },
  tabText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  tabTextOn: { color: colors.bg },
  search: {
    backgroundColor: colors.panel, color: colors.text, borderColor: colors.line, borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    marginHorizontal: 16, marginTop: 10, marginBottom: 12,
  },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40, lineHeight: 22 },
});
