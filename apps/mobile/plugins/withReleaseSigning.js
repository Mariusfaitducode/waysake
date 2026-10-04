// Signe l'APK de production avec une clé stable (hors dépôt), fournie au build par des propriétés Gradle :
// -PATLAS_STORE_FILE=… -PATLAS_STORE_PASSWORD=… -PATLAS_KEY_ALIAS=… -PATLAS_KEY_PASSWORD=…
// Sans elles, on retombe sur la clé de debug (builds locaux). Une clé stable permet de mettre l'app
// à jour sans la désinstaller.
const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (!g.includes("ATLAS_STORE_FILE")) {
      g = g.replace(
        /signingConfigs \{\n/,
        `signingConfigs {
        release {
            if (project.hasProperty('ATLAS_STORE_FILE')) {
                storeFile file(ATLAS_STORE_FILE)
                storePassword ATLAS_STORE_PASSWORD
                keyAlias ATLAS_KEY_ALIAS
                keyPassword ATLAS_KEY_PASSWORD
            }
        }
`,
      );
      g = g.replace(
        /(release \{\n\s*\/\/ Caution![^\n]*\n[^\n]*\n\s*)signingConfig signingConfigs\.debug/,
        "$1signingConfig project.hasProperty('ATLAS_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
      );
    }
    c.modResults.contents = g;
    return c;
  });
};
