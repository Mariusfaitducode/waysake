/** Pont avec l'app Android : présent seulement quand Waysake tourne dans l'app (WebView). */
declare global {
  interface Window {
    /** `lang` : langue choisie dans l'app (celle du téléphone par défaut), « fr » ou « en ». */
    __ATLAS_APP__?: { user: string; platform: string; lang?: string; password?: string };
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
