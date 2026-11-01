import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { isSell, scoreColor, tagFor } from "./logic";
import { colors } from "./theme";
import type { Signal } from "./types";

export function ScoreBadge({ score, size = 48 }: { score: number; size?: number }) {
  const c = scoreColor(score);
  return (
    <View style={[styles.score, { width: size, height: size, borderRadius: size / 2, borderColor: c }]}>
      <Text style={[styles.scoreText, { color: c, fontSize: size * 0.36 }]}>{score}</Text>
    </View>
  );
}

function SignalCardBase({ signal, starred, onPress }: {
  signal: Signal; starred: boolean; onPress: () => void;
}) {
  const sell = isSell(signal);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.card, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel={`${signal.headline}, score ${signal.score}`}
    >
      <ScoreBadge score={signal.score} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.ticker}>{signal.ticker}</Text>
          {starred && <Text style={styles.star}>★</Text>}
          <Text style={[styles.tag, { color: sell ? colors.sell : colors.accent }]}>
            {tagFor(signal).toUpperCase()}
          </Text>
          <Text style={styles.tag}>{signal.kind === "insider" ? "SEC" : "CONGRESS"}</Text>
        </View>
        <Text style={styles.headline} numberOfLines={2}>{signal.headline}</Text>
        {signal.reasons.slice(0, 2).map((r) => (
          <View key={r} style={styles.bulletRow}>
            <Text style={styles.reason}>•</Text>
            <Text style={[styles.reason, styles.bulletText]} numberOfLines={1}>{r}</Text>
          </View>
        ))}
        <Text style={styles.meta}>
          Traded {signal.trade_date ?? "?"} · Disclosed {signal.disclosed}
        </Text>
      </View>
    </Pressable>
  );
}

export const SignalCard = memo(SignalCardBase);

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", gap: 12, backgroundColor: colors.panel,
    borderColor: colors.line, borderWidth: 1, borderRadius: 14,
    padding: 14, marginHorizontal: 16, marginBottom: 10,
  },
  score: { borderWidth: 4, alignItems: "center", justifyContent: "center" },
  scoreText: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  body: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  ticker: { color: colors.text, fontSize: 17, fontWeight: "700" },
  star: { color: colors.warn, fontSize: 14 },
  tag: {
    color: colors.muted, fontSize: 10, fontWeight: "600", letterSpacing: 0.5,
    backgroundColor: colors.chip, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 5, overflow: "hidden",
  },
  headline: { color: colors.text, fontSize: 15, marginTop: 3, marginBottom: 4, lineHeight: 20 },
  reason: { color: colors.soft, fontSize: 13, lineHeight: 18 },
  bulletRow: { flexDirection: "row", gap: 6 },
  bulletText: { flex: 1 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 6 },
});
