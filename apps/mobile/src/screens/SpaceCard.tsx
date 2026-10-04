import { StyleSheet, Text, View } from "react-native";
import { formatBytes, forecastText } from "../lib/estimate";
import type { Space } from "../server";
import { formatPercent, tr } from "../i18n";
import { fs, radius, tabular, type, type Theme } from "../theme";

/**
 * Place sur la tour : libre, prise par Waysake, et jusqu'à quand ça tiendra au rythme actuel. La barre montre
 * le disque entier : la part de Waysake en Encre, le reste occupé en gris ; au-delà de 90 %, la phrase passe en
 * avertissement (texte, pas seulement couleur).
 */
export function SpaceCard({ t, space }: { t: Theme; space: Space | null }) {
  if (!space) return null;
  const forecast = forecastText(space.forecast, space.monthly.bytes);
  const total = space.disk.total;
  const usedRatio = total > 0 ? 1 - space.disk.free / total : 0;
  const oursRatio = total > 0 ? Math.min(usedRatio, space.used.total / total) : 0;
  const tight = usedRatio > 0.9;
  const pct = (r: number) => `${Math.min(100, Math.max(0, r * 100))}%` as const;
  return (
    <View style={[s.card, { backgroundColor: t.surface, borderColor: t.line }]}>
      <View style={s.head}>
        <Text style={[type(fs.md, 600), tabular, { color: tight ? t.warning : t.text, flex: 1 }]}>
          {tr("space.free", { free: formatBytes(space.disk.free), total: formatBytes(total) })}
        </Text>
        <Text style={[type(fs.sm, 500), tabular, { color: t.muted }]}>{formatPercent(usedRatio)}</Text>
      </View>
      <View
        style={[s.track, { backgroundColor: t.sunken, borderColor: t.line }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(usedRatio * 100) }}
      >
        <View style={[s.fill, { width: pct(usedRatio), backgroundColor: tight ? t.warning : t.lineStrong }]} />
        <View style={[s.fill, s.ours, { width: pct(oursRatio), backgroundColor: t.accent }]} />
      </View>
      <View style={s.legend}>
        <View style={[s.key, { backgroundColor: t.accent }]} />
        <Text style={[type(fs.sm), tabular, { color: t.muted }]}>{tr("space.used", { used: formatBytes(space.used.total) })}</Text>
      </View>
      {forecast && <Text style={[type(fs.sm), { color: t.muted }]}>{forecast}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 16, gap: 10 },
  head: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  track: { height: 8, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  ours: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  legend: { flexDirection: "row", alignItems: "center", gap: 8 },
  key: { width: 8, height: 8, borderRadius: 2 },
});
