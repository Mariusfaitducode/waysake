import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, BackHandler, Linking, StyleSheet, Text, View } from "react-native";
import { sameOrigin } from "../lib/origin";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Button, Logo, Title, Wordmark } from "../components";
import type { Settings } from "../storage";
import { fs, gutter, radius, type, useTheme } from "../theme";
import { locale, tr } from "../i18n";
import { ImportScreen } from "./ImportScreen";

/**
 * Waysake lui-même (l'interface web de la tour) en plein écran. L'app ajoute ce que le web ne peut pas :
 * le bouton « + » de Waysake ouvre ici l'import natif, qui lit la photothèque avec les lieux intacts.
 */
export function WaysakeScreen({ settings, onReset }: { settings: Settings; onReset: () => void }) {
  const t = useTheme();
  const web = useRef<WebView>(null);
  const [importing, setImporting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  // Premier chargement : le logo sur le fond de la page, puis fondu vers Waysake (pas d'éclair blanc).
  const [loaded, setLoaded] = useState(false);
  const cover = useRef(new Animated.Value(1)).current;
  const [covered, setCovered] = useState(true);
  // Chargements suivants : un filet Encre en haut, à la manière d'un navigateur.
  const [progress, setProgress] = useState(1);

  // Le bouton retour d'Android remonte dans Waysake avant de quitter l'app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Waysake sait qu'il tourne dans l'app, et pour qui — seulement sur les pages de la tour. Le mot de passe du
  // foyer lui permet d'ouvrir sa session (cookie) sans le redemander : la WebView n'envoie pas d'en-tête
  // Authorization sur les images ni les appels de la page.
  const origin = new URL(settings.server).origin;
  const bridge = `if (location.origin === ${JSON.stringify(origin)}) { window.__ATLAS_APP__ = ${JSON.stringify({ user: settings.user, platform: "android", lang: locale(), password: settings.password })}; } true;`;

  function onMessage(e: WebViewMessageEvent) {
    // Seule la tour peut demander un import ou les réglages.
    if (!sameOrigin(settings.server, e.nativeEvent.url)) return;
    let msg: { type?: string } = {};
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {}
    if (msg.type === "import") setImporting(true);
    if (msg.type === "settings") onReset();
  }

  function firstLoadDone() {
    if (loaded) return;
    setLoaded(true);
    Animated.timing(cover, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => setCovered(false));
  }

  if (failed)
    return (
      <SafeAreaView style={[styles.fallback, { backgroundColor: t.bg }]}>
        <Wordmark size={30} />
        <View style={styles.fallbackBody}>
          <Title>{tr("waysake.down.title")}</Title>
          <Text style={[type(fs.base), { color: t.muted }]}>{tr("waysake.down.text")}</Text>
          <View style={[styles.address, { backgroundColor: t.surface, borderColor: t.line }]}>
            <View style={[styles.dot, { borderColor: t.danger }]} />
            <Text numberOfLines={2} style={[type(fs.sm, 500), { color: t.text, flexShrink: 1 }]}>
              {tr("waysake.down.address", { url: settings.server })}
            </Text>
          </View>
        </View>
        <View style={styles.fallbackActions}>
          <Button
            title={tr("waysake.retry")}
            onPress={() => {
              setLoaded(false);
              cover.setValue(1);
              setCovered(true);
              setFailed(false);
            }}
          />
          <Button title={tr("waysake.changeAddress")} kind="quiet" onPress={onReset} />
        </View>
      </SafeAreaView>
    );

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      {/* Les quatre bords : Android dessine sous la barre de gestes (bord à bord) et la WebView n'y voit pas
          env(safe-area-inset-bottom) ; sans ce retrait, les onglets de Waysake passent sous la barre. */}
      <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
        <WebView
          ref={web}
          source={{ uri: settings.server }}
          injectedJavaScriptBeforeContentLoaded={bridge}
          onMessage={onMessage}
          originWhitelist={[origin]}
          // La WebView ne quitte jamais la tour : un lien externe (crédits de carte…) s'ouvre dans le navigateur.
          onShouldStartLoadWithRequest={(req) => {
            if (sameOrigin(settings.server, req.url) || req.url === "about:blank") return true;
            if (/^https?:/.test(req.url)) Linking.openURL(req.url);
            return false;
          }}
          onError={() => setFailed(true)}
          onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setFailed(true)}
          onNavigationStateChange={(n) => setCanGoBack(n.canGoBack)}
          onLoadProgress={(e) => setProgress(e.nativeEvent.progress)}
          onLoadEnd={firstLoadDone}
          sharedCookiesEnabled
          domStorageEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          style={{ backgroundColor: t.bg }}
        />
        {loaded && progress < 1 && (
          <View pointerEvents="none" style={styles.progressTrack}>
            <View style={[styles.progressBar, { backgroundColor: t.accent, width: `${Math.max(8, progress * 100)}%` }]} />
          </View>
        )}
        {covered && (
          <Animated.View pointerEvents={loaded ? "none" : "auto"} style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: t.bg, opacity: cover }]}>
            <Logo size={56} label="Waysake" />
            <ActivityIndicator color={t.muted} />
          </Animated.View>
        )}
      </SafeAreaView>
      <ImportScreen
        settings={settings}
        visible={importing}
        onClose={() => setImporting(false)}
        onSent={(id) => {
          setImporting(false);
          // L'écran de validation de Waysake prend le relais.
          web.current?.injectJavaScript(`window.location.assign('/import/${id}'); true;`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  cover: { alignItems: "center", justifyContent: "center", gap: 20 },
  progressTrack: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  progressBar: { height: 2, borderTopRightRadius: 1, borderBottomRightRadius: 1 },
  fallback: { flex: 1, paddingHorizontal: gutter + 4, paddingTop: 20, paddingBottom: 24 },
  fallbackBody: { flex: 1, justifyContent: "center", gap: 14 },
  fallbackActions: { gap: 10 },
  address: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
