import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { api, type User } from "./api.js";
import { DataProvider } from "./data.js";
import { ProfileCtx } from "./profile.js";
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
import { appUser, inApp, tellApp } from "./native.js";
import { ImportReview } from "./screens/ImportReview.js";
import { GetApp } from "./screens/GetApp.js";
import { Locate } from "./screens/Locate.js";

export function App() {
  const [me, setMe] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    api.me().then(
      async (r) => {
        // Dans l'app, le profil a déjà été choisi sur le téléphone.
        const fromApp = appUser();
        if (!r.user && fromApp) return setMe((await api.setMe(fromApp)).user);
        setMe(r.user);
      },
      () => setMe(null),
    );
  }, []);
  const switchProfile = () => (inApp() ? tellApp({ type: "settings" }) : setMe(null));

  if (me === undefined) return null;
  if (me === null) return <ProfilePicker onPick={setMe} />;
  return (
    <ProfileCtx.Provider value={{ me, switchProfile }}>
      <DataProvider>
        <BrowserRouter>
          <UploadProvider>
            <Routes>
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
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </UploadProvider>
        </BrowserRouter>
      </DataProvider>
    </ProfileCtx.Provider>
  );
}
