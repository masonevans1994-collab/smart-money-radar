import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { amountLabel, money, moveLabel, recordSentence, shortDate, shortName, tickerHelp, tooSoon } from "./logic";
import { Spark } from "./Spark";
import { fonts, type, type Palette, useColors } from "./theme";
import type { Signal } from "./types";

export interface CompanyView {
  ticker: string;
  name: string;
  anchor: Signal;            // the contract that opened this page (has history + spark)
  items: Signal[];           // everything in the feed for this ticker
}

export function CompanyPage({ view, saved, onToggleSave, onOpen, onClose }: {
  view: CompanyView | null; saved: boolean; onToggleSave: (t: string) => void;
  onOpen: (s: Signal) => void; onClose: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!view) return null;
  const a = view.anchor;
  const hist = a.kind === "contract" ? a.history : undefined;
  const w30 = hist?.windows["30"];
  const trades = view.items.filter((s) => s.kind !== "contract");
  const contracts = view.items.filter((s) => s.kind === "contract");
  const recentTotal = contracts.reduce((t, c) => t + (c.kind === "contract" ? c.value : 0), 0);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
          <View style={styles.bar}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.done}>‹ Back</Text>
            </Pressable>
            <Pressable onPress={() => onToggleSave(view.ticker)} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.done, { color: colors.gold }]}>{saved ? "★ Saved" : "☆ Save"}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.name}>{shortName({ company: view.name, ticker: view.ticker })}</Text>
            <Text style={styles.ticker}>{view.ticker}{shortName({ company: view.name, ticker: view.ticker }) !== view.name ? ` · ${view.name}` : ""}</Text>
            <Text style={styles.help}>{tickerHelp(a)}</Text>

            {a.spark && (
              <View style={styles.box}>
                <View style={styles.rowBetween}>
                  <Text style={styles.boxTitle}>Stock lately</Text>
                  <Text style={[styles.move, { color: tooSoon(a) || !a.change_pct ? colors.soft : a.change_pct > 0 ? colors.up : colors.down }]}>
                    {moveLabel(a)}
                  </Text>
                </View>
                <Spark data={a.spark} mark={a.spark_mark} width={300} height={64} up={(a.change_pct ?? 0) >= 0} />
                <Text style={styles.small}>Gold bar: the most recent award, {shortDate(a.trade_date)}.</Text>
              </View>
            )}

            <Text style={styles.section}>How this company's stock reacts to government deals</Text>
            {hist && w30 ? (
              <View style={styles.box}>
                <Text style={styles.lead}>
                  {recordSentence({ id: view.ticker, label: view.name, n: w30.n, avg_vs_spy: w30.avg_vs_spy, beat_spy_pct: w30.beat_pct })}
                </Text>
                <Text style={styles.small}>Measured over the 30 days after each award of $25M or more in the last 3 years.</Text>
              </View>
            ) : (
              <Text style={styles.muted}>Not enough past awards to say yet.</Text>
            )}

            <Text style={styles.section}>Recent government deals ({money(recentTotal)} this month)</Text>
            <View style={styles.list}>
              {contracts.map((c, i) => (
                <Pressable key={`${c.trade_date}-${i}`} onPress={() => onOpen(c)} accessibilityRole="button"
                  style={[styles.item, i === contracts.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemAmount}>{amountLabel(c)}</Text>
                    <Text style={styles.itemText} numberOfLines={1}>
                      {c.kind === "contract" ? `${c.sub_agency || c.agency}` : ""} · {shortDate(c.trade_date)}
                    </Text>
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              ))}
            </View>

            {!!hist?.awards?.length && (
              <>
                <Text style={styles.section}>Past deals and what the stock did after</Text>
                <View style={styles.list}>
                  {hist.awards.map((h, i) => (
                    <View key={`${h.date}-${i}`} style={[styles.item, i === hist.awards!.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemAmount}>{money(h.value)}</Text>
                        <Text style={styles.itemText} numberOfLines={1}>
                          {h.agency.replace(/^Department of (the )?/i, "")} · {shortDate(h.date, true)}
                        </Text>
                      </View>
                      <Text style={[styles.after, { color: h.d30 == null ? colors.muted : h.d30 > 0 ? colors.up : h.d30 < 0 ? colors.down : colors.soft }]}>
                        {h.d30 == null ? "–" : `${h.d30 > 0 ? "+" : ""}${h.d30.toFixed(1)}%`}
                        <Text style={styles.afterLabel}>{"\n"}30 days after</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {trades.length > 0 && (
              <>
                <Text style={styles.section}>Who's been trading it</Text>
                <View style={styles.list}>
                  {trades.slice(0, 8).map((t, i) => (
                    <Pressable key={`${t.who}-${t.trade_date}-${i}`} onPress={() => onOpen(t)} accessibilityRole="button"
                      style={[styles.item, i === Math.min(trades.length, 8) - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemText}>{t.headline}</Text>
                        <Text style={styles.small}>{shortDate(t.trade_date)}</Text>
                      </View>
                      <Text style={styles.chev}>›</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Text style={styles.foot}>From public records. For information only, not investment advice.</Text>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  done: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  name: { ...type.hero, fontSize: 30, lineHeight: 36, color: colors.text },
  ticker: { fontFamily: fonts.bold, fontSize: 15, color: colors.soft, marginTop: 4 },
  help: { ...type.small, color: colors.muted, marginTop: 6 },
  box: { backgroundColor: colors.panel, borderRadius: 16, padding: 16, gap: 10, marginTop: 16 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  boxTitle: { ...type.bodyStrong, color: colors.text },
  move: { fontFamily: fonts.bold, fontSize: 15 },
  lead: { ...type.lead, fontFamily: fonts.regular, color: colors.text },
  small: { ...type.small, color: colors.muted },
  muted: { ...type.body, color: colors.muted },
  section: { ...type.title, fontSize: 17, color: colors.text, marginTop: 26, marginBottom: 10 },
  list: { backgroundColor: colors.panel, borderRadius: 16, paddingHorizontal: 16 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  itemAmount: { fontFamily: fonts.bold, fontSize: 16, color: colors.gold, fontVariant: ["tabular-nums"] },
  itemText: { ...type.body, color: colors.text, marginTop: 2 },
  after: { fontFamily: fonts.bold, fontSize: 15, textAlign: "right", fontVariant: ["tabular-nums"] },
  afterLabel: { ...type.small, fontSize: 10, color: colors.muted },
  chev: { color: colors.muted, fontSize: 22 },
  foot: { ...type.small, color: colors.muted, marginTop: 16 },
});
