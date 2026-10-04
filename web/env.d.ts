declare module "*.css";

/** Ce que Vite remplace au build (seul BASE_URL sert : sous-chemin de la démo statique). */
interface ImportMeta {
  readonly env: { readonly BASE_URL: string };
}
