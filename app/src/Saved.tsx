import { Pressable, StyleSheet, Text, View } from "react-native";

import { amountLabel, moveLabel, money, type SavedStock, shortDate } from "./logic";
import { Spark } from "./Spark";
import { colors, fonts, type } from "./theme";
import type { Signal } from "./types";

export function Saved({ stocks, onOpen, onRemove }: {
  stocks: SavedStock[]; onOpen: (s: Signal) => void; onRemove: (ticker: string) => void;
}) {
  if (!stocks.length) {
    return (
      <Text style={styles.empty}>
        Nothing saved yet. Open any award or trade and tap Save to follow that stock here.
      </Text>
    );
  }
  return (
    <View style={styles.wrap}>
      {stocks.map((st) => {
        const total = st.contracts.reduce((s, c) => s + (c.kind === "contract" ? c.value : 0), 0);
        const latest = st.latest;
        return (
          <View key={st.ticker} style={styles.card}>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={styles.company} numberOfLines={1}>{st.company}</Text>
                <Text style={styles.ticker}>{st.ticker}</Text>
              </View>
              <Pressable onPress={() => onRemove(st.ticker)} hitSlop={10} accessibilityRole="button"
                accessibilityLabel={`Stop following ${st.ticker}`}>
                <Text style={styles.remove}>Unsave</Text>
              </Pressable>
            </View>
            <Text style={styles.summary}>
              {st.contracts.length
                ? `${st.contracts.length} government contract${st.contracts.length === 1 ? "" : "s"} worth ${money(total)} recently`
                : "No recent government contracts in Radar"}
              {st.trades.length ? `, and ${st.trades.length} reported trade${st.trades.length === 1 ? "" : "s"} by insiders or members of Congress` : ""}.
            </Text>
            {latest && (
              <Pressable onPress={() => onOpen(latest)} style={styles.latest} accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={styles.latestLabel}>Most recent</Text>
                  <Text style={styles.latestText} numberOfLines={2}>{latest.headline}</Text>
                  <Text style={styles.latestMeta}>
                    {amountLabel(latest)} · {shortDate(latest.trade_date)}
                    {moveLabel(latest) ? ` · ${moveLabel(latest)}` : ""}
                  </Text>
                </View>
                <Spark data={latest.spark} mark={latest.spark_mark} width={72} height={26}
                  up={(latest.change_pct ?? 0) >= 0} />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, gap: 10, marginTop: 4 },
  card: { backgroundColor: colors.panel, borderRadius: 16, padding: 16, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  company: { ...type.title, fontSize: 18, color: colors.text },
  ticker: { fontFamily: fonts.bold, fontSize: 13, color: colors.soft },
  remove: { ...type.small, fontFamily: fonts.semibold, color: colors.muted },
  summary: { ...type.body, color: colors.soft },
  latest: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.raised,
    borderRadius: 12, padding: 12 },
  latestLabel: { ...type.small, color: colors.muted },
  latestText: { ...type.bodyStrong, color: colors.text, marginTop: 2 },
  latestMeta: { ...type.small, color: colors.muted, marginTop: 4 },
  empty: { ...type.lead, color: colors.muted, textAlign: "center", marginTop: 48, marginHorizontal: 32 },
});
