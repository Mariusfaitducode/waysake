import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useKeepAwake } from "expo-keep-awake";
import { Button } from "../components";
import { createUploadQueue, type QueueState } from "../lib/queue";
import { describeRange, presets, type Preset } from "../lib/periods";
import { describeMonths, splitKnown, type Month } from "../lib/months";
import { draftRange, initialDraft, setDraftFrom, setDraftTo, type Draft } from "../lib/range";
import { createRateMeter, diskWarning, etaSeconds, formatBytes, formatDuration } from "../lib/estimate";
import { ensurePermission, fileSize, prepare, scan, type Found } from "../media";
import { tower, type Space } from "../server";
import { loadSent, rememberSent, type Settings } from "../storage";
import { font, useTheme, type Theme } from "../theme";
import { formatNumber, formatPercent, intlTag, tr } from "../i18n";
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={step.kind === "sending" ? () => {} : onClose}>
      <SafeAreaView style={[s.screen, { backgroundColor: t.paper }]}>
        <View style={s.top}>
          <Text style={[s.title, { color: t.ink }]}>{tr(step.kind === "months" ? "months.title" : step.kind === "range" ? "range.title" : "import.title")}</Text>
          {step.kind !== "sending" && (
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={[s.link, { color: t.accent }]}>{tr("import.close")}</Text>
            </Pressable>
          )}
        </View>

        {step.kind === "permission" && <Center t={t}><ActivityIndicator color={t.accent} /></Center>}

        {step.kind === "denied" && (
          <Center t={t}>
            <Text style={[s.big, { color: t.ink }]}>{tr("import.denied.title")}</Text>
            <Text style={[s.lead, { color: t.muted }]}>{tr("import.denied.text")}</Text>
            <Button title={tr("import.openSettings")} onPress={() => Linking.openSettings()} />
          </Center>
        )}

        {step.kind === "choose" && (
          <ScrollView contentContainerStyle={s.list}>
            <Text style={[s.lead, { color: t.muted }]}>{tr("import.choose")}</Text>
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
            {step.found > 0 && <Text style={[s.lead, { color: t.ink }]}>{tr("import.found", { count: step.found })}</Text>}
          </Center>
        )}

        {step.kind === "preview" && <Preview t={t} plan={step.plan} space={space} onSend={() => send(step.plan)} onBack={back} />}

        {step.kind === "sending" && (
          <Sending t={t} settings={settings} importId={step.importId} plan={step.plan} space={space} onDone={() => onSent(step.importId)} />
        )}

        {step.kind === "error" && (
          <Center t={t}>
            <Text style={[s.big, { color: t.ink }]}>{tr("import.error.title")}</Text>
            <Text style={[s.lead, { color: t.muted }]}>{step.message}</Text>
            <Button title={tr("import.restart")} onPress={back} />
          </Center>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Card({ t, title, subtitle, accent, onPress }: { t: Theme; title: string; subtitle: string; accent?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, { backgroundColor: t.surface, borderColor: accent ? t.accent : t.hairline, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
      accessibilityRole="button"
    >
      <Text style={[s.cardTitle, { color: t.ink }]}>{title}</Text>
      <Text style={[s.cardSub, { color: t.muted }]}>{subtitle}</Text>
    </Pressable>
  );
}

function DayField({ t, label, value, onPress }: { t: Theme; label: string; value: Date; onPress: () => void }) {
  const text = new Intl.DateTimeFormat(intlTag(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(value);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} ${text}`} style={({ pressed }) => [s.card, { backgroundColor: t.surface, borderColor: t.hairline, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <Text style={[s.cardSub, { color: t.muted }]}>{label}</Text>
      <Text style={[s.cardTitle, { color: t.ink }]}>{text}</Text>
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
        <Text style={[s.big, { color: t.ink }]}>{plan.found ? tr("import.allThere", { range: plan.label }) : tr("import.none", { range: plan.label })}</Text>
        <Button title={tr("import.otherPeriod")} kind="quiet" onPress={onBack} />
      </Center>
    );
  const videos = items.filter((i) => i.mediaType === "video").length;
  const photos = items.length - videos;
  const bytes = bytesOf(items, space);
  const rate = space?.uploadRate.bytesPerSecond ?? FALLBACK_RATE;
  const warning = space ? diskWarning(bytes, space.disk.free) : null;
  return (
    <ScrollView contentContainerStyle={[s.center, { flex: undefined, flexGrow: 1 }]}>
      <Text style={[s.huge, { color: t.ink }]}>{formatNumber(items.length)}</Text>
      <Text style={[s.big, { color: t.ink }]}>
        {tr("import.toSend", {
          what:
            videos > 0
              ? tr("import.photosAndVideos", { photos: tr("count.photos", { count: photos }), videos: tr("count.videos", { count: videos }) })
              : tr("count.photos", { count: photos }),
        })}
      </Text>
      <Text style={[s.lead, { color: t.muted }]}>
        {plan.label}
        {plan.already > 0 ? `. ${tr("import.alreadyThere", { count: plan.already })}` : ""}
      </Text>
      <Text style={[s.lead, { color: t.ink }]}>{tr("import.size", { size: formatBytes(bytes), duration: formatDuration(etaSeconds(bytes, rate)) })}</Text>
      <Text style={[s.small, { color: t.muted }]}>{tr(space?.uploadRate.measured ? "import.rateMeasured" : "import.rateDefault", { rate: formatBytes(rate) })}</Text>
      {warning && (
        <Text style={[s.lead, { color: t.danger }]}>
          {warning === "full" ? tr("space.full", { missing: formatBytes(bytes - space!.disk.free) }) : tr("space.tight")}
        </Text>
      )}
      <Button title={tr("import.send")} onPress={onSend} disabled={warning === "full"} style={{ alignSelf: "stretch" }} />
      <Button title={tr("import.changePeriod")} kind="quiet" onPress={onBack} style={{ alignSelf: "stretch" }} />
      <View style={{ alignSelf: "stretch" }}>
        <SpaceCard t={t} space={space} />
      </View>
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
      <Text style={[s.huge, { color: t.ink }]}>{formatPercent(Math.min(1, ratio))}</Text>
      <View style={[s.track, { backgroundColor: t.hairline }]}>
        <View style={[s.bar, { backgroundColor: t.accent, width: `${Math.min(1, ratio) * 100}%` }]} />
      </View>
      <Text style={[s.lead, { color: t.muted }]}>
        {tr("import.progress", { done: handled, total: st.total })}
        {st.duplicates > 0 ? tr("import.duplicates", { count: st.duplicates }) : ""}
      </Text>
      <Text style={[s.lead, { color: t.muted }]}>{tr("import.sentBytes", { done: formatBytes(progress.current.bytes), total: formatBytes(totalBytes) })}</Text>
      {!finished && <Text style={[s.lead, { color: t.ink }]}>{tr("import.remaining", { duration: formatDuration(etaSeconds(left, meter.rate())) })}</Text>}
      {!finished && <Text style={[s.lead, { color: t.muted }]}>{tr("import.keepOpen")}</Text>}
      {finished && st.failed.length > 0 && (
        <>
          <Text style={[s.lead, { color: t.danger }]}>
            {tr("import.failed", { count: st.failed.length, error: st.failed[0].error })}
          </Text>
          <Button title={tr("import.retry")} onPress={() => queue.retryFailed()} style={{ alignSelf: "stretch" }} />
          <Button title={tr("import.continue")} kind="quiet" onPress={onDone} style={{ alignSelf: "stretch" }} />
        </>
      )}
    </Center>
  );
}

function Center({ t, children }: { t: Theme; children: React.ReactNode }) {
  return <View style={[s.center, { backgroundColor: t.paper }]}>{children}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  title: { fontFamily: font.sign, fontSize: 40, lineHeight: 44 },
  link: { fontSize: 17, fontWeight: "600" },
  list: { padding: 20, gap: 12 },
  lead: { fontSize: 17, lineHeight: 24, textAlign: "center" },
  small: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  card: { borderRadius: 20, borderWidth: 2, padding: 20, gap: 4 },
  cardTitle: { fontFamily: font.sign, fontSize: 28, lineHeight: 32 },
  cardSub: { fontSize: 15 },
  center: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 16 },
  big: { fontFamily: font.sign, fontSize: 30, lineHeight: 34, textAlign: "center" },
  huge: { fontFamily: font.sign, fontSize: 88, lineHeight: 92 },
  track: { alignSelf: "stretch", height: 10, borderRadius: 5, overflow: "hidden" },
  bar: { height: "100%" },
});
