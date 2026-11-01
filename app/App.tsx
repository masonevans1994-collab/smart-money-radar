import {
  PublicSans_400Regular, PublicSans_500Medium, PublicSans_600SemiBold, PublicSans_700Bold,
  PublicSans_900Black, useFonts,
} from "@expo-google-fonts/public-sans";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  finishOnboarding, type FeedSource, loadFeed, loadSeen, loadWatchlist, needsOnboarding, saveSeen,
  saveWatchlist,
} from "./src/data";
import {
  allSignals, filterSignals, heroFor, refine, signalKey, type SortKey, type Tab, TABS, timeAgo,
  topAgencies,
} from "./src/logic";
import { Onboarding } from "./src/Onboarding";
import { SignalCard } from "./src/SignalCard";
import { SignalDetail } from "./src/SignalDetail";
import { colors, fonts, type } from "./src/theme";
import { TrackRecord } from "./src/TrackRecord";
import type { Feed, Signal } from "./src/types";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Most notable" },
  { key: "size", label: "Largest" },
  { key: "newest", label: "Newest" },
];

function Radar() {
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [source, setSource] = useState<FeedSource>("demo");
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("contract");
  const [query, setQuery] = useState("");
  const [watch, setWatch] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Signal | null>(null);
  const [agency, setAgency] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("score");
  const [seenBefore, setSeenBefore] = useState<Set<string> | null>(null);
  const [onboard, setOnboard] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const r = await loadFeed();
    const prev = await loadSeen();
    const keys = allSignals(r.feed).map(signalKey);
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
    needsOnboarding().then(setOnboard);
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
  const agencies = useMemo(() => topAgencies(signals), [signals]);
  const rows = useMemo(() => {
    const base = filterSignals(signals, tab, query, watch);
    return refine(base, tab === "contract" ? agency : null, sort);
  }, [signals, tab, query, watch, agency, sort]);

  if (!feed) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const hero = heroFor(tab, feed, watch.size);
  const newCount = seenBefore
    ? signals.filter((s) => s.kind === "contract" && !seenBefore.has(signalKey(s))).length : 0;
  const status = source === "live" ? `Updated ${timeAgo(feed.generated)}`
    : source === "cached" ? `Offline, showing data from ${timeAgo(feed.generated)}`
      : "Sample data";

  const header = (
    <View>
      <View style={styles.topBar}>
        <Text style={styles.brand}>Radar</Text>
        <Text style={styles.status}>{status}</Text>
      </View>

      {source === "demo" && (
        <Text style={styles.notice}>
          These companies and awards are made up. Live data appears once the feed is reachable.
        </Text>
      )}
      {source === "cached" && !!error && (
        <Text style={styles.notice}>Couldn't refresh ({error}). Pull down to try again.</Text>
      )}

      <View style={styles.hero}>
        <Text style={[styles.heroFigure, { color: hero.gold ? colors.gold : colors.text }]}>
          {hero.figure}
        </Text>
        <Text style={styles.heroCaption}>{hero.caption}</Text>
        {tab === "contract" && newCount > 0 && (
          <Text style={styles.heroNew}>{newCount} new since your last visit</Text>
        )}
      </View>

      {tab !== "record" && (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === "contract" ? "Search company or ticker" : "Search name or ticker"}
            placeholderTextColor={colors.muted}
            style={styles.search}
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
            {SORTS.map((s) => (
              <Chip key={s.key} label={s.label} on={sort === s.key} onPress={() => setSort(s.key)} />
            ))}
          </ScrollView>
          {tab === "contract" && agencies.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
              {[null, ...agencies].map((a) => (
                <Chip key={a ?? "all"} label={a ?? "All agencies"} on={agency === a}
                  onPress={() => setAgency(a)} />
              ))}
            </ScrollView>
          )}
          <View style={{ height: 14 }} />
        </>
      )}
    </View>
  );

  const empty = tab === "record" ? <TrackRecord record={feed.track_record} /> : (
    <Text style={styles.empty}>
      {tab === "watch" && !query
        ? "Nothing saved yet. Open any award or trade and tap Save to follow that stock here."
        : query ? `Nothing matches "${query}".` : "Nothing here yet. Pull down to refresh."}
    </Text>
  );

  return (
    <View style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={["top"]}>
        <FlatList
          data={rows}
          keyExtractor={(s: Signal, i: number) => `${signalKey(s)}-${i}`}
          renderItem={({ item }: { item: Signal }) => (
            <SignalCard signal={item} starred={watch.has(item.ticker)}
              isNew={!!seenBefore && !seenBefore.has(signalKey(item))}
              onPress={() => setOpen(item)} />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
        />
      </SafeAreaView>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}
        accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => { setTab(t.key); setQuery(""); }}
              style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <View style={[styles.tabMark, on && styles.tabMarkOn]} />
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <SignalDetail
        signal={open}
        all={signals}
        onOpen={setOpen}
        starred={!!open && watch.has(open.ticker)}
        onToggleStar={toggleStar}
        onClose={() => setOpen(null)}
      />
      <Onboarding visible={onboard} onDone={() => { setOnboard(false); finishOnboarding(); }} />
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [loaded] = useFonts({
    PublicSans_400Regular, PublicSans_500Medium, PublicSans_600SemiBold, PublicSans_700Bold,
    PublicSans_900Black,
  });
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.fill}>
        {loaded ? <Radar /> : <View style={[styles.fill, styles.center]}>
          <ActivityIndicator color={colors.gold} />
        </View>}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  topBar: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 10,
  },
  brand: { fontFamily: fonts.black, fontSize: 20, color: colors.gold },
  status: { ...type.small, color: colors.muted },
  notice: {
    ...type.small, color: colors.soft, marginHorizontal: 20, marginTop: 12,
    borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: 10,
  },
  hero: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 },
  heroFigure: { ...type.hero, fontSize: 48, lineHeight: 52, fontVariant: ["tabular-nums"] },
  heroCaption: { ...type.lead, color: colors.soft, marginTop: 4, maxWidth: 320 },
  heroNew: { ...type.bodyStrong, color: colors.gold, marginTop: 8 },
  search: {
    ...type.lead, color: colors.text, backgroundColor: colors.panel, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, marginHorizontal: 16,
  },
  chips: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.panel },
  chipOn: { backgroundColor: colors.text },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.soft },
  chipTextOn: { color: colors.bg },
  empty: { ...type.lead, color: colors.muted, textAlign: "center", marginTop: 48, marginHorizontal: 32 },
  tabBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row",
    backgroundColor: colors.panel, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tabItem: { flex: 1, alignItems: "center", gap: 5, paddingVertical: 4 },
  tabMark: { width: 18, height: 3, borderRadius: 2, backgroundColor: "transparent" },
  tabMarkOn: { backgroundColor: colors.gold },
  tabText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  tabTextOn: { color: colors.text },
});
