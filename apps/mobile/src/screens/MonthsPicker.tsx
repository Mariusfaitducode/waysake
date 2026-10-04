import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../components";
import { byYear, lastMonths, monthLabel, monthStatus, splitKnown, toggleMonth, toggleYear, type Month, type MonthStatus } from "../lib/months";
import { countRange, scan } from "../media";
import { tower, type Space } from "../server";
import { loadSent, type Settings } from "../storage";
import { fs, gutter, radius, tabular, type, type Theme } from "../theme";
import { tr } from "../i18n";
import { SpaceCard } from "./SpaceCard";

type Known = { total: number; done: number };
type Status = MonthStatus | "unknown";
const COLUMNS = 3;
const GAP = 8;

/**
 * Quatre ans, mois par mois, en grille (trois mois par ligne). D'abord le nombre d'éléments de chaque mois
 * (MediaStore compte, rien n'est chargé), puis, mois après mois en partant du plus récent, ce que Waysake a déjà :
 * la liste du mois (noms et dates) est comparée à la tour (nom + date) et au carnet de ce téléphone.
 *
 * L'état d'un mois se lit sans la couleur : une forme (rond plein coché, demi-rond, rond vide), un texte
 * (« Déjà envoyé », « 12 à envoyer », « Pas envoyé ») et une jauge de ce qui est déjà sur la tour.
 */
export function MonthsPicker({ t, settings, space, onBack, onPick }: { t: Theme; settings: Settings; space: Space | null; onBack: () => void; onPick: (months: Month[]) => void }) {
  const months = useMemo(() => lastMonths(Date.now()), []);
  const years = useMemo(() => byYear(months), [months]);
  // Noms des mois calculés une fois : Intl est lent sous Hermes, et la grille se redessine à chaque case cochée.
  const names = useMemo(() => Object.fromEntries(months.map((m) => [m.key, monthLabel(m)])), [months]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [known, setKnown] = useState<Record<string, Known>>({});
  const [phase, setPhase] = useState<"counting" | "checking" | "done">("counting");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(0);

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

  const status = (key: string): Status => {
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
  const tile = width > 0 ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.list}>
        <SpaceCard t={t} space={space} />
        {phase !== "done" && (
          <View style={s.progress} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={t.muted} />
            <Text style={[type(fs.sm), { color: t.muted }]}>{tr(phase === "counting" ? "months.counting" : "months.checking")}</Text>
          </View>
        )}
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 24 }}>
          {years.map((y) => (
            <View key={y.year} style={s.year}>
              <View style={[s.yearHead, { borderBottomColor: t.line }]}>
                <Text accessibilityRole="header" style={[type(fs.lg, 700, "tight"), tabular, { color: t.text }]}>
                  {y.year}
                </Text>
                <Button title={tr("months.year")} kind="quiet" small onPress={() => setSelected((sel) => toggleYear(sel, y.months, status))} />
              </View>
              {tile > 0 && (
                <View style={s.grid}>
                  {y.months.map((m) => (
                    <Tile
                      key={m.key}
                      t={t}
                      width={tile}
                      month={m}
                      name={names[m.key]}
                      count={counts[m.key]}
                      known={known[m.key]}
                      status={status(m.key)}
                      remaining={remaining(m.key)}
                      on={selected.has(m.key)}
                      onPress={() => setSelected((sel) => toggleMonth(sel, m, status(m.key)))}
                    />
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={[s.footer, { borderColor: t.line, backgroundColor: t.surface }]}>
        <Text style={[type(fs.md, 600), tabular, { color: t.text }]} accessibilityLiveRegion="polite">
          {tr("months.selection", { count: chosen.length })}
          {chosen.length > 0 ? <Text style={{ color: t.muted, fontWeight: "500" }}>{` · ${tr("months.status.partial", { count: toSend })}`}</Text> : null}
        </Text>
        <View style={s.actions}>
          <Button title={tr("range.back")} kind="quiet" onPress={onBack} style={{ flex: 1 }} />
          <Button title={tr("months.prepare")} disabled={!chosen.length} onPress={() => onPick(chosen)} style={{ flex: 2 }} />
        </View>
      </View>
    </View>
  );
}

function Tile({ t, width, month, name, count, known, status, remaining, on, onPress }: { t: Theme; width: number; month: Month; name: string; count: number | undefined; known: Known | undefined; status: Status; remaining: number; on: boolean; onPress: () => void }) {
  const empty = status === "empty";
  const label =
    status === "sent"
      ? tr("months.status.sent")
      : status === "partial"
        ? tr("months.status.partial", { count: remaining })
        : status === "none"
          ? tr("months.status.none")
          : null;
  const items = count === undefined ? "…" : tr("months.items", { count });
  // Ce qui est déjà sur la tour, en proportion (jauge sous l'état).
  const ratio = known && known.total > 0 ? known.done / known.total : 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={empty}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: empty }}
      accessibilityLabel={`${name} ${month.year}, ${items}${label ? `, ${label}` : ""}`}
      style={({ pressed }) => [
        s.tile,
        {
          width,
          backgroundColor: empty ? "transparent" : t.surface,
          borderColor: on ? t.accent : empty ? t.lineStrong : t.line,
          borderWidth: on ? 2 : 1,
          // La bordure plus épaisse ne doit pas décaler le contenu.
          padding: on ? 9 : 10,
          borderStyle: empty ? "dashed" : "solid",
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={s.tileHead}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[type(fs.md, 600, "tight"), { color: empty ? t.faint : t.text, flex: 1 }]}>
          {name}
        </Text>
        {!empty && (
          <View style={[s.box, { borderColor: on ? t.accent : t.lineStrong, backgroundColor: on ? t.accent : "transparent" }]}>
            {on && <Text style={[s.tick, { color: t.onAccent }]}>✓</Text>}
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[type(fs.xs), tabular, { color: empty ? t.faint : t.muted }]}>
        {items}
      </Text>
      {!empty && (
        <View style={s.status}>
          <StatusMark t={t} status={status} />
          <Text style={[type(fs.xs, status === "sent" ? 500 : 600), tabular, { color: status === "sent" || status === "unknown" ? t.muted : t.text, flexShrink: 1 }]}>
            {label ?? tr("months.status.unknown")}
          </Text>
        </View>
      )}
      {!empty && (
        <View style={[s.gauge, { backgroundColor: t.sunken }]}>
          <View style={{ width: `${Math.round(ratio * 100)}%`, height: "100%", backgroundColor: status === "sent" ? t.success : t.text }} />
        </View>
      )}
    </Pressable>
  );
}

// Chaque rond redonne son `borderStyle` : Android garde sinon le pointillé d'un rendu précédent.
/** Rond plein coché (envoyé), demi-rond (en partie), rond vide (pas envoyé), pointillé (on vérifie encore). */
function StatusMark({ t, status }: { t: Theme; status: Status }) {
  if (status === "sent")
    return (
      <View style={[s.mark, { backgroundColor: t.success, borderColor: t.success }]}>
        <Text style={[s.markTick, { color: t.dark ? t.bg : "#FFFFFF" }]}>✓</Text>
      </View>
    );
  if (status === "partial")
    return (
      <View style={[s.mark, { borderColor: t.text, overflow: "hidden" }]}>
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", backgroundColor: t.text }} />
      </View>
    );
  if (status === "none") return <View style={[s.mark, { borderColor: t.text }]} />;
  return <View style={[s.mark, { borderColor: t.faint, borderStyle: "dashed" }]} />;
}

const s = StyleSheet.create({
  list: { paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 32, gap: 16 },
  progress: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  year: { gap: 10 },
  yearHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: { borderRadius: radius.md, gap: 3 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  box: { width: 20, height: 20, borderRadius: radius.xs, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  tick: { fontSize: 13, lineHeight: 15, fontWeight: "700" },
  status: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: "auto", paddingTop: 6 },
  mark: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderStyle: "solid", alignItems: "center", justifyContent: "center" },
  markTick: { fontSize: 8, lineHeight: 10, fontWeight: "800" },
  gauge: { height: 3, borderRadius: 2, overflow: "hidden", marginTop: 6 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 16, gap: 12 },
  actions: { flexDirection: "row", gap: 10 },
});
