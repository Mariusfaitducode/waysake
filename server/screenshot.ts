/** Capture d'écran ? Indication du téléphone d'abord ; sinon pas d'appareil photo ET un nom parlant. */
export function isScreenshot(m: { name: string; mime: string; camera: string | null; hint?: boolean }): boolean {
  if (m.hint) return true;
  if (m.camera) return false;
  return /screenshot|capture d.?[ée]cran|bildschirmfoto|schermata|captura de pantalla/i.test(m.name);
}
