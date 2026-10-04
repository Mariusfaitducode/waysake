import { StyleSheet, Text, View } from "react-native";
import { formatBytes, forecastText } from "../lib/estimate";
import type { Space } from "../server";
import { tr } from "../i18n";
import type { Theme } from "../theme";

/** Place sur la tour : libre, prise par Waysake, et jusqu'à quand ça tiendra au rythme actuel. */
export function SpaceCard({ t, space }: { t: Theme; space: Space | null }) {
  if (!space) return null;
  const forecast = forecastText(space.forecast, space.monthly.bytes);
  const usedRatio = space.disk.total > 0 ? 1 - space.disk.free / space.disk.total : 0;
  return (
    <View style={[s.card, { backgroundColor: t.surface, borderColor: t.hairline }]}>
      <Text style={[s.line, { color: t.ink }]}>{tr("space.free", { free: formatBytes(space.disk.free), total: formatBytes(space.disk.total) })}</Text>
      <View style={[s.track, { backgroundColor: t.hairline }]}>
        <View style={[s.bar, { backgroundColor: usedRatio > 0.9 ? t.danger : t.accent, width: `${Math.min(100, usedRatio * 100)}%` }]} />
      </View>
      <Text style={[s.small, { color: t.muted }]}>{tr("space.used", { used: formatBytes(space.used.total) })}</Text>
      {forecast && <Text style={[s.small, { color: t.muted }]}>{forecast}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  line: { fontSize: 15, fontWeight: "600" },
  small: { fontSize: 13, lineHeight: 18 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { height: "100%" },
});
