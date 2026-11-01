import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { type Call, type Direction } from "./game";
import { shortDate, shortName } from "./logic";
import { fonts, type, type Palette, useColors } from "./theme";
import type { Signal } from "./types";

const OPTIONS: [Direction, string][] = [["up", "Higher"], ["flat", "Same"], ["down", "Lower"]];

export function CallBox({ signal, call, onCall }: {
  signal: Signal; call?: Call; onCall: (d: Direction) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (signal.price_now === undefined) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Make a call</Text>
      {call ? (
        <>
          <Text style={styles.body}>
            You said {signal.ticker} would be {label(call.direction)} 30 days after {shortDate(call.madeOn)}.
            {call.result
              ? ` It was ${call.result === "right" ? "right" : "wrong"}: $${call.priceThen.toFixed(2)} → $${(call.priceEnd ?? 0).toFixed(2)}.`
              : ` It settles on ${shortDate(call.resolveOn)}. Check the You tab.`}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Where will {shortName(signal)}'s stock ({signal.ticker}) be in 30 days? Just a guess, no money involved. You'll see
            how you did on the You tab.
          </Text>
          <View style={styles.row}>
            {OPTIONS.map(([d, t]) => (
              <Pressable key={d} onPress={() => onCall(d)} style={styles.btn} accessibilityRole="button">
                <Text style={styles.btnText}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function label(d: Direction): string {
  return d === "up" ? "higher" : d === "down" ? "lower" : "about the same";
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  box: { backgroundColor: colors.panel, borderRadius: 16, padding: 16, marginTop: 20, gap: 10 },
  title: { ...type.bodyStrong, color: colors.text },
  body: { ...type.body, color: colors.soft },
  row: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, backgroundColor: colors.raised, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
});
