import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Sign } from "../components";
import { tower, type Person } from "../server";
import { normalizeServer, saveSettings, type Settings } from "../storage";
import { font, useTheme } from "../theme";

/** Premier lancement : relier le téléphone à la tour, puis dire qui l'utilise. */
export function SetupScreen({ initial, onDone }: { initial: Settings | null; onDone: (s: Settings) => void }) {
  const t = useTheme();
  const [address, setAddress] = useState(initial?.server.replace(/^https?:\/\//, "") ?? "");
  const [server, setServer] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    const url = normalizeServer(address);
    setBusy(true);
    setError(null);
    try {
      // Les profils viennent de la tour (réglage ATLAS_PROFILES).
      setPeople(await tower.users({ server: url, user: "" }));
      setServer(url);
    } catch (e) {
      setError(`${(e as Error).message}\nAdresse essayée : ${url}`);
    } finally {
      setBusy(false);
    }
  }

  async function pick(user: Settings["user"]) {
    const s = { server: server!, user };
    await saveSettings(s);
    onDone(s);
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.paper }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Sign size={34}>Atlas</Sign>
          {!server ? (
            <>
              <Text style={[styles.title, { color: t.ink }]}>Relie ton téléphone à la tour</Text>
              <Text style={[styles.lead, { color: t.muted }]}>
                Tape l'adresse affichée par Atlas sur l'ordinateur (page « App »). Tailscale doit être activé sur ce téléphone.
              </Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="tour.tail1234.ts.net"
                placeholderTextColor={t.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={connect}
                style={[styles.input, { color: t.ink, backgroundColor: t.hairline }]}
              />
              {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
              <Button title="Se connecter" onPress={connect} busy={busy} disabled={!address.trim()} />
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: t.ink }]}>Qui es-tu ?</Text>
              <Text style={[styles.lead, { color: t.muted }]}>Atlas s'en souviendra sur ce téléphone.</Text>
              <View style={styles.people}>
                {people.map((p) => (
                  <Pressable key={p.id} onPress={() => pick(p.id)} style={({ pressed }) => [styles.person, { transform: [{ scale: pressed ? 0.96 : 1 }] }]} accessibilityRole="button" accessibilityLabel={p.name}>
                    <View style={[styles.avatar, { backgroundColor: p.color }]}>
                      <Text style={styles.avatarText}>{p.name[0]}</Text>
                    </View>
                    <Text style={[styles.personName, { color: t.ink }]}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 24, paddingTop: 48, gap: 16 },
  title: { fontFamily: font.sign, fontSize: 44, lineHeight: 46, marginTop: 24 },
  lead: { fontSize: 17, lineHeight: 24 },
  input: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, fontSize: 18 },
  error: { fontSize: 15, lineHeight: 21 },
  people: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 36, marginTop: 28 },
  person: { alignItems: "center", gap: 12 },
  avatar: { width: 124, height: 124, borderRadius: 62, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: font.sign, fontSize: 60, lineHeight: 70 },
  personName: { fontSize: 19, fontWeight: "600" },
});
