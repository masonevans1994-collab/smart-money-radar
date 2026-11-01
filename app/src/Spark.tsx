import { View } from "react-native";

import { colors } from "./theme";

/**
 * Tiny price chart drawn with plain Views (no chart library): one thin
 * column per trading day, the award/trade day marked in gold.
 */
export function Spark({ data, mark, width = 96, height = 28, up }: {
  data?: number[]; mark?: number; width?: number; height?: number; up?: boolean;
}) {
  if (!data || data.length < 3) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const gap = data.length > 40 ? 0.5 : 1;
  const bar = Math.max(1, (width - gap * (data.length - 1)) / data.length);
  const tint = up === undefined ? colors.soft : up ? colors.up : colors.down;
  return (
    <View style={{ width, height, flexDirection: "row", alignItems: "flex-end", gap }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {data.map((v, i) => {
        const h = 2 + ((v - min) / span) * (height - 2);
        const isMark = i === mark;
        const before = mark !== undefined && i < mark;
        return (
          <View key={i} style={{
            width: bar, height: isMark ? height : h, borderRadius: bar / 2,
            backgroundColor: isMark ? colors.gold : before ? colors.line : tint,
            opacity: isMark ? 1 : before ? 1 : 0.9,
          }} />
        );
      })}
    </View>
  );
}
