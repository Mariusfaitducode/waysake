/** Pont avec l'app Android : présent seulement quand Atlas tourne dans l'app (WebView). */
declare global {
  interface Window {
    __ATLAS_APP__?: { user: string; platform: string };
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}

export const inApp = () => typeof window !== "undefined" && !!window.ReactNativeWebView;
export const appUser = () => window.__ATLAS_APP__?.user ?? null;
export function tellApp(msg: { type: "import" | "settings" }) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
}
