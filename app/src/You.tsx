import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { callStats, milestones, type Progress } from "./game";
import { shortDate } from "./logic";
import { fonts, type, type Palette, useColors } from "./theme";

export function You({ progress, onGo }: { progress: Progress; onGo?: (where: "guide" | "contracts" | "record") => void }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const st = callStats(progress);
  const ms = milestones(progress);
  const done = ms.filter((m) => m.done).length;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Stat n={String(progress.streak)} label={progress.streak === 1 ? "day streak" : "day streak"} />
        <Stat n={st.pct === null ? "–" : `${st.pct}%`} label="calls right" />
        <Stat n={`${done}/${ms.length}`} label="milestones" />
      </View>

      {(() => {
        const next = ms.find((m) => !m.done);
        const where = next?.id === "guide" ? "guide" : next?.id === "settled" ? "record" : "contracts";
        return next ? (
          <Pressable onPress={() => onGo?.(where)} style={({ pressed }: { pressed: boolean }) => [styles.next, pressed && { opacity: 0.7 }]}
            accessibilityRole="button" accessibilityLabel={`Next up: ${next.detail}`}>
            <Text style={styles.nextLabel}>Next up</Text>
            <Text style={styles.nextText}>{next.detail} ›</Text>
            <Text style={styles.nextSub}>Earns "{next.title}"</Text>
          </Pressable>
        ) : null;
      })()}

      <Text style={styles.section}>Your calls</Text>
      {progress.calls.length === 0 ? (
        <Text style={styles.muted}>
          Open any award and tap Higher, Same or Lower. In 30 days you&apos;ll see if you were right.
        </Text>
      ) : (
        <View style={styles.list}>
          {progress.calls.slice(0, 20).map((c, i) => (
            <View key={c.key} style={[styles.item, i === Math.min(progress.calls.length, 20) - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{c.ticker} {c.direction === "up" ? "higher" : c.direction === "down" ? "lower" : "about the same"}</Text>
                <Text style={styles.muted} numberOfLines={1}>{c.headline}</Text>
              </View>
              <Text style={[styles.result, c.result === "right" && { color: colors.up },
                c.result === "wrong" && { color: colors.down }]}>
                {c.result ? (c.result === "right" ? "Right" : "Wrong") : `Settles ${shortDate(c.resolveOn)}`}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.section}>Milestones</Text>
      <View style={styles.list}>
        {ms.map((m, i) => (
          <View key={m.id} style={[styles.item, i === ms.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={[styles.check, m.done && { color: colors.gold }]}>{m.done ? "●" : "○"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, !m.done && { color: colors.soft }]}>{m.title}</Text>
              <Text style={styles.muted}>{m.detail}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.foot}>
        Calls are guesses for learning, not advice, and nothing here involves real money.
        Best streak: {progress.bestStreak} {progress.bestStreak === 1 ? "day" : "days"}.
      </Text>
    </View>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 4 },
  row: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: colors.panel, borderRadius: 14, padding: 14 },
  statN: { ...type.amount, color: colors.gold, fontVariant: ["tabular-nums"] },
  statL: { ...type.small, color: colors.muted, marginTop: 2 },
  section: { ...type.title, fontSize: 17, color: colors.text, marginTop: 24, marginBottom: 10 },
  next: { marginTop: 14, backgroundColor: colors.panel, borderRadius: 14, padding: 14, gap: 2,
    borderLeftWidth: 3, borderLeftColor: colors.gold },
  nextLabel: { ...type.small, color: colors.muted },
  nextText: { ...type.lead, fontFamily: fonts.bold, color: colors.text },
  nextSub: { ...type.small, color: colors.muted },
  list: { backgroundColor: colors.panel, borderRadius: 16, paddingHorizontal: 16 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  itemTitle: { ...type.bodyStrong, color: colors.text },
  muted: { ...type.small, color: colors.muted },
  result: { fontFamily: fonts.semibold, fontSize: 13, color: colors.soft },
  check: { fontSize: 16, color: colors.muted, width: 18 },
  foot: { ...type.small, color: colors.muted, marginTop: 16, marginBottom: 8 },
});
