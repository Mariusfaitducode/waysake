import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Field, LanguageSwitch, Notice, Title, Wordmark } from "../components";
import { PasswordError, tower, type Person } from "../server";
import { normalizeServer, saveSettings, type Settings } from "../storage";
import { fs, gutter, radius, type, useTheme } from "../theme";
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

  /** Revenir à l'adresse (mauvaise tour, faute de frappe). */
  function changeAddress() {
    setServer(null);
    setPeople(null);
    setAskPassword(false);
    setError(null);
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <Wordmark size={32} />
            <LanguageSwitch value={locale()} onChange={onLang} />
          </View>

          {server && (
            <View style={[styles.server, { backgroundColor: t.surface, borderColor: t.line }]}>
              <View style={[styles.dot, { backgroundColor: t.success }]} />
              <Text numberOfLines={1} style={[type(fs.sm, 500), { color: t.text, flexShrink: 1 }]}>
                {server.replace(/^https?:\/\//, "")}
              </Text>
              <Button title={tr("waysake.changeAddress")} kind="plain" small onPress={changeAddress} style={{ marginLeft: "auto" }} />
            </View>
          )}

          {!server ? (
            <View style={styles.step}>
              <Title>{tr("setup.title")}</Title>
              <Text style={[type(fs.base), { color: t.muted }]}>{tr("setup.lead")}</Text>
              <Field
                label={tr("setup.address.label")}
                value={address}
                onChangeText={setAddress}
                placeholder={tr("setup.placeholder")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={connect}
              />
              {error && <Notice>{error}</Notice>}
              <Button title={tr("setup.connect")} onPress={connect} busy={busy} disabled={!address.trim()} />
            </View>
          ) : !people ? (
            <View style={styles.step}>
              <Title>{tr("setup.password.title")}</Title>
              <Text style={[type(fs.base), { color: t.muted }]}>{tr("setup.password.lead")}</Text>
              <Field
                label={tr("setup.password.label")}
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
              />
              {error && <Notice>{error}</Notice>}
              <Button title={tr("setup.password.continue")} onPress={unlock} busy={busy} disabled={!password} />
            </View>
          ) : (
            <View style={styles.step}>
              <Title>{tr("setup.who")}</Title>
              <Text style={[type(fs.base), { color: t.muted }]}>{tr("setup.remember")}</Text>
              <View style={styles.people}>
                {people.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => pick(p.id)}
                    style={({ pressed }) => [styles.person, { backgroundColor: pressed ? t.sunken : t.surface, borderColor: t.line, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                    accessibilityRole="button"
                    accessibilityLabel={p.name}
                  >
                    <View style={[styles.avatar, { backgroundColor: p.color }]}>
                      <Text style={[type(34, 600, "tight"), styles.avatarText]}>{p.name[0]}</Text>
                    </View>
                    <Text numberOfLines={1} style={[type(fs.md, 600), { color: t.text }]}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: gutter + 4, paddingTop: 20, paddingBottom: 40, gap: 28 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  step: { gap: 16, marginTop: 12 },
  server: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.full, borderWidth: 1, paddingLeft: 14, paddingRight: 4, paddingVertical: 4, minHeight: 44 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  people: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  person: { flexGrow: 1, flexBasis: "40%", alignItems: "center", gap: 12, borderRadius: radius.lg, borderWidth: 1, paddingVertical: 20, paddingHorizontal: 12 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF" },
});
