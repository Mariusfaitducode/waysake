/** Pont avec l'app Android : présent seulement quand Atlas tourne dans l'app (WebView). */
declare global {
  interface Window {
    __ATLAS_APP__?: { user: string; platform: string; password?: string };
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}

export const inApp = () => typeof window !== "undefined" && !!window.ReactNativeWebView;
export const appUser = () => window.__ATLAS_APP__?.user ?? null;
/**
 * Mot de passe du foyer saisi dans l'app : la WebView s'en sert pour ouvrir sa propre session.
 * Lu une seule fois puis effacé, pour qu'il ne reste pas exposé aux scripts de la page.
 */
export function appPassword() {
  const bridge = window.__ATLAS_APP__;
  const password = bridge?.password || null;
  if (bridge) delete bridge.password;
  return password;
}
export function tellApp(msg: { type: "import" | "settings" }) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
}
