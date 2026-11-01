import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { amountLabel, isSell, tagFor } from "./logic";
import { ScoreBadge } from "./SignalCard";
import { colors } from "./theme";
import type { Signal } from "./types";

type RowData = [label: string, value: string | number | null | undefined];

function Rows({ rows }: { rows: RowData[] }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
  return (
    <>
      {shown.map(([label, value], i) => (
        <Row key={label} label={label} value={value as string | number} last={i === shown.length - 1} />
      ))}
    </>
  );
}

function Row({ label, value, last }: { label: string; value: string | number; last: boolean }) {
  return (
    <View style={[styles.kv, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.k}>{label}</Text>
      <Text style={styles.v}>{String(value)}</Text>
    </View>
  );
}

export function SignalDetail({ signal, starred, onToggleStar, onClose }: {
  signal: Signal | null; starred: boolean;
  onToggleStar: (ticker: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={!!signal} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaProvider>
      <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
        {signal && (
          <>
            <View style={styles.top}>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={styles.link}>Close</Text>
              </Pressable>
              <Pressable onPress={() => onToggleStar(signal.ticker)} hitSlop={12}>
                <Text style={[styles.link, { color: colors.warn }]}>
                  {starred ? "★ Watching" : "☆ Watch"}
                </Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.hero}>
                <ScoreBadge score={signal.score} size={72} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.ticker}>{signal.ticker}</Text>
                  <Text style={[styles.tag, { color: isSell(signal) ? colors.sell : colors.accent }]}>
                    {tagFor(signal)}
                  </Text>
                </View>
              </View>
              <Text style={styles.headline}>{signal.headline}</Text>

              <Text style={styles.section}>Why it scored {signal.score}</Text>
              {signal.reasons.map((r) => (
                <View key={r} style={styles.bulletRow}>
                  <Text style={styles.reason}>•</Text>
                  <Text style={[styles.reason, { flex: 1 }]}>{r}</Text>
                </View>
              ))}

              <Text style={styles.section}>Details</Text>
              <View style={styles.box}>
                <Rows rows={[
                  ["Who", signal.who],
                  ...(signal.kind === "insider" ? ([
                    ["Company", signal.company],
                    ["Role", signal.role_label],
                    ["Amount", amountLabel(signal)],
                    ["Shares", signal.shares.toLocaleString("en-US")],
                    ["Avg price", signal.avg_price != null ? `$${signal.avg_price.toFixed(2)}` : null],
                    ["Shares after", signal.shares_after?.toLocaleString("en-US")],
                  ] as RowData[]) : ([
                    ["District", signal.district],
                    ["Owner", signal.owner],
                    ["Amount", amountLabel(signal)],
                    ["Asset", signal.asset_type === "OP" ? "Options"
                      : signal.asset_type === "ST" ? "Stock" : signal.asset_type],
                    ["Days to disclose", signal.lag_days],
                  ] as RowData[])),
                  ["Traded", signal.trade_date],
                  ["Disclosed", signal.disclosed],
                ]} />
              </View>

              {!!signal.url && (
                <Pressable style={styles.button} onPress={() => Linking.openURL(signal.url)}>
                  <Text style={styles.buttonText}>View original filing</Text>
                </Pressable>
              )}
              <Text style={styles.disclaimer}>
                From public SEC and House disclosures. For information only, not investment advice.
              </Text>
            </ScrollView>
          </>
        )}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", justifyContent: "space-between", padding: 16 },
  link: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  content: { padding: 20, paddingTop: 4, paddingBottom: 40 },
  hero: { flexDirection: "row", alignItems: "center", gap: 16 },
  ticker: { color: colors.text, fontSize: 30, fontWeight: "800" },
  tag: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  headline: { color: colors.text, fontSize: 18, lineHeight: 25, marginTop: 16 },
  section: {
    color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.8,
    textTransform: "uppercase", marginTop: 24, marginBottom: 8,
  },
  reason: { color: colors.soft, fontSize: 15, lineHeight: 22 },
  bulletRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  box: {
    backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 14,
  },
  kv: {
    flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 11,
    borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  k: { color: colors.muted, fontSize: 14 },
  v: { color: colors.text, fontSize: 14, flexShrink: 1, textAlign: "right" },
  button: {
    backgroundColor: colors.text, borderRadius: 12, paddingVertical: 14,
    alignItems: "center", marginTop: 24,
  },
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: 15 },
  disclaimer: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 16 },
});
