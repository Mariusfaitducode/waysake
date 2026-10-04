import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useKeepAwake } from "expo-keep-awake";
import { Button } from "../components";
import { createUploadQueue, type QueueState } from "../lib/queue";
import { customRange, describeRange, presets, type Preset } from "../lib/periods";
import { ensurePermission, prepare, scan, type Found } from "../media";
import { tower } from "../server";
import type { Settings } from "../storage";
import { font, useTheme, type Theme } from "../theme";
import { formatNumber, formatPercent, tr } from "../i18n";

type Step =
  | { kind: "permission" }
  | { kind: "denied" }
  | { kind: "choose" }
  | { kind: "scanning"; from: number; to: number; found: number }
  | { kind: "preview"; from: number; to: number; items: Found[] }
  | { kind: "sending"; importId: number; items: Found[] }
  | { kind: "error"; message: string };

/** Import par période : choisir, voir ce qui a été trouvé, envoyer. Le tri et la validation se font ensuite dans Waysake. */
export function ImportScreen({ settings, visible, onClose, onSent }: { settings: Settings; visible: boolean; onClose: () => void; onSent: (importId: number) => void }) {
  const t = useTheme();
  const [step, setStep] = useState<Step>({ kind: "permission" });
  const [last, setLast] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep({ kind: "permission" });
    ensurePermission().then((p) => setStep(p === "denied" ? { kind: "denied" } : { kind: "choose" }));
    tower.lastImport(settings).then((r) => setLast(r.since), () => setLast(null));
  }, [visible, settings]);

  async function run(from: number, to: number) {
    setStep({ kind: "scanning", from, to, found: 0 });
    try {
      const items = await scan(from, to, (found) => setStep({ kind: "scanning", from, to, found }));
      setStep({ kind: "preview", from, to, items });
    } catch (e) {
      setStep({ kind: "error", message: (e as Error).message });
    }
  }

  function chooseCustom() {
    const now = new Date();
    DateTimePickerAndroid.open({
      value: new Date(now.getFullYear(), now.getMonth(), 1),
      mode: "date",
      maximumDate: now,
      title: tr("import.firstDay"),
      onChange: (e, first) => {
        if (e.type !== "set" || !first) return;
        DateTimePickerAndroid.open({
          value: first,
          mode: "date",
          minimumDate: first,
          maximumDate: now,
          title: tr("import.lastDay"),
          onChange: (e2, lastDay) => {
            if (e2.type !== "set" || !lastDay) return;
            const r = customRange(first, lastDay);
            run(r.from, r.to);
          },
        });
      },
    });
  }

  async function send(items: Found[]) {
    try {
      const { id } = await tower.newImport(settings);
      setStep({ kind: "sending", importId: id, items });
    } catch (e) {
      setStep({ kind: "error", message: (e as Error).message });
    }
  }

  const pending = step.kind === "preview" ? step.items : null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={step.kind === "sending" ? () => {} : onClose}>
      <SafeAreaView style={[s.screen, { backgroundColor: t.paper }]}>
        <View style={s.top}>
          <Text style={[s.title, { color: t.ink }]}>{tr("import.title")}</Text>
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
            {presets(Date.now(), last).map((p: Preset) => (
              <Pressable
                key={p.key}
                onPress={() => (p.key === "custom" ? chooseCustom() : run(p.from!, p.to!))}
                style={({ pressed }) => [s.card, { backgroundColor: t.surface, borderColor: p.key === "since-last" ? t.accent : t.hairline, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                accessibilityRole="button"
              >
                <Text style={[s.cardTitle, { color: t.ink }]}>{p.title}</Text>
                <Text style={[s.cardSub, { color: t.muted }]}>{p.subtitle}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {step.kind === "scanning" && (
          <Center t={t}>
            <ActivityIndicator size="large" color={t.accent} />
            <Text style={[s.lead, { color: t.muted }]}>{tr("import.scanning", { range: describeRange(step.from, step.to) })}</Text>
            {step.found > 0 && <Text style={[s.lead, { color: t.ink }]}>{tr("import.found", { count: step.found })}</Text>}
          </Center>
        )}

        {step.kind === "preview" && pending && <Preview t={t} items={pending} from={step.from} to={step.to} onSend={() => send(pending)} onBack={() => setStep({ kind: "choose" })} />}

        {step.kind === "sending" && <Sending t={t} settings={settings} importId={step.importId} items={step.items} onDone={() => onSent(step.importId)} />}

        {step.kind === "error" && (
          <Center t={t}>
            <Text style={[s.big, { color: t.ink }]}>{tr("import.error.title")}</Text>
            <Text style={[s.lead, { color: t.muted }]}>{step.message}</Text>
            <Button title={tr("import.restart")} onPress={() => setStep({ kind: "choose" })} />
          </Center>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Preview({ t, items, from, to, onSend, onBack }: { t: Theme; items: Found[]; from: number; to: number; onSend: () => void; onBack: () => void }) {
  const videos = items.filter((i) => i.mediaType === "video").length;
  const photos = items.length - videos;
  if (!items.length)
    return (
      <Center t={t}>
        <Text style={[s.big, { color: t.ink }]}>{tr("import.none", { range: describeRange(from, to) })}</Text>
        <Button title={tr("import.otherPeriod")} kind="quiet" onPress={onBack} />
      </Center>
    );
  return (
    <Center t={t}>
      <Text style={[s.huge, { color: t.ink }]}>{formatNumber(items.length)}</Text>
      <Text style={[s.big, { color: t.ink }]}>
        {videos > 0
          ? tr("import.photosAndVideos", { photos: tr("count.photos", { count: photos }), videos: tr("count.videos", { count: videos }) })
          : tr("import.photosFound", { count: photos })}
      </Text>
      <Text style={[s.lead, { color: t.muted }]}>{tr("import.skipKnown", { range: describeRange(from, to) })}</Text>
      <Button
        title={tr("import.send")}
        onPress={onSend}
        style={{ alignSelf: "stretch" }}
      />
      <Button title={tr("import.changePeriod")} kind="quiet" onPress={onBack} style={{ alignSelf: "stretch" }} />
    </Center>
  );
}

function Sending({ t, settings, importId, items, onDone }: { t: Theme; settings: Settings; importId: number; items: Found[]; onDone: () => void }) {
  useKeepAwake(); // l'écran reste allumé pendant l'envoi
  const queue = useMemo(
    () =>
      createUploadQueue<Found>({
        concurrency: 3,
        upload: async (f) => {
          const { uri, fields } = await prepare(f);
          return tower.upload(settings, importId, uri, fields);
        },
      }),
    [settings, importId],
  );
  const [st, setSt] = useState<QueueState<Found>>(queue.state());
  const started = useRef(false);
  useEffect(() => {
    const off = queue.subscribe(setSt);
    if (!started.current) {
      started.current = true;
      queue.add(items);
    }
    return () => {
      off();
    };
  }, [queue, items]);

  const handled = st.done + st.failed.length;
  const finished = st.total > 0 && handled === st.total && st.active === 0;
  useEffect(() => {
    if (finished && st.failed.length === 0) onDone();
  }, [finished, st.failed.length, onDone]);

  return (
    <Center t={t}>
      <Text style={[s.huge, { color: t.ink }]}>{formatPercent(handled / Math.max(st.total, 1))}</Text>
      <View style={[s.track, { backgroundColor: t.hairline }]}>
        <View style={[s.bar, { backgroundColor: t.accent, width: `${(handled / Math.max(st.total, 1)) * 100}%` }]} />
      </View>
      <Text style={[s.lead, { color: t.muted }]}>
        {tr("import.progress", { done: handled, total: st.total })}
        {st.duplicates > 0 ? tr("import.duplicates", { count: st.duplicates }) : ""}
      </Text>
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
  card: { borderRadius: 20, borderWidth: 2, padding: 20, gap: 4 },
  cardTitle: { fontFamily: font.sign, fontSize: 28, lineHeight: 32 },
  cardSub: { fontSize: 15 },
  center: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 16 },
  big: { fontFamily: font.sign, fontSize: 30, lineHeight: 34, textAlign: "center" },
  huge: { fontFamily: font.sign, fontSize: 88, lineHeight: 92 },
  track: { alignSelf: "stretch", height: 10, borderRadius: 5, overflow: "hidden" },
  bar: { height: "100%" },
});
