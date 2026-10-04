import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { font, useTheme } from "./theme";
import { tr, type Locale } from "./i18n";

/** Le panneau vert de Waysake, liseré blanc. */
export function Sign({ children, size = 30 }: { children: ReactNode; size?: number }) {
  const t = useTheme();
  return (
    <View style={[styles.sign, { backgroundColor: t.accent, borderRadius: size * 0.33, padding: size * 0.13 }]}>
      <View style={[styles.signInner, { borderRadius: size * 0.23, paddingHorizontal: size * 0.5 }]}>
        <Text style={{ color: "#fff", fontFamily: font.sign, fontSize: size, lineHeight: size * 1.15 }}>{children}</Text>
      </View>
    </View>
  );
}

export function Button({ title, onPress, kind = "primary", disabled, busy, style }: { title: string; onPress: () => void; kind?: "primary" | "quiet"; disabled?: boolean; busy?: boolean; style?: ViewStyle }) {
  const t = useTheme();
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? t.accent : "transparent", borderColor: primary ? t.accent : t.hairline, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? "#fff" : t.ink} /> : <Text style={[styles.buttonText, { color: primary ? "#fff" : t.ink }]}>{title}</Text>}
    </Pressable>
  );
}

/** Français / English. Chaque langue s'écrit dans sa propre langue. */
export function LanguageSwitch({ value, onChange }: { value: Locale; onChange: (l: Locale) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.lang, { backgroundColor: t.hairline }]} accessibilityRole="radiogroup" accessibilityLabel={tr("lang.label")}>
      {(["fr", "en"] as const).map((l) => {
        const on = value === l;
        return (
          <Pressable
            key={l}
            onPress={() => onChange(l)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.langItem, on && { backgroundColor: t.ink }]}
          >
            <Text style={[styles.langText, { color: on ? t.paper : t.muted }]}>{tr(l === "fr" ? "lang.fr" : "lang.en")}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  lang: { flexDirection: "row", alignSelf: "flex-start", borderRadius: 999, padding: 3, gap: 2 },
  langItem: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  langText: { fontSize: 14, fontWeight: "600" },
  sign: { alignSelf: "flex-start" },
  signInner: { borderWidth: 2.5, borderColor: "#fff", paddingTop: 2 },
  button: { borderRadius: 999, borderWidth: 1.5, paddingVertical: 16, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", minHeight: 56 },
  buttonText: { fontSize: 17, fontWeight: "600" },
});
