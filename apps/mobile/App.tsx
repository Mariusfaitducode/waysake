import { useEffect, useState } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, BarlowCondensed_500Medium, BarlowCondensed_600SemiBold } from "@expo-google-fonts/barlow-condensed";
import { clearSettings, loadSettings, type Settings } from "./src/storage";
import { SetupScreen } from "./src/screens/SetupScreen";
import { AtlasScreen } from "./src/screens/AtlasScreen";
import { useTheme } from "./src/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const t = useTheme();
  const [fontsLoaded] = useFonts({ BarlowCondensed_500Medium, BarlowCondensed_600SemiBold });
  const [settings, setSettings] = useState<Settings | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings, () => setSettings(null));
  }, []);
  const ready = fontsLoaded && settings !== undefined;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: "#0B7A4B" }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style={t.dark ? "light" : "dark"} />
      {!settings || editing ? (
        <SetupScreen
          initial={settings}
          onDone={(s) => {
            setSettings(s);
            setEditing(false);
          }}
        />
      ) : (
        <AtlasScreen
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
