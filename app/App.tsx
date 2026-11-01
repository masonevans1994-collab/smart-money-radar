import {
  PublicSans_400Regular, PublicSans_500Medium, PublicSans_600SemiBold, PublicSans_700Bold,
  PublicSans_900Black, useFonts,
} from "@expo-google-fonts/public-sans";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  useColorScheme, View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type Appearance, finishOnboarding, finishTour, type FeedSource, loadAppearance, loadFeed, loadSeen,
  loadWatchlist, needsOnboarding, needsTour, saveAppearance, saveSeen, saveWatchlist,
} from "./src/data";
import {
  agencySummary, allSignals, amountLabel, biggestThisWeek, catchUp, contractsByTicker, dayLabel, filterSignals, freshness, heroFor, isHeader, type ListItem, refine, signalKey,
  savedStocks, type SortKey, statusNote, type Tab, TABS, timeAgo, topAgencies, weeklyRecap, withDayHeaders,
} from "./src/logic";
import {
  callFor, checkIn, type Direction, loadProgress, makeCall, type Progress, EMPTY, resolveCalls,
  saveProgress,
} from "./src/game";
import { AgencyPage } from "./src/AgencyPage";
import { Glossary } from "./src/Glossary";
import { Guide } from "./src/Guide";
import { Legal, SHORT_DISCLAIMER } from "./src/Legal";
import { Onboarding } from "./src/Onboarding";
import { RecapCard } from "./src/Recap";
import { Saved } from "./src/Saved";
import { SignalCard } from "./src/SignalCard";
import { SignalDetail } from "./src/SignalDetail";
import { DARK, fonts, LIGHT, type, type Palette, ThemeContext, useColors } from "./src/theme";
import { suggestedTopics } from "./src/topics";
import { Tour } from "./src/Tour";
import { TrackRecord } from "./src/TrackRecord";
import { You } from "./src/You";
import type { Feed, Signal } from "./src/types";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "score", label: "Most notable" },
  { key: "size", label: "Largest" },
  { key: "move", label: "Biggest stock move" },
];

function Radar({ appearance, onAppearance }: {
  appearance: Appearance; onAppearance: (a: Appearance) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
  const [sort, setSort] = useState<SortKey>("newest");
  const [seenBefore, setSeenBefore] = useState<Set<string> | null>(null);
  const [lastOpen, setLastOpen] = useState<string | null>(null);
  const [catchUpHidden, setCatchUpHidden] = useState(false);
  const [onboard, setOnboard] = useState(false);
  const [guide, setGuide] = useState(false);
  const [legal, setLegal] = useState(false);
  const [recapHidden, setRecapHidden] = useState(false);
  const [glossary, setGlossary] = useState<string | null | false>(false);
  const [tour, setTour] = useState(false);
  const [agencyPage, setAgencyPage] = useState<string | null>(null);
  const [progress, setProgressState] = useState<Progress>(EMPTY);
  const setProgress = useCallback((fn: (p: Progress) => Progress) => {
    setProgressState((p) => { const n = fn(p); if (n !== p) saveProgress(n); return n; });
  }, []);

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
    needsTour().then(setTour);
    loadProgress().then((p) => { setLastOpen(p.lastOpen || null); setProgress(() => checkIn(p)); });
  }, [refresh, setProgress]);

  useEffect(() => {
    if (feed) setProgress((p) => resolveCalls(p, allSignals(feed)));
  }, [feed, setProgress]);

  const toggleStar = useCallback((ticker: string) => {
    setWatch((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else { next.add(ticker); setProgress((p) => ({ ...p, saved: p.saved + 1 })); }
      saveWatchlist(next);
      return next;
    });
  }, [setProgress]);

  const openSignal = useCallback((s: Signal) => {
    setOpen(s);
    setProgress((p) => ({ ...p, opened: p.opened + 1 }));
  }, [setProgress]);

  const signals = useMemo(() => (feed ? allSignals(feed) : []), [feed]);
  const agencies = useMemo(() => topAgencies(signals), [signals]);
  const topics = useMemo(() => suggestedTopics(signals), [signals]);
  const linkedContracts = useMemo(() => (feed ? contractsByTicker(feed) : new Map()), [feed]);
  const items = useMemo<ListItem[]>(() => {
    if (tab === "watch") return [];
    const base = filterSignals(signals, tab, query, watch);
    const rows = refine(base, tab === "contract" ? agency : null, sort);
    return sort === "newest" ? withDayHeaders(rows) : rows;
  }, [signals, tab, query, watch, agency, sort]);

  if (!feed) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const hero = heroFor(tab, feed, watch.size);
  const fresh = freshness(feed);
  const biggest = biggestThisWeek(feed);
  const recap = weeklyRecap(feed);
  const settled = progress.unseenSettled ?? 0;
  const newCount = seenBefore
    ? signals.filter((s) => s.kind === "contract" && !seenBefore.has(signalKey(s))).length : 0;
  const status = source === "live" ? `Updated ${timeAgo(feed.generated)}`
    : source === "cached" ? `Offline, showing data from ${timeAgo(feed.generated)}`
      : "Sample data";

  const header = (
    <View>
      <View style={styles.topBar}>
        <Text style={styles.brand} maxFontSizeMultiplier={1.4}>Radar{progress.streak > 1 ? <Text style={styles.streak}>  {progress.streak}-day streak</Text> : null}</Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Pressable onPress={() => setGlossary(null)} hitSlop={10} accessibilityRole="button">
            <Text style={styles.help} maxFontSizeMultiplier={1.4}>Glossary</Text>
          </Pressable>
          <Pressable onPress={() => { setGuide(true); setProgress((p) => ({ ...p, guideRead: true })); }}
            hitSlop={10} accessibilityRole="button">
            <Text style={styles.help} maxFontSizeMultiplier={1.4}>How it works</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.status}>{status}</Text>

      {source === "demo" && (
        <Text style={styles.notice}>
          These companies and awards are made up. Live data appears once the feed is reachable.
        </Text>
      )}
      {source === "cached" && !!error && (
        <Text style={styles.notice}>Couldn't refresh ({error}). Pull down to try again.</Text>
      )}
      {source === "live" && statusNote(feed) && (
        <Text style={styles.notice}>{statusNote(feed)}</Text>
      )}
      {tab === "contract" && !catchUpHidden && catchUp(signals, seenBefore, lastOpen) && (
        <Pressable onPress={() => setCatchUpHidden(true)} style={styles.catchUp} accessibilityRole="button">
          <Text style={styles.catchUpText}>{catchUp(signals, seenBefore, lastOpen)}</Text>
          <Text style={styles.catchUpHide}>Tap to dismiss</Text>
        </Pressable>
      )}

      <View style={styles.hero}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.heroFigure, { color: hero.gold ? colors.gold : colors.text }]}>
          {hero.figure}
        </Text>
        <Text style={styles.heroCaption}>{hero.caption}</Text>
        {tab === "contract" && newCount > 0 && (
          <Text style={styles.heroNew}>{newCount} new since your last visit</Text>
        )}
        {tab === "contract" && recapHidden && biggest?.kind === "contract" && (
          <Pressable onPress={() => openSignal(biggest)} style={styles.biggest} accessibilityRole="button"
            accessibilityLabel={`Biggest award this week: ${biggest.headline}`}>
            <Text style={styles.biggestLabel}>Biggest award this week</Text>
            <Text style={styles.biggestText} numberOfLines={2}>
              {biggest.company} ({biggest.ticker}), {amountLabel(biggest)}
            </Text>
            <Text style={styles.biggestOpen}>See what it means</Text>
          </Pressable>
        )}
        {tab === "contract" && fresh.latest && (
          <Text style={styles.heroFresh}>
            Most recent award signed {dayLabel(fresh.latest).replace(/^(Today|Yesterday)$/, (m) => m.toLowerCase())}.
            {fresh.note ? ` ${fresh.note}` : ""}
          </Text>
        )}
      </View>

      {settled > 0 && tab !== "you" && (
        <Pressable onPress={() => setTab("you")} style={styles.nudge} accessibilityRole="button">
          <Text style={styles.nudgeText}>
            {settled} of your calls {settled === 1 ? "has" : "have"} settled. See how you did.
          </Text>
        </Pressable>
      )}
      {tab === "contract" && recap && !recapHidden && (
        <RecapCard recap={recap} onOpen={openSignal} onDismiss={() => setRecapHidden(true)} />
      )}
      {tab !== "record" && tab !== "you" && tab !== "watch" && (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === "contract" ? "Search: ships, fuel, hospital, or a company" : "Search person, company or symbol"}
            placeholderTextColor={colors.muted}
            style={styles.search}
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search"
          />
          {tab === "contract" && !query && topics.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
              <Text style={styles.tryLabel}>Try:</Text>
              {topics.map((t) => (
                <Chip key={t} label={t} on={false} onPress={() => setQuery(t)} />
              ))}
            </ScrollView>
          )}
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
              {agency && (
                <Chip label={`About ${agency} ›`} on={false} onPress={() => setAgencyPage(agency)} />
              )}
            </ScrollView>
          )}
          <View style={{ height: 14 }} />
        </>
      )}
      {tab === "contract" && tour && !onboard && items.some((x) => !isHeader(x)) && (
        <Tour onDone={() => { setTour(false); finishTour(); }} />
      )}
    </View>
  );

  const empty = tab === "record" ? <TrackRecord record={feed.track_record} />
    : tab === "you" ? (
      <View>
        <You progress={progress} />
        <View style={styles.appearance}>
          <Text style={styles.appearanceLabel}>Appearance</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["system", "light", "dark"] as Appearance[]).map((a) => (
              <Chip key={a} label={a === "system" ? "Match phone" : a === "light" ? "Light" : "Dark"}
                on={appearance === a} onPress={() => onAppearance(a)} />
            ))}
          </View>
        </View>
      </View>
    )
      : tab === "watch" ? <Saved stocks={savedStocks(signals, watch)} onOpen={openSignal} onRemove={toggleStar} /> : (
    <Text style={styles.empty}>
      {query ? `Nothing matches "${query}".`
        : tab === "people" ? "No reported trades by members of Congress or executives in the last two weeks."
            : "No contract awards to public companies yet. Pull down to refresh."}
    </Text>
  );

  return (
    <View style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={["top"]}>
        <FlatList
          data={items}
          keyExtractor={(x: ListItem, i: number) => (isHeader(x) ? x.key : `${signalKey(x)}-${i}`)}
          renderItem={({ item }: { item: ListItem }) => isHeader(item) ? (
            <View style={styles.dayHead} accessibilityRole="header">
              <Text style={styles.dayTitle}>{item.header}</Text>
              <Text style={styles.dayDetail}>{item.detail}</Text>
            </View>
          ) : (
            <SignalCard signal={item} starred={watch.has(item.ticker)}
              isNew={!!seenBefore && !seenBefore.has(signalKey(item))}
              linked={item.kind === "contract" ? undefined : linkedContracts.get(item.ticker)}
              onPress={() => openSignal(item)} />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ListFooterComponent={
            <Pressable onPress={() => setLegal(true)} style={styles.footer} accessibilityRole="link">
              <Text style={styles.footerText}>{SHORT_DISCLAIMER}</Text>
              <Text style={styles.footerLink}>Disclaimers</Text>
            </Pressable>
          }
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
            <Pressable key={t.key} onPress={() => {
              setTab(t.key); setQuery("");
              if (t.key === "you" && settled) setProgress((p) => ({ ...p, unseenSettled: 0 }));
            }}
              style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <View style={[styles.tabMark, on && styles.tabMarkOn]} />
              <Text style={[styles.tabText, on && styles.tabTextOn]} maxFontSizeMultiplier={1.3} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <SignalDetail
        signal={open}
        all={signals}
        onOpen={openSignal}
        call={open ? callFor(progress, open) : undefined}
        onCall={(s: Signal, d: Direction) => setProgress((p) => makeCall(p, s, d))}
        onOpenRecord={() => setProgress((p) => ({ ...p, recordsOpened: p.recordsOpened + 1 }))}
        starred={!!open && watch.has(open.ticker)}
        onToggleStar={toggleStar}
        onClose={() => setOpen(null)}
        onLegal={() => { setOpen(null); setLegal(true); }}
        onExplain={(term: string) => setGlossary(term)}
        onAgency={(label: string) => { setOpen(null); setAgencyPage(label); }}
      />
      <AgencyPage summary={agencyPage ? agencySummary(signals, agencyPage) : null}
        onOpen={(s) => { setAgencyPage(null); openSignal(s); }} onClose={() => setAgencyPage(null)} />
      <Onboarding visible={onboard && !legal} onDone={() => { setOnboard(false); finishOnboarding(); }}
        onLegal={() => setLegal(true)} />
      <Guide visible={guide && !legal} onClose={() => setGuide(false)} onLegal={() => setLegal(true)} />
      <Legal visible={legal} onClose={() => setLegal(false)} />
      <Glossary visible={glossary !== false} focus={glossary || undefined} onClose={() => setGlossary(false)} />
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const system = useColorScheme();
  const [appearance, setAppearance] = useState<Appearance>("system");
  useEffect(() => { loadAppearance().then(setAppearance); }, []);
  const scheme = appearance === "system" ? (system === "light" ? "light" : "dark") : appearance;
  const palette = scheme === "light" ? LIGHT : DARK;
  return (
    <ThemeContext.Provider value={palette}>
      <SafeAreaProvider>
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
        <View style={{ flex: 1, backgroundColor: palette.bg }}>
          {loaded ? (
            <Radar appearance={appearance} onAppearance={(a) => { setAppearance(a); saveAppearance(a); }} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={palette.gold} />
            </View>
          )}
        </View>
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  topBar: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 10, flexWrap: "wrap", gap: 6,
  },
  brand: { fontFamily: fonts.black, fontSize: 20, color: colors.gold },
  streak: { fontFamily: fonts.semibold, fontSize: 12, color: colors.soft },
  status: { ...type.small, color: colors.muted, paddingHorizontal: 20, marginTop: 2 },
  help: { fontFamily: fonts.semibold, fontSize: 14, color: colors.soft },
  notice: {
    ...type.small, color: colors.soft, marginHorizontal: 20, marginTop: 12,
    borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: 10,
  },
  hero: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 },
  catchUp: { marginHorizontal: 16, marginTop: 12, backgroundColor: colors.panel, borderRadius: 14, padding: 14,
    borderLeftWidth: 3, borderLeftColor: colors.gold, gap: 4 },
  catchUpText: { ...type.lead, fontFamily: fonts.regular, color: colors.text },
  catchUpHide: { ...type.small, color: colors.muted },
  heroFigure: { ...type.hero, fontSize: 48, lineHeight: 52, fontVariant: ["tabular-nums"] },
  heroCaption: { ...type.lead, color: colors.soft, marginTop: 4, maxWidth: 320 },
  heroNew: { ...type.bodyStrong, color: colors.gold, marginTop: 8 },
  nudge: { marginHorizontal: 16, marginTop: 14, backgroundColor: colors.flagBg, borderRadius: 12, padding: 12 },
  nudgeText: { ...type.bodyStrong, color: colors.gold },
  biggest: { marginTop: 16, backgroundColor: colors.panel, borderRadius: 14, padding: 14, gap: 2,
    borderLeftWidth: 3, borderLeftColor: colors.gold },
  biggestLabel: { ...type.small, color: colors.muted },
  biggestText: { ...type.lead, fontFamily: fonts.bold, color: colors.text },
  biggestOpen: { ...type.small, fontFamily: fonts.semibold, color: colors.gold, marginTop: 4 },
  heroFresh: { ...type.small, color: colors.muted, marginTop: 10, maxWidth: 340 },
  dayHead: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
    marginHorizontal: 20, marginTop: 14, marginBottom: 10,
  },
  dayTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  dayDetail: { ...type.small, color: colors.muted, fontVariant: ["tabular-nums"] },
  search: {
    ...type.lead, color: colors.text, backgroundColor: colors.panel, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, marginHorizontal: 16,
  },
  chips: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.panel },
  tryLabel: { ...type.small, fontFamily: fonts.semibold, color: colors.muted, alignSelf: "center" },
  chipOn: { backgroundColor: colors.text },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.soft },
  chipTextOn: { color: colors.bg },
  appearance: { marginHorizontal: 16, marginTop: 8, gap: 8 },
  appearanceLabel: { ...type.bodyStrong, color: colors.text },
  footer: { marginHorizontal: 24, marginTop: 18, alignItems: "center", gap: 4 },
  footerText: { ...type.small, color: colors.muted, textAlign: "center" },
  footerLink: { ...type.small, fontFamily: fonts.semibold, color: colors.soft, textDecorationLine: "underline" },
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
