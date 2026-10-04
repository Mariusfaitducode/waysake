import { describe, it, expect } from "vitest";
import { buildShortcut } from "./shortcut.js";

const ids = (s: ReturnType<typeof buildShortcut>) => s.WFWorkflowActions.map((a) => a.WFWorkflowActionIdentifier.replace("is.workflow.actions.", ""));
const params = (s: ReturnType<typeof buildShortcut>, id: string, nth = 0) =>
  s.WFWorkflowActions.filter((a) => a.WFWorkflowActionIdentifier === `is.workflow.actions.${id}`)[nth].WFWorkflowActionParameters as any;

describe("raccourci iPhone « Importer dans Atlas »", () => {
  const s = buildShortcut({ url: "https://tour.example.ts.net", profile: "sam" });

  it("enchaîne les actions prévues", () => {
    expect(ids(s)).toEqual([
      "gettext", "gettext", "gettext", // adresse, profil, mot de passe (questions à l'installation)
      "ask", "ask", // du, au
      "filter.photos",
      "count", "conditional", "alert", "exit", "conditional",
      "downloadurl", "getvalueforkey", // session d'import
      "repeat.each",
      "properties.images", "properties.images", "properties.locations", "properties.locations", "format.date",
      "downloadurl",
      "repeat.each",
      "openurl",
    ]);
  });

  it("pose les questions d'installation sur les trois premières actions, avec les valeurs proposées", () => {
    expect(s.WFWorkflowImportQuestions.map((q) => [q.ActionIndex, q.ParameterKey, q.DefaultValue])).toEqual([
      [0, "WFTextActionText", "https://tour.example.ts.net"],
      [1, "WFTextActionText", "sam"],
      [2, "WFTextActionText", ""],
    ]);
  });

  it("cherche les photos et vidéos prises entre les deux dates, sans captures d'écran", () => {
    const f = params(s, "filter.photos").WFContentItemFilter.Value;
    expect(f.WFActionParameterFilterPrefix).toBe(1);
    const [date, screenshot] = f.WFActionParameterFilterTemplates;
    expect(date).toMatchObject({ Property: "Date Taken", Operator: 1003 });
    expect(date.Values.Date.Value.OutputUUID).toBe(params(s, "ask", 0).UUID);
    expect(date.Values.AnotherDate.Value.OutputUUID).toBe(params(s, "ask", 1).UUID);
    expect(screenshot).toMatchObject({ Property: "Is a Screenshot", Operator: 4, Values: { Bool: false } });
  });

  it("envoie chaque fichier au sas, avec la date locale et le lieu, et l'identité en en-tête", () => {
    const upload = params(s, "downloadurl", 1);
    expect(upload.WFHTTPMethod).toBe("POST");
    expect(upload.WFHTTPBodyType).toBe("Form");
    const form = upload.WFFormValues.Value.WFDictionaryFieldValueItems;
    expect(form.map((i: any) => [i.WFKey.Value.string, i.WFItemType])).toEqual([
      ["file", 5],
      ["takenAtLocal", 0],
      ["lat", 0],
      ["lon", 0],
    ]);
    const headers = upload.WFHTTPHeaders.Value.WFDictionaryFieldValueItems.map((i: any) => i.WFKey.Value.string);
    expect(headers).toEqual(["X-Atlas-User", "Authorization"]);
    // L'adresse : la réponse à la 1re question, puis « /api/media?import= », puis l'identifiant de la session.
    expect(upload.WFURL.Value.string).toBe("￼/api/media?import=￼");
    expect(params(s, "format.date").WFDateFormatString).toBe("yyyy-MM-dd'T'HH:mm:ss");
  });

  it("ouvre l'écran de validation à la fin", () => {
    expect(params(s, "openurl").WFInput.Value.string).toBe("￼/import/￼");
  });

  it("chaque variable désigne une action qui existe", () => {
    const uuids = new Set(s.WFWorkflowActions.map((a) => (a.WFWorkflowActionParameters as any).UUID).filter(Boolean));
    const refs = JSON.stringify(s).match(/"OutputUUID":"[^"]+"/g) ?? [];
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) expect(uuids.has(r.slice(14, -1))).toBe(true);
  });
});
