import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { agencyLabel, amountLabel, isSell, keyNote, moveLabel, scoreTier, shortDate, tierLabel } from "./logic";
import { Spark } from "./Spark";
import { topicsFor } from "./topics";
import { fonts, type, type Palette, useColors } from "./theme";
import type { Signal } from "./types";

const tierColor = (c: Palette, score: number) => ({ high: c.up, mid: c.gold, low: c.muted })[scoreTier(score)];

export function ScoreBadge({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const c = tierColor(colors, score);
  const lg = size === "lg";
  return (
    <View style={[styles.score, { borderColor: c }, lg && styles.scoreLg]}
      accessibilityLabel={`Score ${score} out of 100`}>
      <Text style={[styles.scoreText, { color: c }, lg && styles.scoreTextLg]}>{score}</Text>
    </View>
  );
}

export function ChangeChip({ signal, big }: { signal: Signal; big?: boolean }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const label = moveLabel(signal);
  if (!label) return null;
  const v = signal.change_pct ?? 0;
  const tint = v > 0 ? colors.up : v < 0 ? colors.down : colors.soft;
  return (
    <Text style={[styles.change, big && styles.changeBig, { color: tint }]}>
      {label}
    </Text>
  );
}

function SignalCardBase({ signal, starred, isNew, onPress, linked }: {
  signal: Signal; starred: boolean; isNew: boolean; onPress: () => void; linked?: Signal;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const contract = signal.kind === "contract";
  const name = signal.kind === "congress" ? signal.who : signal.company;
  const context = contract ? `${agencyLabel(signal)} contract` : signal.kind === "congress"
    ? `${signal.type}${signal.owner !== "Self" ? ` by ${signal.owner.toLowerCase()}` : ""}`
    : `${signal.role_label ?? "Company insider"} bought with their own money`;
  const up = (signal.change_pct ?? 0) >= 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${signal.headline}, score ${signal.score}`}
    >
      <View style={styles.top}>
        <Text maxFontSizeMultiplier={1.4} style={[styles.amount, { color: contract ? colors.gold : isSell(signal) ? colors.down : colors.text }]}
          numberOfLines={1}>
          {amountLabel(signal)}
        </Text>
        <ScoreBadge score={signal.score} />
      </View>

      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.ticker}>{signal.ticker}</Text>
        {starred && <Text style={styles.star} accessibilityLabel="Saved">★</Text>}
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.context} numberOfLines={1}>
          {context}
          {contract && signal.who !== signal.company ? `, via ${signal.who}` : ""}
        </Text>
        {contract && topicsFor(signal).slice(0, 2).map((t) => <Text key={t} style={styles.pill}>{t}</Text>)}
        {contract && signal.is_modification && <Text style={styles.pill}>Add-on</Text>}
        {signal.score >= 45 && (
          <Text style={[styles.pill, signal.score >= 70 && styles.standout]}>{tierLabel(signal.score)}</Text>
        )}
        {isNew && <Text style={[styles.pill, styles.newPill]}>New</Text>}
      </View>

      {contract && !!signal.committee_flag && (
        <Text style={styles.flag} numberOfLines={2}>
          Committee overlap: {signal.committee_flag.replace(" · ", " sits on ")}
        </Text>
      )}
      <Text style={styles.note} numberOfLines={2}>{keyNote(signal)}</Text>
      {!contract && linked?.kind === "contract" && (
        <Text style={styles.linked} numberOfLines={2}>{linkedLine(signal, linked)}</Text>
      )}

      <View style={styles.bottom}>
        <Spark data={signal.spark} mark={signal.spark_mark} up={up} />
        <View style={styles.bottomText}>
          <ChangeChip signal={signal} />
          <Text style={styles.date}>
            since {contract ? "signed" : "traded"} {shortDate(signal.trade_date)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function linkedLine(s: Signal, c: Signal): string {
  const win = `${s.ticker} won ${amountLabel(c)} from ${agencyLabel(c)}`;
  if (s.trade_date && c.trade_date && c.trade_date > s.trade_date) {
    const days = Math.round((Date.parse(c.trade_date) - Date.parse(s.trade_date)) / 86400000);
    return `${days} day${days === 1 ? "" : "s"} later, ${win}`;
  }
  return `${win} on ${shortDate(c.trade_date)}`;
}

export const SignalCard = memo(SignalCardBase);

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    marginHorizontal: 16, marginBottom: 10, padding: 16, borderRadius: 16,
    backgroundColor: colors.panel,
  },
  pressed: { backgroundColor: colors.raised },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  amount: { ...type.amount, flexShrink: 1, fontVariant: ["tabular-nums"] },
  score: {
    minWidth: 34, height: 26, paddingHorizontal: 6, borderRadius: 13, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  scoreLg: { minWidth: 56, height: 40, borderRadius: 20, borderWidth: 2 },
  scoreText: { fontFamily: fonts.bold, fontSize: 13, fontVariant: ["tabular-nums"] },
  scoreTextLg: { fontSize: 18 },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
  name: { ...type.lead, color: colors.text, flexShrink: 1 },
  ticker: { fontFamily: fonts.bold, fontSize: 13, color: colors.soft, letterSpacing: 0.3 },
  star: { color: colors.gold, fontSize: 13 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  context: { ...type.small, color: colors.muted, flexShrink: 1 },
  pill: {
    ...type.small, fontFamily: fonts.semibold, color: colors.soft, backgroundColor: colors.raised,
    paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, overflow: "hidden",
  },
  newPill: { color: colors.onGold, backgroundColor: colors.gold },
  standout: { color: colors.up, backgroundColor: colors.standoutBg },
  flag: {
    ...type.small, fontFamily: fonts.semibold, color: colors.flagText, marginTop: 10,
    borderLeftWidth: 3, borderLeftColor: colors.seal, paddingLeft: 8,
  },
  note: { ...type.body, color: colors.soft, marginTop: 10 },
  linked: {
    ...type.small, fontFamily: fonts.semibold, color: colors.gold, marginTop: 8,
    borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: 8,
  },
  bottom: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12 },
  bottomText: { alignItems: "flex-end", gap: 2 },
  change: { fontFamily: fonts.bold, fontSize: 13, fontVariant: ["tabular-nums"] },
  changeBig: { fontSize: 16 },
  date: { ...type.small, color: colors.muted },
});
