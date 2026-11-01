import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { agencyDescription } from "./agencies";
import { type AgencySummary, amountLabel, money, moveLabel, shortDate } from "./logic";
import { Spark } from "./Spark";
import { fonts, type, type Palette, useColors } from "./theme";
import type { Signal } from "./types";

export function AgencyPage({ summary, onOpen, onClose, stacked }: {
  summary: AgencySummary | null; onOpen: (s: Signal) => void; onClose: () => void; stacked?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const first = summary?.contracts[0];
  const desc = first?.kind === "contract" ? agencyDescription(first.agency, first.sub_agency) : null;
  return (
    <Modal visible={!!summary} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
          {summary && (
            <>
              <View style={styles.bar}>
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                  <Text style={styles.done}>{stacked ? "‹ Back" : "Done"}</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.kicker}>Recent contracts from</Text>
                <Text style={styles.title}>{summary.label}</Text>
                {!!desc && <Text style={styles.desc}>{desc}</Text>}
                <View style={styles.stats}>
                  <Stat n={money(summary.total)} label={`across ${summary.count} award${summary.count === 1 ? "" : "s"}`} gold />
                  <Stat n={summary.avgMove === null ? "–" : `${summary.avgMove > 0 ? "+" : ""}${summary.avgMove.toFixed(1)}%`}
                    label="average stock move since" />
                  <Stat n={summary.avgMove === null ? "–" : `${summary.upCount} of ${summary.contracts.filter((c) => c.change_pct !== undefined).length}`}
                    label="stocks up since the award" />
                </View>
                <Text style={styles.section}>Awards, newest first</Text>
                <View style={styles.list}>
                  {summary.contracts.map((c, i) => (
                    <Pressable key={`${c.ticker}-${c.trade_date}-${i}`} onPress={() => onOpen(c)}
                      style={[styles.item, i === summary.contracts.length - 1 && { borderBottomWidth: 0 }]}
                      accessibilityRole="button">
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemAmount}>{amountLabel(c)}</Text>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {c.kind === "contract" ? c.company : c.ticker} · {shortDate(c.trade_date)}
                        </Text>
                        <Text style={styles.itemMove}>{moveLabel(c) ?? "No price data yet"}</Text>
                      </View>
                      <Spark data={c.spark} mark={c.spark_mark} width={64} height={24} up={(c.change_pct ?? 0) >= 0} />
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.foot}>
                  Stock moves are from the signing date to the latest close. For information only, not investment advice.
                </Text>
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function Stat({ n, label, gold }: { n: string; label: string; gold?: boolean }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={[styles.statN, gold && { color: colors.gold }]}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: "row", justifyContent: "flex-start", paddingHorizontal: 20, paddingVertical: 14 },
  done: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  kicker: { ...type.bodyStrong, color: colors.muted },
  title: { ...type.hero, fontSize: 34, lineHeight: 40, color: colors.text, marginTop: 2 },
  desc: { ...type.body, fontSize: 15, lineHeight: 22, color: colors.soft, marginTop: 10 },
  stats: { flexDirection: "row", gap: 8, marginTop: 18 },
  stat: { flex: 1, backgroundColor: colors.panel, borderRadius: 14, padding: 12 },
  statN: { fontFamily: fonts.black, fontSize: 20, color: colors.text, fontVariant: ["tabular-nums"] },
  statL: { ...type.small, fontSize: 11, color: colors.muted, marginTop: 2 },
  section: { ...type.title, fontSize: 17, color: colors.text, marginTop: 26, marginBottom: 10 },
  list: { backgroundColor: colors.panel, borderRadius: 16, paddingHorizontal: 16 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  itemAmount: { fontFamily: fonts.bold, fontSize: 17, color: colors.gold, fontVariant: ["tabular-nums"] },
  itemName: { ...type.body, color: colors.text, marginTop: 2 },
  itemMove: { ...type.small, color: colors.muted, marginTop: 2 },
  foot: { ...type.small, color: colors.muted, marginTop: 16 },
});
