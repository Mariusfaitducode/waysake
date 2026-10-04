import { useEffect, useState } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SystemUI from "expo-system-ui";
import { clearSettings, loadLang, loadSettings, saveLang, type Settings } from "./src/storage";
import { SetupScreen } from "./src/screens/SetupScreen";
import { WaysakeScreen } from "./src/screens/WaysakeScreen";
import { splash, useTheme } from "./src/theme";
import { locale, setLocale, type Locale } from "./src/i18n";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const t = useTheme();
  const [settings, setSettings] = useState<Settings | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  // Langue du téléphone, sauf choix fait dans l'app. `tr` lit la langue courante : un nouveau rendu suffit.
  // Waysake (la WebView) la reçoit à son ouverture, qui suit toujours l'écran de réglages.
  const [lang, setLang] = useState<Locale | undefined>(undefined);

  useEffect(() => {
    loadSettings().then(setSettings, () => setSettings(null));
    loadLang().then(
      (l) => {
        setLocale(l);
        setLang(locale());
      },
      () => setLang(locale()),
    );
  }, []);
  // Geist est embarquée dans l'APK (greffon expo-font) : rien à charger avant d'afficher.
  const ready = settings !== undefined && lang !== undefined;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  // Fond de la fenêtre (derrière le clavier, les transitions) : celui de la page, clair ou sombre.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: splash }} />;

  const changeLang = (l: Locale) => {
    setLocale(l);
    setLang(l);
    saveLang(l).catch(() => {});
  };

  return (
    <SafeAreaProvider>
      <StatusBar style={t.dark ? "light" : "dark"} />
      {!settings || editing ? (
        <SetupScreen
          initial={settings}
          onLang={changeLang}
          onDone={(s) => {
            setSettings(s);
            setEditing(false);
          }}
        />
      ) : (
        <WaysakeScreen
          settings={settings}
          onReset={() => {
            clearSettings();
            setEditing(true);
          }}
        />
      )}
    </SafeAreaProvider>
  );
}
