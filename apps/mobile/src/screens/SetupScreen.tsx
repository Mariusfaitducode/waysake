import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, LanguageSwitch, Sign } from "../components";
import { PasswordError, tower, type Person } from "../server";
import { normalizeServer, saveSettings, type Settings } from "../storage";
import { font, useTheme } from "../theme";
import { locale, tr, type Locale } from "../i18n";

/** Premier lancement : relier le téléphone à la tour, donner le mot de passe du foyer s'il y en a un, puis dire qui l'utilise. */
export function SetupScreen({ initial, onDone, onLang }: { initial: Settings | null; onDone: (s: Settings) => void; onLang: (l: Locale) => void }) {
  const t = useTheme();
  const [address, setAddress] = useState(initial?.server.replace(/^https?:\/\//, "") ?? "");
  const [server, setServer] = useState<string | null>(null);
  // La tour est protégée (WAYSAKE_PASSWORD) : on demande le mot de passe avant les profils.
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState(initial?.password ?? "");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    const url = normalizeServer(address);
    setBusy(true);
    setError(null);
    try {
      const { auth } = await tower.health({ server: url, user: "" });
      // Les profils viennent de la tour (réglage WAYSAKE_PROFILES).
      const found = auth ? null : await tower.users({ server: url, user: "" });
      setAskPassword(!!auth);
      setPeople(found);
      setServer(url);
    } catch (e) {
      setError(`${(e as Error).message}\n${tr("setup.tried", { url })}`);
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      setPeople(await tower.users({ server: server!, user: "", password }));
    } catch (e) {
      setError(e instanceof PasswordError ? tr("setup.password.wrong") : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pick(user: Settings["user"]) {
    const s: Settings = { server: server!, user, ...(askPassword ? { password } : {}) };
    await saveSettings(s);
    onDone(s);
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.paper }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <Sign size={34}>Waysake</Sign>
            <LanguageSwitch value={locale()} onChange={onLang} />
          </View>
          {!server ? (
            <>
              <Text style={[styles.title, { color: t.ink }]}>{tr("setup.title")}</Text>
              <Text style={[styles.lead, { color: t.muted }]}>
                {tr("setup.lead")}
              </Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder={tr("setup.placeholder")}
                placeholderTextColor={t.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={connect}
                style={[styles.input, { color: t.ink, backgroundColor: t.hairline }]}
              />
              {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
              <Button title={tr("setup.connect")} onPress={connect} busy={busy} disabled={!address.trim()} />
            </>
          ) : !people ? (
            <>
              <Text style={[styles.title, { color: t.ink }]}>{tr("setup.password.title")}</Text>
              <Text style={[styles.lead, { color: t.muted }]}>{tr("setup.password.lead")}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                textContentType="password"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={unlock}
                accessibilityLabel={tr("setup.password.label")}
                style={[styles.input, { color: t.ink, backgroundColor: t.hairline }]}
              />
              {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
              <Button title={tr("setup.password.continue")} onPress={unlock} busy={busy} disabled={!password} />
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: t.ink }]}>{tr("setup.who")}</Text>
              <Text style={[styles.lead, { color: t.muted }]}>{tr("setup.remember")}</Text>
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
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
