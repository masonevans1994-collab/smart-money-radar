import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import {
  agencyLabel, amountLabel, isSell, KEEP_IN_MIND, money, plainSummary, related, SCORE_GUIDE,
  lastTimeDetail, lastTimeHeadline, lastTimeLines, peersFor, sectorLine, shareText, whyLine, shortDate, signalKey, sourceFor, tagFor, termsFor, tickerHelp, tierLabel, tooSoon, shortName, plainHeadline } from "./logic";
import { useEffect, useState, useMemo } from "react";
import { agencyDescription } from "./agencies";
import { CallBox } from "./CallBox";
import { type Call, type Direction } from "./game";
import { ChangeChip, ScoreBadge } from "./SignalCard";
import { Spark } from "./Spark";
import { fonts, type, type Palette, useColors } from "./theme";
import type { Signal } from "./types";

type RowData = [label: string, value: string | number | null | undefined];

function Rows({ rows }: { rows: RowData[] }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
  return (
    <View style={styles.table}>
      {shown.map(([label, value], i) => (
        <View key={label} style={[styles.kv, i === shown.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={styles.k}>{label}</Text>
          <Text style={styles.v}>{String(value)}</Text>
        </View>
      ))}
    </View>
  );
}

function detailRows(s: Signal): RowData[] {
  if (s.kind === "contract") {
    return [
      ["Company", `${s.company} (${s.ticker})`],
      ["Won by", s.who !== s.company ? s.who : null],
      ["Awarding agency", s.agency],
      ["Branch or office", s.sub_agency && s.sub_agency !== s.agency ? s.sub_agency : null],
      ["Award value", amountLabel(s)],
      ["What the whole company is worth", s.market_cap ? money(s.market_cap) : null],
      ["Deal as a share of the company", s.award_pct != null ? `${s.award_pct.toFixed(1)}%` : null],
      ["Awarded", shortDate(s.trade_date)], ["Source", sourceFor(s)], ["Award ID", s.award_id],
    ];
  }
  if (s.kind === "insider") {
    return [
      ["Who", s.who], ["Role", s.role_label], ["Company", `${s.company} (${s.ticker})`],
      ["Amount", amountLabel(s)], ["Shares", s.shares.toLocaleString("en-US")],
      ["Price paid", s.avg_price != null ? `$${s.avg_price.toFixed(2)}` : null],
      ["Shares after", s.shares_after?.toLocaleString("en-US")],
      ["Traded", shortDate(s.trade_date)], ["Disclosed", shortDate(s.disclosed)],
    ];
  }
  return [
    ["Member", s.who], ["Chamber", s.chamber], ["District", s.district], ["Owner", s.owner],
    ["Amount", amountLabel(s)],
    ["Asset", s.asset_type === "OP" ? "Options" : s.asset_type === "ST" ? "Stock" : s.asset_type],
    ["Traded", shortDate(s.trade_date)], ["Disclosed", shortDate(s.disclosed)],
    ["Days until they reported it", s.lag_days],
  ];
}

function MiniList({ title, items, onOpen }: {
  title: string; items: Signal[]; onOpen: (s: Signal) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!items.length) return null;
  const shown = items.slice(0, 8);
  return (
    <>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.table}>
        {shown.map((x, i) => (
          <Pressable key={`${signalKey(x)}-${i}`} onPress={() => onOpen(x)}
            style={[styles.mini, i === shown.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.miniAmount, x.kind === "contract" && { color: colors.gold }]}>
                {amountLabel(x)}
              </Text>
              <Text style={styles.miniHead} numberOfLines={2}>{plainHeadline(x)}</Text>
            </View>
            <ScoreBadge score={x.score} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

export function SignalDetail({ signal, all, starred, onToggleStar, onOpen, onClose, onLegal, call,
  onCall, onOpenRecord, onExplain, onAgency, onCompany, onCompare }: {
  signal: Signal | null; all: Signal[]; starred: boolean;
  onToggleStar: (ticker: string) => void; onOpen: (s: Signal) => void; onClose: () => void;
  onLegal: () => void; call?: Call; onCall: (s: Signal, d: Direction) => void; onOpenRecord: () => void;
  onExplain: (term: string) => void; onAgency: (label: string) => void; onCompany: (s: Signal) => void;
  onCompare: (items: Signal[]) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rel = signal ? related(all, signal) : { sameTicker: [], sameWho: [] };
  const [explain, setExplain] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const contract = signal?.kind === "contract";
  // Each award opens fresh: no leftover "Score?" or "Show the numbers" from the last one.
  const key = signal ? signalKey(signal) : "";
  useEffect(() => { setExplain(false); setNumbers(false); }, [key]);
  return (
    <Modal visible={!!signal} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
          {signal && (
            <>
              <View style={styles.bar}>
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                  <Text style={styles.barLink}>Done</Text>
                </Pressable>
                <View style={styles.barRight}>
                  <Pressable onPress={() => Share.share({ message: shareText(signal) }).catch(() => {})}
                    hitSlop={12} accessibilityRole="button">
                    <Text style={styles.barLink}>Share</Text>
                  </Pressable>
                  <Pressable onPress={() => onToggleStar(signal.ticker)} hitSlop={12} accessibilityRole="button">
                    <Text style={[styles.barLink, { color: colors.gold }]}>
                      {starred ? "★ Saved" : "☆ Save"}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <ScrollView key={signalKey(signal)} contentContainerStyle={styles.content}>
                {contract ? (
                  <Pressable onPress={() => onAgency(agencyLabel(signal))} hitSlop={6} accessibilityRole="button"
                    accessibilityLabel={`See all recent contracts from ${agencyLabel(signal)}`}>
                    <Text style={styles.kicker}>
                      {tagFor(signal)} from <Text style={styles.kickerLink}>{agencyLabel(signal)} ›</Text>
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.kicker}>{tagFor(signal)}</Text>
                )}
                <Text maxFontSizeMultiplier={1.3} style={[styles.heroAmount,
                  { color: contract ? colors.gold : isSell(signal) ? colors.down : colors.text }]}>
                  {amountLabel(signal)}
                </Text>
                <View style={styles.who}>
                  <Pressable style={{ flex: 1 }} onPress={() => onCompany(signal)} accessibilityRole="button"
                    accessibilityLabel={`More about ${signal.kind === "congress" ? signal.ticker : signal.company}`}>
                    <Text style={styles.company}>
                      {signal.kind === "congress" ? signal.who : signal.company}
                      {signal.kind !== "congress" ? <Text style={styles.companyLink}> ›</Text> : null}
                    </Text>
                    <Text style={styles.tickerLine}>
                      {signal.kind === "congress" && signal.company ? `${signal.company}, ${signal.ticker}` : signal.ticker}
                      {signal.kind === "insider" && signal.role_label ? `, bought by ${signal.who}` : ""}
                      {contract && signal.who !== signal.company ? `, won by ${signal.who}` : ""}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setExplain((v) => !v)} accessibilityRole="button"
                    accessibilityHint="Explains what the score means">
                    <ScoreBadge score={signal.score} size="lg" />
                    <Text style={styles.scoreHint}>{explain ? "Hide" : "Score?"}</Text>
                  </Pressable>
                </View>
                {explain && (
                  <View style={styles.guide}>
                    <Text style={styles.guideIntro}>
                      Radar scores each item from 0 to 100 by how unusual it is. The reasons below
                      add up to this item's score.
                    </Text>
                    {SCORE_GUIDE.map(([range, text]) => (
                      <View key={range} style={styles.guideRow}>
                        <Text style={styles.guideRange}>{range}</Text>
                        <Text style={styles.guideText}>{text}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.plain}>
                  {plainSummary(signal).map((p) => <Text key={p} style={styles.plainText}>{p}</Text>)}
                  {contract && agencyDescription(signal.agency, signal.sub_agency) && (
                    <Text style={styles.plainHelp}>{agencyDescription(signal.agency, signal.sub_agency)}</Text>
                  )}
                  <Text style={styles.plainHelp}>{tickerHelp(signal)}</Text>
                </View>

                {signal.spark && (
                  <View style={styles.chartBox}>
                    <View style={styles.chartHead}>
                      <Text style={styles.chartTitle}>
                        {signal.ticker} {tooSoon(signal) ? "before" : "since"} {contract ? "the award" : "the trade"}
                      </Text>
                      <ChangeChip signal={signal} big />
                    </View>
                    <View style={styles.chartRow}>
                      <Spark data={signal.spark} mark={signal.spark_mark} width={250} height={80}
                        up={(signal.change_pct ?? 0) >= 0} />
                      <View style={styles.axis}>
                        <Text style={styles.axisText}>${Math.max(...signal.spark).toFixed(2)}</Text>
                        <Text style={styles.axisText}>${Math.min(...signal.spark).toFixed(2)}</Text>
                      </View>
                    </View>
                    {sectorLine(signal) && <Text style={styles.sectorLine}>{sectorLine(signal)}</Text>}
                    <Text style={styles.chartFoot}>
                      Each bar is one day's closing price. The gold bar is {shortDate(signal.trade_date)}, when it was {contract ? "signed" : "traded"}.
                      {tooSoon(signal)
                        ? " No trading day since, so the chart ends there for now."
                        : signal.price_then != null && signal.price_now != null
                        ? ` Price then $${signal.price_then.toFixed(2)}, latest $${signal.price_now.toFixed(2)}.` : ""}
                    </Text>
                  </View>
                )}

                {contract && signal.history && lastTimeHeadline(signal) && (
                  <View style={styles.lastTime}>
                    <Text style={styles.lastTimeHead}>{lastTimeHeadline(signal)}</Text>
                    <Text style={styles.lastTimeSmall}>{lastTimeDetail(signal)}</Text>
                    {whyLine(signal) && <Text style={styles.why}>{whyLine(signal)}</Text>}
                    <Pressable onPress={() => setNumbers((v) => !v)} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.lastTimeMore}>{numbers ? "Hide the numbers" : "Show the numbers"}</Text>
                    </Pressable>
                    {numbers && (
                      <View style={{ gap: 6 }}>
                        {lastTimeLines(signal)?.map((l) => <Text key={l} style={styles.lastTimeLine}>{l}</Text>)}
                        <Text style={styles.lastTimeLine}>{signal.history.verdict}</Text>
                        <Text style={styles.lastTimeFoot}>
                          From real closing prices after this company's past awards of $25M or more,
                          compared with the S&P 500. Past moves don't predict future ones.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {contract && peersFor(all, signal).length > 0 && (
                  <Pressable style={styles.compare} onPress={() => onCompare([signal, ...peersFor(all, signal)])}
                    accessibilityRole="button">
                    <View style={{ flex: 1 }}>
                      <Text style={styles.compareTitle}>Compare with other {agencyLabel(signal)} winners</Text>
                      <Text style={styles.compareSub} numberOfLines={2}>
                        {peersFor(all, signal).map((p) => shortName(p)).join(", ")} also won from {agencyLabel(signal)} this month
                      </Text>
                    </View>
                    <Text style={styles.compareChev}>›</Text>
                  </Pressable>
                )}

                {contract && <CallBox signal={signal} call={call} onCall={(d) => onCall(signal, d)} />}

                <Text style={styles.section}>Why it scored {signal.score}: {tierLabel(signal.score).toLowerCase()}</Text>
                {signal.reasons.map((r) => (
                  <View key={r} style={styles.reasonRow}>
                    <View style={styles.reasonDot} />
                    <Text style={styles.reason}>{r}</Text>
                  </View>
                ))}

                {contract && !!signal.description && (
                  <>
                    <Text style={styles.section}>What the contract covers</Text>
                    <Text style={styles.desc}>{signal.description}</Text>
                  </>
                )}

                <Text style={styles.section}>Words used here</Text>
                <View style={styles.terms}>
                  {termsFor(signal).map((t) => (
                    <Pressable key={t} onPress={() => onExplain(t)} style={styles.termChip}
                      accessibilityRole="button" accessibilityLabel={`Explain ${t}`}>
                      <Text style={styles.termText}>{t}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.section}>Keep in mind</Text>
                <View style={styles.caution}>
                  {KEEP_IN_MIND.map((k) => <Text key={k} style={styles.cautionText}>{k}</Text>)}
                </View>

                <Text style={styles.section}>Details</Text>
                <Rows rows={detailRows(signal)} />

                <MiniList title={`More on ${shortName(signal)}`} items={rel.sameTicker} onOpen={onOpen} />
                {!contract && (
                  <MiniList title={`More from ${signal.who}`} items={rel.sameWho} onOpen={onOpen} />
                )}

                {!!signal.url && (
                  <Pressable style={styles.button} onPress={() => { onOpenRecord(); Linking.openURL(signal.url); }}
                    accessibilityRole="link">
                    <Text style={styles.buttonText}>Open the official record</Text>
                  </Pressable>
                )}
                <Text style={styles.disclaimer}>
                  From public records, which can contain errors. For information only. Not investment
                  advice, and not a recommendation to buy or sell.
                </Text>
                <Pressable onPress={onLegal} hitSlop={8} accessibilityRole="link">
                  <Text style={styles.disclaimerLink}>Disclaimers</Text>
                </Pressable>
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  barLink: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  barRight: { flexDirection: "row", gap: 22 },
  scoreHint: { ...type.small, color: colors.muted, textAlign: "center", marginTop: 4 },
  guide: { backgroundColor: colors.panel, borderRadius: 16, padding: 16, marginTop: 14, gap: 10 },
  guideIntro: { ...type.body, color: colors.soft },
  guideRow: { flexDirection: "row", gap: 12 },
  guideRange: { fontFamily: fonts.bold, fontSize: 13, color: colors.text, width: 74 },
  guideText: { ...type.small, color: colors.soft, flex: 1 },
  chartRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  axis: { justifyContent: "space-between" },
  axisText: { ...type.small, fontSize: 11, color: colors.muted, fontVariant: ["tabular-nums"] },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  kicker: { ...type.bodyStrong, color: colors.muted },
  kickerLink: { color: colors.gold },
  heroAmount: { ...type.hero, marginTop: 2, fontVariant: ["tabular-nums"] },
  who: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  company: { ...type.title, color: colors.text },
  companyLink: { color: colors.gold },
  tickerLine: { ...type.body, color: colors.soft, marginTop: 2 },
  plain: { marginTop: 18, gap: 8 },
  compare: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.panel,
    borderRadius: 16, padding: 16, marginTop: 20 },
  compareTitle: { ...type.bodyStrong, fontSize: 15, color: colors.text },
  compareSub: { ...type.small, color: colors.muted, marginTop: 2 },
  compareChev: { color: colors.gold, fontSize: 24 },
  lastTime: { backgroundColor: colors.panel, borderRadius: 16, padding: 16, marginTop: 20, gap: 8,
    borderLeftWidth: 3, borderLeftColor: colors.gold },
  lastTimeHead: { ...type.title, fontSize: 19, lineHeight: 26, color: colors.text },
  lastTimeSmall: { ...type.body, color: colors.soft },
  why: { ...type.body, fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 6 },
  lastTimeMore: { ...type.small, fontFamily: fonts.semibold, color: colors.gold, marginTop: 2 },
  lastTimeLine: { ...type.body, color: colors.soft },
  lastTimeFoot: { ...type.small, color: colors.muted },
  plainText: { ...type.lead, fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: colors.text },
  plainHelp: { ...type.small, color: colors.muted },
  terms: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  termChip: { backgroundColor: colors.panel, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  termText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.soft },
  caution: { borderLeftWidth: 3, borderLeftColor: colors.line, paddingLeft: 12, gap: 8 },
  cautionText: { ...type.body, color: colors.soft },
  chartBox: { backgroundColor: colors.panel, borderRadius: 16, padding: 16, marginTop: 20, gap: 12 },
  chartHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chartTitle: { ...type.bodyStrong, color: colors.text },
  chartFoot: { ...type.small, color: colors.muted },
  sectorLine: { ...type.body, color: colors.text },
  section: { ...type.title, fontSize: 17, color: colors.text, marginTop: 28, marginBottom: 10 },
  reasonRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  reasonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold, marginTop: 8 },
  reason: { ...type.lead, fontFamily: fonts.regular, color: colors.soft, flex: 1 },
  desc: { ...type.body, color: colors.soft },
  table: { backgroundColor: colors.panel, borderRadius: 16, paddingHorizontal: 16 },
  kv: {
    flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 12,
    borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  k: { ...type.body, color: colors.muted, flexShrink: 0, marginRight: 12 },
  v: { ...type.bodyStrong, color: colors.text, flexShrink: 1, textAlign: "right" },
  mini: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  miniAmount: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, fontVariant: ["tabular-nums"] },
  miniHead: { ...type.small, color: colors.soft, marginTop: 2 },
  button: {
    backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 28,
  },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, color: colors.onGold },
  disclaimer: { ...type.small, color: colors.muted, textAlign: "center", marginTop: 16 },
  disclaimerLink: { ...type.small, fontFamily: fonts.semibold, color: colors.soft, textAlign: "center",
    marginTop: 6, textDecorationLine: "underline" },
});
