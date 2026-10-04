import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import { Button, Notice, Title } from "../components";
import { createUploadQueue, type QueueState } from "../lib/queue";
import { describeRange, presets, type Preset } from "../lib/periods";
import { describeMonths, splitKnown, type Month } from "../lib/months";
import { draftRange, initialDraft, setDraftFrom, setDraftTo, type Draft } from "../lib/range";
import { createRateMeter, diskWarning, etaSeconds, formatBytes, formatDuration } from "../lib/estimate";
import { ensurePermission, fileSize, prepare, scan, type Found } from "../media";
import { tower, type Space } from "../server";
import { loadSent, rememberSent, type Settings } from "../storage";
import { fs, gutter, radius, tabular, type, useTheme, type Theme } from "../theme";
import { formatPercent, intlTag, tr } from "../i18n";
import { MonthsPicker } from "./MonthsPicker";
import { SpaceCard } from "./SpaceCard";

/** Un élément à envoyer, avec la taille du fichier quand le téléphone la connaît. */
type Item = Found & { size: number | null };
type Plan = { label: string; found: number; already: number; items: Item[] };
type Phase = "scan" | "check" | "size";

type Step =
  | { kind: "permission" }
  | { kind: "denied" }
  | { kind: "choose" }
  | { kind: "range" }
  | { kind: "months" }
  | { kind: "scanning"; label: string; phase: Phase; found: number }
  | { kind: "preview"; plan: Plan }
  | { kind: "sending"; importId: number; plan: Plan }
  | { kind: "error"; message: string };

/** Débit par défaut si la tour ne le connaît pas (version plus ancienne) : prudent, ≈ 8 Mbit/s. */
const FALLBACK_RATE = 1_000_000;
const NO_AVERAGE = { photo: 4_000_000, video: 60_000_000 };

/** Import : choisir (période, dates ou mois), voir ce qui reste à envoyer, sa taille et sa durée, envoyer. */
export function ImportScreen({ settings, visible, onClose, onSent }: { settings: Settings; visible: boolean; onClose: () => void; onSent: (importId: number) => void }) {
  const t = useTheme();
  // Retraits lus dans l'écran parent (déjà mesurés) : la fenêtre de la Modal, elle, ne les connaît qu'après coup,
  // et le titre passerait d'abord sous la barre d'état.
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>({ kind: "permission" });
  const [last, setLast] = useState<number | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(Date.now()));

  useEffect(() => {
    if (!visible) return;
    setStep({ kind: "permission" });
    ensurePermission().then((p) => setStep(p === "denied" ? { kind: "denied" } : { kind: "choose" }));
    tower.lastImport(settings).then((r) => setLast(r.since), () => setLast(null));
    tower.space(settings).then(setSpace, () => setSpace(null));
  }, [visible, settings]);

  /** Liste les éléments des intervalles, écarte ce que Waysake a déjà, mesure ce qui reste. */
  async function run(ranges: { from: number; to: number }[], label: string) {
    const show = (phase: Phase, found: number) => setStep({ kind: "scanning", label, phase, found });
    show("scan", 0);
    try {
      const found: Found[] = [];
      for (const r of ranges) found.push(...(await scan(r.from, r.to, (n) => show("scan", found.length + n))));
      show("check", found.length);
      const sent = await loadSent(settings.server);
      let flags: boolean[];
      try {
        flags = await tower.known(settings, found.map((f) => ({ name: f.filename, takenAt: f.creationTime })));
      } catch {
        flags = found.map(() => false); // tour plus ancienne : elle ignorera elle-même les doublons à l'envoi
      }
      const { toSend, already } = splitKnown(found, flags, sent);
      show("size", found.length);
      const items: Item[] = [];
      for (let i = 0; i < toSend.length; i++) {
        items.push({ ...toSend[i], size: fileSize(toSend[i].uri) });
        if (i % 200 === 199) await new Promise((r) => setTimeout(r, 0)); // laisse respirer l'écran
      }
      setStep({ kind: "preview", plan: { label, found: found.length, already, items } });
    } catch (e) {
      setStep({ kind: "error", message: (e as Error).message });
    }
  }

  /** Un seul sélecteur natif à la fois : jamais ouvert depuis le rappel d'un autre (voir lib/range.ts). */
  function pickDay(which: "from" | "to") {
    DateTimePickerAndroid.open({
      value: draft[which],
      mode: "date",
      maximumDate: new Date(),
      // Pas de `title` : le sélecteur Android par défaut ne l'affiche pas ; le champ Du / Au dit de quel jour il s'agit.
      onValueChange: (_e, d) => setDraft((cur) => (which === "from" ? setDraftFrom(cur, d) : setDraftTo(cur, d))),
      onDismiss: () => {},
    });
  }

  async function send(plan: Plan) {
    try {
      const { id } = await tower.newImport(settings);
      setStep({ kind: "sending", importId: id, plan });
    } catch (e) {
      setStep({ kind: "error", message: (e as Error).message });
    }
  }

  const back = () => setStep({ kind: "choose" });
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={step.kind === "sending" ? () => {} : onClose}
    >
      {/* Fenêtre à part : elle reprend le style de la barre d'état, sinon icônes blanches sur fond clair. */}
      <StatusBar style={t.dark ? "light" : "dark"} />
      <View style={[s.screen, { backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <View style={s.top}>
          <View style={{ flex: 1 }}>
            <Title>{tr(step.kind === "months" ? "months.title" : step.kind === "range" ? "range.title" : "import.title")}</Title>
          </View>
          {step.kind !== "sending" && <Button title={tr("import.close")} kind="quiet" small onPress={onClose} />}
        </View>

        {step.kind === "permission" && <Center t={t}><ActivityIndicator color={t.accent} /></Center>}

        {step.kind === "denied" && (
          <Center t={t}>
            <Text style={[s.big, { color: t.text }]}>{tr("import.denied.title")}</Text>
            <Text style={[s.lead, { color: t.muted }]}>{tr("import.denied.text")}</Text>
            <Button title={tr("import.openSettings")} onPress={() => Linking.openSettings()} />
          </Center>
        )}

        {step.kind === "choose" && (
          <ScrollView contentContainerStyle={s.list}>
            <Text style={[s.body, { color: t.muted }]}>{tr("import.choose")}</Text>
            {presets(Date.now(), last).map((p: Preset) =>
              p.key === "custom" ? null : <Card key={p.key} t={t} title={p.title} subtitle={p.subtitle} accent={p.key === "since-last"} onPress={() => run([{ from: p.from!, to: p.to! }], describeRange(p.from!, p.to!))} />,
            )}
            <Card t={t} title={tr("period.months")} subtitle={tr("period.months.sub")} onPress={() => setStep({ kind: "months" })} />
            <Card t={t} title={tr("period.custom")} subtitle={tr("period.custom.sub")} onPress={() => setStep({ kind: "range" })} />
            <SpaceCard t={t} space={space} />
          </ScrollView>
        )}

        {step.kind === "range" && (
          <ScrollView contentContainerStyle={s.list}>
            <DayField t={t} label={tr("range.from")} value={draft.from} onPress={() => pickDay("from")} />
            <DayField t={t} label={tr("range.to")} value={draft.to} onPress={() => pickDay("to")} />
            <Button
              title={tr("range.search")}
              onPress={() => {
                const r = draftRange(draft);
                run([r], describeRange(r.from, r.to));
              }}
            />
            <Button title={tr("range.back")} kind="quiet" onPress={back} />
          </ScrollView>
        )}

        {step.kind === "months" && (
          <MonthsPicker t={t} settings={settings} space={space} onBack={back} onPick={(months: Month[]) => run(months, describeMonths(months))} />
        )}

        {step.kind === "scanning" && (
          <Center t={t}>
            <ActivityIndicator size="large" color={t.accent} />
            <Text style={[s.lead, { color: t.muted }]}>
              {step.phase === "scan" ? tr("import.scanning", { range: step.label }) : tr(step.phase === "check" ? "import.checking" : "import.measuring")}
            </Text>
            {step.found > 0 && <Text style={[s.lead, { color: t.text }]}>{tr("import.found", { count: step.found })}</Text>}
          </Center>
        )}

        {step.kind === "preview" && <Preview t={t} plan={step.plan} space={space} onSend={() => send(step.plan)} onBack={back} />}

        {step.kind === "sending" && (
          <Sending t={t} settings={settings} importId={step.importId} plan={step.plan} space={space} onDone={() => onSent(step.importId)} />
        )}

        {step.kind === "error" && (
          <Center t={t}>
            <Text style={[s.big, { color: t.text }]}>{tr("import.error.title")}</Text>
            <Text style={[s.lead, { color: t.muted }]}>{step.message}</Text>
            <Button title={tr("import.restart")} onPress={back} />
          </Center>
        )}
      </View>
    </Modal>
  );
}

/** Une période proposée : titre, précision, chevron. `accent` (depuis le dernier import) : contour Encre. */
function Card({ t, title, subtitle, accent, onPress }: { t: Theme; title: string; subtitle: string; accent?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: pressed ? t.sunken : t.surface, borderColor: accent ? t.accent : t.line, borderWidth: accent ? 1.5 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.cardTitle, { color: t.text }]}>{title}</Text>
        <Text style={[s.cardSub, { color: t.muted }]}>{subtitle}</Text>
      </View>
      <Text style={[s.chevron, { color: t.faint }]}>›</Text>
    </Pressable>
  );
}

function DayField({ t, label, value, onPress }: { t: Theme; label: string; value: Date; onPress: () => void }) {
  const text = new Intl.DateTimeFormat(intlTag(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(value);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${text}`}
      style={({ pressed }) => [s.card, { backgroundColor: pressed ? t.sunken : t.surface, borderColor: t.line, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
    >
      <Text style={[s.dayLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[s.cardTitle, { color: t.text, flex: 1 }]}>{text.charAt(0).toUpperCase() + text.slice(1)}</Text>
      <Text style={[s.chevron, { color: t.faint }]}>›</Text>
    </Pressable>
  );
}

const average = (space: Space | null) => (space && space.average.photo > 0 ? { photo: space.average.photo, video: space.average.video || NO_AVERAGE.video } : NO_AVERAGE);
const bytesOf = (items: Item[], space: Space | null) => items.reduce((n, i) => n + (i.size ?? average(space)[i.mediaType]), 0);

function Preview({ t, plan, space, onSend, onBack }: { t: Theme; plan: Plan; space: Space | null; onSend: () => void; onBack: () => void }) {
  const items = plan.items;
  if (!plan.found || !items.length)
    return (
      <Center t={t}>
        <Text style={[s.big, { color: t.text }]}>{plan.found ? tr("import.allThere", { range: plan.label }) : tr("import.none", { range: plan.label })}</Text>
        <Button title={tr("import.otherPeriod")} kind="quiet" onPress={onBack} />
      </Center>
    );
  const videos = items.filter((i) => i.mediaType === "video").length;
  const photos = items.length - videos;
  const bytes = bytesOf(items, space);
  const rate = space?.uploadRate.bytesPerSecond ?? FALLBACK_RATE;
  const warning = space ? diskWarning(bytes, space.disk.free) : null;
  return (
    <ScrollView contentContainerStyle={s.list}>
      <View style={s.hero}>
        <Text style={[s.eyebrow, { color: t.muted }]}>{plan.label.charAt(0).toUpperCase() + plan.label.slice(1)}</Text>
        {/* Le nombre est dans la phrase (« 16 photos à envoyer ») : en grand titre, sans le répéter au-dessus. */}
        <Text accessibilityRole="header" style={[s.headline, { color: t.text }]}>
          {tr("import.toSend", {
            what:
              videos > 0
                ? tr("import.photosAndVideos", { photos: tr("count.photos", { count: photos }), videos: tr("count.videos", { count: videos }) })
                : tr("count.photos", { count: photos }),
          })}
        </Text>
        {plan.already > 0 && <Text style={[s.body, { color: t.muted }]}>{tr("import.alreadyThere", { count: plan.already })}</Text>}
      </View>
      <View style={[s.facts, { backgroundColor: t.surface, borderColor: t.line }]}>
        <Text style={[s.fact, { color: t.text }]}>{tr("import.size", { size: formatBytes(bytes), duration: formatDuration(etaSeconds(bytes, rate)) })}</Text>
        <Text style={[s.small, { color: t.muted, textAlign: "left" }]}>{tr(space?.uploadRate.measured ? "import.rateMeasured" : "import.rateDefault", { rate: formatBytes(rate) })}</Text>
      </View>
      {warning && (
        <Notice kind={warning === "full" ? "danger" : "warning"}>
          {warning === "full" ? tr("space.full", { missing: formatBytes(bytes - space!.disk.free) }) : tr("space.tight")}
        </Notice>
      )}
      <Button title={tr("import.send")} onPress={onSend} disabled={warning === "full"} />
      <Button title={tr("import.changePeriod")} kind="quiet" onPress={onBack} />
      <SpaceCard t={t} space={space} />
    </ScrollView>
  );
}

function Sending({ t, settings, importId, plan, space, onDone }: { t: Theme; settings: Settings; importId: number; plan: Plan; space: Space | null; onDone: () => void }) {
  useKeepAwake(); // l'écran reste allumé pendant l'envoi
  const totalBytes = useMemo(() => bytesOf(plan.items, space), [plan, space]);
  const meter = useMemo(() => createRateMeter(space?.uploadRate.bytesPerSecond ?? FALLBACK_RATE), [space]);
  const progress = useRef({ bytes: 0, sent: [] as string[], reported: false });
  const [, tick] = useState(0);
  const queue = useMemo(
    () =>
      createUploadQueue<Item>({
        concurrency: 3,
        upload: async (f) => {
          const { uri, fields } = await prepare(f);
          const r = await tower.upload(settings, importId, uri, fields);
          const size = f.size ?? average(space)[f.mediaType];
          meter.add(size);
          progress.current.bytes += size;
          progress.current.sent.push(f.id);
          return r;
        },
      }),
    [settings, importId, meter, space],
  );
  const [st, setSt] = useState<QueueState<Item>>(queue.state());
  const started = useRef(false);
  useEffect(() => {
    const off = queue.subscribe(setSt);
    if (!started.current) {
      started.current = true;
      queue.add(plan.items);
    }
    return () => {
      off();
    };
  }, [queue, plan]);
  // Le temps restant se recalcule aussi entre deux fichiers (une vidéo peut être longue).
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const handled = st.done + st.failed.length;
  const finished = st.total > 0 && handled === st.total && st.active === 0;
  useEffect(() => {
    if (!finished) return;
    const p = progress.current;
    if (!p.reported) {
      p.reported = true;
      const sample = meter.sample();
      // La tour garde la moyenne glissante ; la mesure doit durer au moins une seconde.
      if (sample.ms >= 1000 && sample.bytes >= 100_000) tower.uploadRate(settings, sample.bytes, sample.ms).catch(() => {});
    }
    // Après « Réessayer », seuls les nouveaux envois réussis s'ajoutent au carnet.
    rememberSent(settings.server, p.sent.splice(0)).catch(() => {});
    if (st.failed.length === 0) onDone();
  }, [finished, st.failed.length, onDone, meter, settings]);

  const left = Math.max(0, totalBytes - progress.current.bytes);
  const ratio = totalBytes > 0 ? progress.current.bytes / totalBytes : handled / Math.max(st.total, 1);
  return (
    <Center t={t}>
      <Text style={[s.huge, { color: t.text }]} accessibilityLiveRegion="polite">
        {formatPercent(Math.min(1, ratio))}
      </Text>
      <View
        style={[s.track, { backgroundColor: t.sunken, borderColor: t.line }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(1, ratio) * 100) }}
      >
        <View style={[s.bar, { backgroundColor: t.accent, width: `${Math.min(1, ratio) * 100}%` }]} />
      </View>
      <View style={s.row}>
        <Text style={[s.small, { color: t.muted, textAlign: "left", flex: 1 }]}>
          {tr("import.progress", { done: handled, total: st.total })}
          {st.duplicates > 0 ? tr("import.duplicates", { count: st.duplicates }) : ""}
        </Text>
        <Text style={[s.small, { color: t.muted, textAlign: "right" }]}>{tr("import.sentBytes", { done: formatBytes(progress.current.bytes), total: formatBytes(totalBytes) })}</Text>
      </View>
      {!finished && <Text style={[s.fact, { color: t.text }]}>{tr("import.remaining", { duration: formatDuration(etaSeconds(left, meter.rate())) })}</Text>}
      {!finished && <Text style={[s.lead, { color: t.muted }]}>{tr("import.keepOpen")}</Text>}
      {finished && st.failed.length > 0 && (
        <>
          <View style={{ alignSelf: "stretch" }}>
            <Notice>{tr("import.failed", { count: st.failed.length, error: st.failed[0].error })}</Notice>
          </View>
          <Button title={tr("import.retry")} onPress={() => queue.retryFailed()} style={{ alignSelf: "stretch" }} />
          <Button title={tr("import.continue")} kind="quiet" onPress={onDone} style={{ alignSelf: "stretch" }} />
        </>
      )}
    </Center>
  );
}

function Center({ t, children }: { t: Theme; children: React.ReactNode }) {
  return <View style={[s.center, { backgroundColor: t.bg }]}>{children}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 8 },
  list: { paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 32, gap: 10 },
  body: { ...type(fs.base), marginBottom: 6 },
  lead: { ...type(fs.base), textAlign: "center" },
  small: { ...type(fs.sm), ...tabular, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 18, minHeight: 72 },
  cardTitle: type(17, 600, "tight"),
  cardSub: type(fs.sm),
  dayLabel: { ...type(fs.sm, 500), width: 32 },
  chevron: { fontSize: 26, lineHeight: 28, fontWeight: "300" },
  center: { flex: 1, paddingHorizontal: gutter + 8, alignItems: "center", justifyContent: "center", gap: 14 },
  hero: { gap: 2, paddingTop: 8, paddingBottom: 10 },
  eyebrow: type(fs.sm, 500),
  big: { ...type(fs.xl, 600, "tight"), textAlign: "center" },
  headline: { ...type(fs.xxxl, 700, "tighter"), ...tabular, marginTop: 4 },
  huge: { ...type(fs.display, 700, "tighter"), ...tabular, lineHeight: Math.round(fs.display * 1.05) },
  facts: { borderRadius: radius.lg, borderWidth: 1, padding: 16, gap: 4 },
  fact: { ...type(fs.lg, 600, "tight"), ...tabular },
  row: { flexDirection: "row", alignSelf: "stretch", gap: 12 },
  track: { alignSelf: "stretch", height: 8, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 4 },
});
