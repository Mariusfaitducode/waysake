import type { ComponentType } from "react";

/**
 * Mode démo statique (`pnpm build:demo`) : l'interface lit des réponses exportées au lieu d'interroger la tour.
 * `web/demo/runtime.ts` l'implémente ; dans le build normal, `web/demo/off.ts` le remplace (vite.config.ts) :
 * aucun code de démo n'entre dans le site de la tour.
 */
export type DemoRuntime = {
  /** Réponse d'une requête GET de l'API (mêmes types que la tour). */
  get(url: string): Promise<unknown>;
  /** Écriture : la démo n'en joue que quelques-unes (partie de « Where was it? ») ; les autres affichent un message. */
  send(method: string, url: string, body?: unknown): Promise<unknown>;
  /** Adresse statique d'une ressource servie par la tour (contour des pays, carte postale). */
  url(path: string): string;
  /** « This is a demo — install Waysake to do this. » */
  blocked(): void;
  /** Bandeau « Demo · Install Waysake » et message des actions bloquées. */
  Chrome: ComponentType;
};
