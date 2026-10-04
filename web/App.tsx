import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { api, AUTH_EVENT, AuthRequiredError, type User } from "./api.js";
import { DataProvider } from "./data.js";
import { ProfileCtx } from "./profile.js";
import { LiveProvider } from "./live.js";
import { Games } from "./screens/Games.js";
import { GamePlay } from "./screens/GamePlay.js";
import { Slideshow } from "./screens/Slideshow.js";
import { Shell } from "./shell/Shell.js";
import { UploadProvider } from "./shell/upload.js";
import { ProfilePicker } from "./screens/ProfilePicker.js";
import { Library } from "./screens/Library.js";
import { GlobeScreen } from "./screens/Globe.js";
import { Trips } from "./screens/Trips.js";
import { TripScreen } from "./screens/Trip.js";
import { Notebook } from "./screens/Notebook.js";
import { Countries } from "./screens/Countries.js";
import { NotFound } from "./screens/NotFound.js";
import { appPassword, appUser, inApp, tellApp } from "./native.js";
import { Login } from "./screens/Login.js";
import { ImportReview } from "./screens/ImportReview.js";
import { GetApp } from "./screens/GetApp.js";
import { Locate } from "./screens/Locate.js";
import { Stats } from "./screens/Stats.js";
import { useLocale } from "./i18n/index.js";

export function App() {
  const locale = useLocale();
  const [me, setMe] = useState<User | null | undefined>(undefined);
  // La tour demande le mot de passe du foyer (WAYSAKE_PASSWORD) : écran de connexion avant le choix du profil.
  const [locked, setLocked] = useState(false);
  const starting = useRef(false);

  const start = useCallback(async () => {
    starting.current = true;
    try {
      let r: { user: User | null };
      try {
        r = await api.me();
      } catch (e) {
        // Dans l'app, le mot de passe a déjà été saisi sur le téléphone : la WebView ouvre sa session seule.
        const fromApp = appPassword();
        if (!(e instanceof AuthRequiredError) || !fromApp) throw e;
        await api.login(fromApp).catch(() => {
          throw new AuthRequiredError(); // mot de passe changé depuis : on le redemande ici
        });
        r = await api.me();
      }
      // Dans l'app, le profil a déjà été choisi sur le téléphone.
      const fromApp = appUser();
      if (!r.user && fromApp) return setMe((await api.setMe(fromApp)).user);
      setMe(r.user);
    } catch (e) {
      if (e instanceof AuthRequiredError) setLocked(true);
      else setMe(null);
    } finally {
      starting.current = false;
    }
  }, []);

  useEffect(() => {
    start();
    // Session fermée en cours de route (mot de passe changé, déconnexion ailleurs) : retour à la connexion.
    const onAuth = () => !starting.current && setLocked(true);
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [start]);
  const switchProfile = () => (inApp() ? tellApp({ type: "settings" }) : setMe(null));

  if (locked)
    return (
      <Login
        onDone={() => {
          setLocked(false);
          setMe(undefined);
          start();
        }}
      />
    );
  if (me === undefined) return null;
  if (me === null) return <ProfilePicker onPick={setMe} />;
  return (
    <ProfileCtx.Provider value={{ me, switchProfile }}>
      {/* Changer de langue remonte les écrans : chaque texte, date et nom de pays est relu dans la nouvelle langue. */}
      <DataProvider key={locale}>
        <BrowserRouter>
          <UploadProvider>
            <LiveProvider>
            <Routes>
              <Route path="v/:slug/diaporama" element={<Slideshow />} />
              <Route element={<Shell me={me} onSwitchProfile={switchProfile} />}>
                <Route index element={<GlobeScreen />} />
                <Route path="voyages" element={<Trips />} />
                <Route path="v/:slug" element={<TripScreen />} />
                <Route path="photos" element={<Library />} />
                <Route path="photos/a-localiser" element={<Locate />} />
                <Route path="carnet" element={<Notebook />} />
                <Route path="pays" element={<Countries />} />
                <Route path="import/:id" element={<ImportReview />} />
                <Route path="app" element={<GetApp />} />
                <Route path="jeu" element={<Games />} />
                <Route path="jeu/:id" element={<GamePlay />} />
                <Route path="stats" element={<Stats />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
            </LiveProvider>
          </UploadProvider>
        </BrowserRouter>
      </DataProvider>
    </ProfileCtx.Provider>
  );
}
