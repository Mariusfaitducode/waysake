import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../components";
import { byYear, lastMonths, monthLabel, monthStatus, splitKnown, toggleMonth, toggleYear, type Month, type MonthStatus } from "../lib/months";
import { countRange, scan } from "../media";
import { tower, type Space } from "../server";
import { loadSent, type Settings } from "../storage";
import { font, type Theme } from "../theme";
import { tr } from "../i18n";
import { SpaceCard } from "./SpaceCard";

type Known = { total: number; done: number };

/**
 * Quatre ans, mois par mois. D'abord le nombre d'éléments de chaque mois (MediaStore compte, rien n'est chargé),
 * puis, mois après mois en partant du plus récent, ce que Waysake a déjà : la liste du mois (noms et dates) est
 * comparée à la tour (nom + date) et au carnet de ce téléphone (ce qu'il a déjà remis).
 */
export function MonthsPicker({ t, settings, space, onBack, onPick }: { t: Theme; settings: Settings; space: Space | null; onBack: () => void; onPick: (months: Month[]) => void }) {
  const months = useMemo(() => lastMonths(Date.now()), []);
  const years = useMemo(() => byYear(months), [months]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [known, setKnown] = useState<Record<string, Known>>({});
  const [phase, setPhase] = useState<"counting" | "checking" | "done">("counting");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c: Record<string, number> = {};
      // Huit comptages à la fois : 48 requêtes MediaStore sans attendre chacune.
      for (let i = 0; i < months.length; i += 8) {
        if (cancelled) return;
        const batch = months.slice(i, i + 8);
        const n = await Promise.all(batch.map((m) => countRange(m.from, m.to)));
        batch.forEach((m, j) => (c[m.key] = n[j]));
        setCounts({ ...c });
      }
      setPhase("checking");
      const sent = await loadSent(settings.server);
      for (const m of months) {
        if (cancelled) return;
        if (!c[m.key]) continue;
        const items = await scan(m.from, m.to);
        let flags: boolean[];
        try {
          flags = await tower.known(settings, items.map((i) => ({ name: i.filename, takenAt: i.creationTime })));
        } catch {
          flags = items.map(() => false); // tour plus ancienne : on ne sait pas, on s'appuie sur le carnet du téléphone
        }
        const { already } = splitKnown(items, flags, sent);
        if (!cancelled) setKnown((k) => ({ ...k, [m.key]: { total: items.length, done: already } }));
      }
      if (!cancelled) setPhase("done");
    })().catch(() => !cancelled && setPhase("done"));
    return () => {
      cancelled = true;
    };
  }, [months, settings]);

  const status = (key: string): MonthStatus | "unknown" => {
    if (counts[key] === 0) return "empty";
    const k = known[key];
    return k ? monthStatus(k.total, k.done) : "unknown";
  };
  const remaining = (key: string) => {
    const k = known[key];
    return k ? k.total - k.done : (counts[key] ?? 0);
  };
  const chosen = months.filter((m) => selected.has(m.key));
  const toSend = chosen.reduce((n, m) => n + remaining(m.key), 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.list}>
        <SpaceCard t={t} space={space} />
        {phase !== "done" && <Text style={[s.note, { color: t.muted }]}>{tr(phase === "counting" ? "months.counting" : "months.checking")}</Text>}
        {years.map((y) => (
          <View key={y.year} style={s.year}>
            <View style={s.yearHead}>
              <Text style={[s.yearTitle, { color: t.ink }]}>{y.year}</Text>
              <Pressable onPress={() => setSelected((sel) => toggleYear(sel, y.months, status))} hitSlop={10} accessibilityRole="button">
                <Text style={[s.link, { color: t.accent }]}>{tr("months.year")}</Text>
              </Pressable>
            </View>
            {y.months.map((m) => (
              <Row key={m.key} t={t} month={m} count={counts[m.key]} status={status(m.key)} remaining={remaining(m.key)} on={selected.has(m.key)} onPress={() => setSelected((sel) => toggleMonth(sel, m, status(m.key)))} />
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={[s.footer, { borderColor: t.hairline, backgroundColor: t.paper }]}>
        <Text style={[s.note, { color: t.ink }]}>
          {tr("months.selection", { count: chosen.length })}
          {chosen.length > 0 ? ` · ${tr("months.status.partial", { count: toSend })}` : ""}
        </Text>
        <Button title={tr("months.prepare")} disabled={!chosen.length} onPress={() => onPick(chosen)} style={{ alignSelf: "stretch" }} />
        <Button title={tr("range.back")} kind="quiet" onPress={onBack} style={{ alignSelf: "stretch" }} />
      </View>
    </View>
  );
}

function Row({ t, month, count, status, remaining, on, onPress }: { t: Theme; month: Month; count: number | undefined; status: MonthStatus | "unknown"; remaining: number; on: boolean; onPress: () => void }) {
  const chip =
    status === "sent"
      ? { text: tr("months.status.sent"), color: t.accent }
      : status === "partial"
        ? { text: tr("months.status.partial", { count: remaining }), color: t.ink }
        : status === "none"
          ? { text: tr("months.status.none"), color: t.muted }
          : status === "unknown" && count
            ? { text: tr("months.status.unknown"), color: t.muted }
            : null;
  const empty = status === "empty";
  return (
    <Pressable
      onPress={onPress}
      disabled={empty}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: empty }}
      style={[s.row, { backgroundColor: t.surface, borderColor: on ? t.accent : t.hairline, opacity: empty ? 0.5 : 1 }]}
    >
      <View style={[s.box, { borderColor: on ? t.accent : t.hairline, backgroundColor: on ? t.accent : "transparent" }]}>{on && <Text style={s.tick}>✓</Text>}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.month, { color: t.ink }]}>{monthLabel(month)}</Text>
        <Text style={[s.count, { color: t.muted }]}>{count === undefined ? "…" : tr("months.items", { count })}</Text>
      </View>
      {chip && (
        <View style={[s.chip, { borderColor: status === "partial" ? t.signal : t.hairline, backgroundColor: status === "sent" ? t.hairline : "transparent" }]}>
          <Text style={[s.chipText, { color: chip.color }]}>{chip.text}</Text>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  list: { padding: 20, gap: 12, paddingBottom: 32 },
  note: { fontSize: 15, textAlign: "center" },
  year: { gap: 8 },
  yearHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 },
  yearTitle: { fontFamily: font.sign, fontSize: 32, lineHeight: 36 },
  link: { fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 12 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  tick: { color: "#fff", fontSize: 15, fontWeight: "700" },
  month: { fontFamily: font.sign, fontSize: 22, lineHeight: 26 },
  count: { fontSize: 13 },
  chip: { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 13, fontWeight: "600" },
  footer: { borderTopWidth: 1, padding: 16, gap: 8 },
});
