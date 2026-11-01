import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { pct } from "./logic";
import { fonts, type, type Palette, useColors } from "./theme";
import type { TrackRecord as TR } from "./types";

export function TrackRecord({ record }: { record?: TR | null }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        Average stock moves after each kind of signal, compared with the {record.benchmark}.
        {record.demo ? " These are sample numbers." : ""}
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
                  <Text style={[styles.big, { color: up ? colors.up : colors.down }]}>{pct(g.avg_vs_spy)}</Text>
                  <Text style={styles.bigLabel}>better or worse than the market, on average</Text>
                </View>
                <View style={styles.stats}>
                  <Stat label="Avg. return" value={pct(g.avg_return)} />
                  <Stat label="Beat the market" value={`${g.beat_spy_pct ?? 0}%`} />
                  <Stat label="vs. the market after 30 days" value={pct(g.avg_vs_spy_30d)} />
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
        These figures are calculated from daily closing prices, not from real trades, and don't
        include fees, taxes or the delay before news becomes public. Past results don't predict
        future results. Not investment advice.
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statV}>{value}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { paddingHorizontal: 16, gap: 10, marginTop: 4 },
  intro: { ...type.body, color: colors.soft, marginBottom: 4 },
  card: { backgroundColor: colors.panel, borderRadius: 16, padding: 16, gap: 10 },
  label: { ...type.lead, fontFamily: fonts.bold, color: colors.text },
  row: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  big: { ...type.amount, fontVariant: ["tabular-nums"] },
  bigLabel: { ...type.body, color: colors.muted },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: colors.raised, borderRadius: 10, padding: 8 },
  statV: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, fontVariant: ["tabular-nums"] },
  statL: { ...type.small, fontSize: 11, color: colors.muted, marginTop: 2 },
  muted: { ...type.small, color: colors.muted },
  best: { ...type.small, color: colors.soft },
  empty: { ...type.lead, color: colors.muted, textAlign: "center", marginTop: 40, marginHorizontal: 24 },
  foot: { ...type.small, fontSize: 11, color: colors.muted, marginTop: 6, marginBottom: 20 },
});
