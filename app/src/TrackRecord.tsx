import { StyleSheet, Text, View } from "react-native";

import { pct } from "./logic";
import { colors } from "./theme";
import type { TrackRecord as TR } from "./types";

export function TrackRecord({ record }: { record?: TR | null }) {
  if (!record || !record.groups.length) {
    return (
      <Text style={styles.empty}>
        The track record builds up as the app runs. Check back in a few days.
      </Text>
    );
  }
  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>
        How stocks did after each kind of signal, compared with the {record.benchmark}.
        {record.demo ? " (Demo numbers.)" : ""}
      </Text>
      {record.groups.map((g) => {
        const vs = g.avg_vs_spy ?? 0;
        const up = vs >= 0;
        return (
          <View key={g.id} style={styles.card}>
            <Text style={styles.label}>{g.label}</Text>
            {g.n === 0 ? (
              <Text style={styles.muted}>Not enough history yet</Text>
            ) : (
              <>
                <View style={styles.row}>
                  <Text style={[styles.big, { color: up ? colors.accent : colors.sell }]}>{pct(g.avg_vs_spy)}</Text>
                  <Text style={styles.bigLabel}>average vs. S&P 500</Text>
                </View>
                <View style={styles.stats}>
                  <Stat label="Avg. return" value={pct(g.avg_return)} />
                  <Stat label="Beat the market" value={`${g.beat_spy_pct ?? 0}%`} />
                  <Stat label="vs. S&P after 30 days" value={pct(g.avg_vs_spy_30d)} />
                </View>
                <Text style={styles.muted}>
                  {g.n} signal{g.n === 1 ? "" : "s"} since {g.since}
                </Text>
                {!!g.best && <Text style={styles.best} numberOfLines={2}>Best: {g.best}</Text>}
              </>
            )}
          </View>
        );
      })}
      <Text style={styles.foot}>
        Past results don't predict future ones. Returns use daily closing prices from the
        signal date (or the insider's own price) to today. Not investment advice.
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statV}>{value}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, gap: 10, marginTop: 14 },
  intro: { color: colors.soft, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  card: {
    backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1,
    borderRadius: 14, padding: 14, gap: 8,
  },
  label: { color: colors.text, fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  big: { fontSize: 28, fontWeight: "800", fontVariant: ["tabular-nums"] },
  bigLabel: { color: colors.muted, fontSize: 13 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: colors.chip, borderRadius: 10, padding: 8 },
  statV: { color: colors.text, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statL: { color: colors.muted, fontSize: 11, marginTop: 2 },
  muted: { color: colors.muted, fontSize: 12 },
  best: { color: colors.soft, fontSize: 12 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40, marginHorizontal: 24, lineHeight: 22 },
  foot: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 20 },
});
