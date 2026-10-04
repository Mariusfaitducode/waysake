import { randomUUID } from "node:crypto";

/**
 * Raccourci iPhone « Importer dans Waysake » (sans compte développeur Apple, gratuit).
 *
 * À l'installation, il demande l'adresse de la tour, le profil et le mot de passe du foyer (vide s'il n'y en a pas).
 * À chaque lancement : dates « Du » et « Au » → photos et vidéos prises entre les deux (sans captures d'écran) →
 * une session d'import sur la tour → chaque fichier envoyé avec sa date locale et son lieu (la tour ne s'en sert
 * que si le fichier n'en a pas) → l'écran de validation s'ouvre dans Safari.
 *
 * Format : plist des Raccourcis (WFWorkflowActions). Encodage vérifié sur Cherri, ScPL et des raccourcis d'Apple.
 */

const OBJ = "￼"; // place d'une variable dans un texte
type Ref = { Type: "ActionOutput"; OutputUUID: string; OutputName: string } | { Type: "Variable"; VariableName: string };
type Action = { WFWorkflowActionIdentifier: string; WFWorkflowActionParameters: Record<string, unknown> };

const out = (uuid: string, name: string): Ref => ({ Type: "ActionOutput", OutputUUID: uuid, OutputName: name });
const repeatItem: Ref = { Type: "Variable", VariableName: "Repeat Item" };
const att = (v: Ref) => ({ Value: v, WFSerializationType: "WFTextTokenAttachment" });
/** Texte mêlant des morceaux fixes et des variables. */
function text(...parts: (string | Ref)[]) {
  let string = "";
  const attachmentsByRange: Record<string, Ref> = {};
  for (const p of parts) {
    if (typeof p === "string") string += p;
    else {
      attachmentsByRange[`{${string.length}, 1}`] = p;
      string += OBJ;
    }
  }
  return { Value: { string, attachmentsByRange }, WFSerializationType: "WFTextTokenString" };
}
const dict = (items: unknown[]) => ({ Value: { WFDictionaryFieldValueItems: items }, WFSerializationType: "WFDictionaryFieldValue" });
const textItem = (key: string, ...value: (string | Ref)[]) => ({ WFItemType: 0, WFKey: text(key), WFValue: text(...value) });
const fileItem = (key: string, value: Ref) => ({ WFItemType: 5, WFKey: text(key), WFValue: { Value: value, WFSerializationType: "WFTokenAttachmentParameterState" } });
const A = (id: string, p: Record<string, unknown>): Action => ({ WFWorkflowActionIdentifier: `is.workflow.actions.${id}`, WFWorkflowActionParameters: p });
const uuid = () => randomUUID().toUpperCase();

export function buildShortcut({ url = "https://", profile = "" }: { url?: string; profile?: string } = {}) {
  const U = { url: uuid(), user: uuid(), pw: uuid(), from: uuid(), to: uuid(), photos: uuid(), count: uuid(), imp: uuid(), id: uuid(), date: uuid(), loc: uuid(), lat: uuid(), lon: uuid(), iso: uuid(), up: uuid() };
  const ifGroup = uuid();
  const loopGroup = uuid();
  const tower = out(U.url, "Adresse de la tour");
  const importId = out(U.id, "Dictionary Value");
  const headers = dict([textItem("X-Atlas-User", out(U.user, "Profil")), textItem("Authorization", "Bearer ", out(U.pw, "Mot de passe"))]);

  const actions: Action[] = [
    A("gettext", { UUID: U.url, CustomOutputName: "Adresse de la tour", WFTextActionText: "" }),
    A("gettext", { UUID: U.user, CustomOutputName: "Profil", WFTextActionText: "" }),
    A("gettext", { UUID: U.pw, CustomOutputName: "Mot de passe", WFTextActionText: "" }),
    A("ask", { UUID: U.from, WFAskActionPrompt: "Photos prises du…", WFInputType: "Date", WFAskActionDateGranularity: "Date" }),
    A("ask", { UUID: U.to, WFAskActionPrompt: "…au (inclus)", WFInputType: "Date", WFAskActionDateGranularity: "Date" }),
    A("filter.photos", {
      UUID: U.photos,
      WFContentItemFilter: {
        WFSerializationType: "WFContentPredicateTableTemplate",
        Value: {
          WFActionParameterFilterPrefix: 1, // toutes les conditions
          WFContentPredicateBoundedDate: false,
          WFActionParameterFilterTemplates: [
            { Property: "Date Taken", Operator: 1003, Removable: true, Values: { Date: att(out(U.from, "Provided Input")), AnotherDate: att(out(U.to, "Provided Input")) } },
            { Property: "Is a Screenshot", Operator: 4, Removable: true, Values: { Bool: false, Unit: 4 } },
          ],
        },
      },
      WFContentItemSortProperty: "Date Taken",
      WFContentItemSortOrder: "Oldest First",
      WFContentItemLimitEnabled: false,
    }),
    // Période vide : on le dit, et aucune session d'import n'est créée.
    A("count", { UUID: U.count, WFCountType: "Items", Input: att(out(U.photos, "Photos")) }),
    A("conditional", { GroupingIdentifier: ifGroup, WFControlFlowMode: 0, WFCondition: 4, WFNumberValue: "0", WFInput: { Type: "Variable", Variable: att(out(U.count, "Count")) } }),
    A("alert", { WFAlertActionTitle: "Aucune photo", WFAlertActionMessage: "Aucune photo ni vidéo entre ces deux dates.", WFAlertActionCancelButtonShown: false }),
    A("exit", {}),
    A("conditional", { GroupingIdentifier: ifGroup, WFControlFlowMode: 2 }),
    A("downloadurl", {
      UUID: U.imp,
      Advanced: true,
      ShowHeaders: true,
      WFURL: text(tower, "/api/imports"),
      WFHTTPMethod: "POST",
      WFHTTPBodyType: "JSON",
      WFHTTPHeaders: headers,
      WFJSONValues: dict([textItem("source", "ios-shortcut")]),
    }),
    A("getvalueforkey", { UUID: U.id, WFInput: att(out(U.imp, "Contents of URL")), WFGetDictionaryValueType: "Value", WFDictionaryKey: "id" }),
    A("repeat.each", { GroupingIdentifier: loopGroup, WFControlFlowMode: 0, UUID: uuid(), WFInput: att(out(U.photos, "Photos")) }),
    A("properties.images", { UUID: U.date, WFInput: att(repeatItem), WFContentItemPropertyName: "Date Taken" }),
    A("properties.images", { UUID: U.loc, WFInput: att(repeatItem), WFContentItemPropertyName: "Location" }),
    A("properties.locations", { UUID: U.lat, WFInput: att(out(U.loc, "Location")), WFContentItemPropertyName: "Latitude" }),
    A("properties.locations", { UUID: U.lon, WFInput: att(out(U.loc, "Location")), WFContentItemPropertyName: "Longitude" }),
    // Heure locale du téléphone, sans fuseau : la tour la lit comme « l'heure qu'il était ».
    A("format.date", { UUID: U.iso, WFDate: text(out(U.date, "Date Taken")), WFDateFormatStyle: "Custom", WFDateFormat: "Custom", WFDateFormatString: "yyyy-MM-dd'T'HH:mm:ss" }),
    A("downloadurl", {
      UUID: U.up,
      Advanced: true,
      ShowHeaders: true,
      WFURL: text(tower, "/api/media?import=", importId),
      WFHTTPMethod: "POST",
      WFHTTPBodyType: "Form",
      WFHTTPHeaders: headers,
      WFFormValues: dict([
        fileItem("file", repeatItem),
        textItem("takenAtLocal", out(U.iso, "Formatted Date")),
        textItem("lat", out(U.lat, "Latitude")),
        textItem("lon", out(U.lon, "Longitude")),
      ]),
    }),
    A("repeat.each", { GroupingIdentifier: loopGroup, WFControlFlowMode: 2, UUID: uuid() }),
    A("openurl", { WFInput: text(tower, "/import/", importId) }),
  ];

  return {
    WFWorkflowClientVersion: "2106.0.3",
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: "900",
    WFWorkflowIcon: { WFWorkflowIconStartColor: 4292093695, WFWorkflowIconGlyphNumber: 59511 },
    WFWorkflowTypes: [],
    WFWorkflowInputContentItemClasses: [],
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowHasOutputFallback: false,
    WFWorkflowHasShortcutInputVariables: false,
    WFQuickActionSurfaces: [],
    WFWorkflowImportQuestions: [
      { ActionIndex: 0, Category: "Parameter", ParameterKey: "WFTextActionText", Text: "Adresse de la tour Waysake (sans / à la fin)", DefaultValue: url },
      { ActionIndex: 1, Category: "Parameter", ParameterKey: "WFTextActionText", Text: "Ton profil Waysake (en minuscules, ex. sam)", DefaultValue: profile },
      { ActionIndex: 2, Category: "Parameter", ParameterKey: "WFTextActionText", Text: "Mot de passe du foyer (laisse vide s'il n'y en a pas)", DefaultValue: "" },
    ],
    WFWorkflowActions: actions,
  };
}
