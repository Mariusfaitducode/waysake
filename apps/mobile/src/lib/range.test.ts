import { describe, it, expect } from "vitest";
import { initialDraft, setDraftFrom, setDraftTo, draftRange } from "./range";

/**
 * Bug « impossible de choisir une période antérieure » : l'app ouvrait le sélecteur du dernier jour depuis le
 * rappel du premier, alors que la fenêtre du premier était encore attachée. Le module natif
 * (DatePickerModule.open) se contente alors de mettre à jour l'ancienne fenêtre qui se ferme et ne répond
 * jamais : le second sélecteur n'apparaît pas et rien n'est cherché. Désormais, les deux dates sont deux champs
 * distincts d'un écran de l'app ; chaque appui n'ouvre qu'un seul sélecteur.
 */
const now = new Date(2026, 9, 4, 15).getTime();

describe("choix des dates en deux champs", () => {
  it("part du début du mois précédent jusqu'à aujourd'hui", () => {
    const d = initialDraft(now);
    expect(d.from).toEqual(new Date(2026, 8, 1));
    expect(d.to.getDate()).toBe(4);
  });
  it("un premier jour très ancien reste possible et garde le dernier jour", () => {
    const d = setDraftFrom(initialDraft(now), new Date(2022, 5, 12));
    expect(d.from).toEqual(new Date(2022, 5, 12));
    expect(d.to.getMonth()).toBe(9);
    const r = draftRange(d);
    expect(new Date(r.from).getFullYear()).toBe(2022);
    expect(new Date(r.to).getHours()).toBe(23);
  });
  it("un premier jour après le dernier repousse le dernier, et inversement", () => {
    const d = setDraftFrom({ from: new Date(2026, 0, 1), to: new Date(2026, 0, 10) }, new Date(2026, 1, 1));
    expect(d.to).toEqual(new Date(2026, 1, 1));
    const e = setDraftTo({ from: new Date(2026, 5, 1), to: new Date(2026, 5, 10) }, new Date(2026, 4, 1));
    expect(e.from).toEqual(new Date(2026, 4, 1));
  });
});
