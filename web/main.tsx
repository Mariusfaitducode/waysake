import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Geist et Geist Mono, empaquetées par Vite (woff2 servis par la tour) : aucune police chargée depuis Internet.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles/tokens.css";
import "./styles/base.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
