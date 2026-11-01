import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { amountLabel, changeLabel, isSell, money, related, signalKey, sourceFor, tagFor } from "./logic";
import { ChangeChip, ScoreBadge } from "./SignalCard";
import { colors } from "./theme";
import type { Signal } from "./types";

type RowData = [label: string, value: string | number | null | undefined];

function Rows({ rows }: { rows: RowData[] }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
  return (
    <>
      {shown.map(([label, value], i) => (
        <View key={label} style={[styles.kv, i === shown.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={styles.k}>{label}</Text>
          <Text style={styles.v}>{String(value)}</Text>
        </View>
      ))}
    </>
  );
}

function detailRows(s: Signal): RowData[] {
  if (s.kind === "contract") {
    return [
      ["Company", s.company], ["Ticker", s.ticker], ["Award value", amountLabel(s)],
      ["Company market value", s.market_cap ? money(s.market_cap) : null],
      ["Award vs. company size", s.award_pct != null ? `${s.award_pct}%` : null],
      ["Agency", s.agency], ["Branch / office", s.sub_agency], ["Awarded", s.trade_date],
      ["Source", s.source], ["Award ID", s.award_id],
    ];
  }
  if (s.kind === "insider") {
    return [
      ["Who", s.who], ["Company", s.company], ["Role", s.role_label],
      ["Amount", amountLabel(s)], ["Shares", s.shares.toLocaleString("en-US")],
      ["Avg price", s.avg_price != null ? `$${s.avg_price.toFixed(2)}` : null],
      ["Shares after", s.shares_after?.toLocaleString("en-US")],
      ["Traded", s.trade_date], ["Disclosed", s.disclosed],
    ];
  }
  return [
    ["Who", s.who], ["Chamber", s.chamber], ["District", s.district], ["Owner", s.owner],
    ["Amount", amountLabel(s)],
    ["Asset", s.asset_type === "OP" ? "Options" : s.asset_type === "ST" ? "Stock" : s.asset_type],
    ["Traded", s.trade_date], ["Disclosed", s.disclosed], ["Days to disclose", s.lag_days],
  ];
}

function MiniList({ title, items, onOpen }: {
  title: string; items: Signal[]; onOpen: (s: Signal) => void;
}) {
  if (!items.length) return null;
  return (
    <>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.box}>
        {items.slice(0, 8).map((x, i) => (
          <Pressable key={`${x.kind}-${x.who}-${x.trade_date}-${i}`} onPress={() => onOpen(x)}
            style={[styles.mini, i === Math.min(items.length, 8) - 1 && { borderBottomWidth: 0 }]}>
            <Text style={[styles.miniScore, { color: x.score >= 70 ? colors.accent : colors.muted }]}>
              {x.score}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniHead} numberOfLines={2}>{x.headline}</Text>
              <Text style={styles.miniMeta}>{sourceFor(x)} · {x.trade_date ?? ""}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

export function SignalDetail({ signal, all, starred, onToggleStar, onOpen, onClose }: {
  signal: Signal | null; all: Signal[]; starred: boolean;
  onToggleStar: (ticker: string) => void; onOpen: (s: Signal) => void; onClose: () => void;
}) {
  const rel = signal ? related(all, signal) : { sameTicker: [], sameWho: [] };
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
              <ScrollView key={signalKey(signal)} contentContainerStyle={styles.content}>
                <View style={styles.hero}>
                  <ScoreBadge score={signal.score} size={72} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.ticker}>{signal.ticker}</Text>
                    <Text style={[styles.tag, { color: isSell(signal) ? colors.sell : colors.accent }]}>
                      {tagFor(signal)} · {sourceFor(signal)}
                    </Text>
                    <View style={{ flexDirection: "row" }}><ChangeChip signal={signal} /></View>
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

                {signal.kind === "contract" && !!signal.description && (
                  <>
                    <Text style={styles.section}>What the contract is for</Text>
                    <Text style={styles.desc}>{signal.description}</Text>
                  </>
                )}

                {signal.price_now !== undefined && (
                  <>
                    <Text style={styles.section}>Stock since then</Text>
                    <View style={styles.box}>
                      <Rows rows={[
                        [signal.kind === "insider" && signal.avg_price ? "Insider paid" : "Price then",
                          signal.price_then != null ? `$${signal.price_then.toFixed(2)}` : null],
                        [`Price ${signal.price_date ?? "now"}`,
                          signal.price_now != null ? `$${signal.price_now.toFixed(2)}` : null],
                        ["Change", changeLabel(signal)?.replace(" since", "")],
                      ]} />
                    </View>
                  </>
                )}

                <Text style={styles.section}>Details</Text>
                <View style={styles.box}><Rows rows={detailRows(signal)} /></View>

                <MiniList title={`Everything else in ${signal.ticker}`} items={rel.sameTicker} onOpen={onOpen} />
                {signal.kind !== "contract" && (
                  <MiniList title={`More from ${signal.who}`} items={rel.sameWho} onOpen={onOpen} />
                )}

                {!!signal.url && (
                  <Pressable style={styles.button} onPress={() => Linking.openURL(signal.url)}>
                    <Text style={styles.buttonText}>View original source</Text>
                  </Pressable>
                )}
                <Text style={styles.disclaimer}>
                  From public government records. For information only, not investment advice.
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
  tag: { fontSize: 13, fontWeight: "600" },
  headline: { color: colors.text, fontSize: 18, lineHeight: 25, marginTop: 16 },
  section: {
    color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.8,
    textTransform: "uppercase", marginTop: 24, marginBottom: 8,
  },
  reason: { color: colors.soft, fontSize: 15, lineHeight: 22 },
  bulletRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  desc: { color: colors.soft, fontSize: 14, lineHeight: 21 },
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
  mini: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10,
    borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  miniScore: { width: 28, fontWeight: "700", fontSize: 15, fontVariant: ["tabular-nums"] },
  miniHead: { color: colors.text, fontSize: 14, lineHeight: 19 },
  miniMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  chev: { color: colors.muted, fontSize: 22 },
  button: {
    backgroundColor: colors.text, borderRadius: 12, paddingVertical: 14,
    alignItems: "center", marginTop: 24,
  },
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: 15 },
  disclaimer: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 16 },
});
