import { useRef, useState } from "react";
import { BackHandler, Linking, StyleSheet, Text, View } from "react-native";
import { sameOrigin } from "../lib/origin";
import { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Button, Sign } from "../components";
import type { Settings } from "../storage";
import { font, useTheme } from "../theme";
import { locale, tr } from "../i18n";
import { ImportScreen } from "./ImportScreen";

/**
 * Atlas lui-même (l'interface web de la tour) en plein écran. L'app ajoute ce que le web ne peut pas :
 * le bouton « + » d'Atlas ouvre ici l'import natif, qui lit la photothèque avec les lieux intacts.
 */
export function AtlasScreen({ settings, onReset }: { settings: Settings; onReset: () => void }) {
  const t = useTheme();
  const web = useRef<WebView>(null);
  const [importing, setImporting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  // Le bouton retour d'Android remonte dans Atlas avant de quitter l'app.
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

  // Atlas sait qu'il tourne dans l'app, et pour qui — seulement sur les pages de la tour. Le mot de passe du
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

  if (failed)
    return (
      <SafeAreaView style={[styles.fallback, { backgroundColor: t.paper }]}>
        <Sign size={30}>Atlas</Sign>
        <Text style={[styles.title, { color: t.ink }]}>{tr("atlas.down.title")}</Text>
        <Text style={[styles.lead, { color: t.muted }]}>{tr("atlas.down.text")}{"\n"}{tr("atlas.down.address", { url: settings.server })}</Text>
        <Button title={tr("atlas.retry")} onPress={() => setFailed(false)} />
        <Button title={tr("atlas.changeAddress")} kind="quiet" onPress={onReset} />
      </SafeAreaView>
    );

  return (
    <View style={[styles.screen, { backgroundColor: t.paper }]}>
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
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
          sharedCookiesEnabled
          domStorageEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          style={{ backgroundColor: t.paper }}
        />
      </SafeAreaView>
      <ImportScreen
        settings={settings}
        visible={importing}
        onClose={() => setImporting(false)}
        onSent={(id) => {
          setImporting(false);
          // L'écran de validation d'Atlas prend le relais.
          web.current?.injectJavaScript(`window.location.assign('/import/${id}'); true;`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fallback: { flex: 1, padding: 24, paddingTop: 64, gap: 16 },
  title: { fontFamily: font.sign, fontSize: 40, lineHeight: 44, marginTop: 16 },
  lead: { fontSize: 17, lineHeight: 24 },
});
