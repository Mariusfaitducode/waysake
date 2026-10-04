import { forwardRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { fs, radius, type, useTheme } from "./theme";
import { tr, type Locale } from "./i18n";

const glyph = { light: require("../assets/logo-glyph.png"), dark: require("../assets/logo-glyph-dark.png") };

/**
 * Glyphe de Waysake (chemin en W, épingle corail), en Encre du thème courant. Image tirée de web/brand.ts par
 * scripts/build-logo.mts. Décoratif sauf si `label` est fourni.
 */
export function Logo({ size = 28, label }: { size?: number; label?: string }) {
  const t = useTheme();
  return (
    <Image
      source={t.dark ? glyph.dark : glyph.light}
      style={{ width: size, height: size }}
      accessible={!!label}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
    />
  );
}

/** Glyphe + « Waysake » en Geist SemiBold, approche -0,045 em (comme <Wordmark> du site). `size` : hauteur du glyphe. */
export function Wordmark({ size = 30 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="Waysake">
      <Logo size={size} />
      <Text style={[type(Math.round(size * 0.72), 600, "tighter"), { color: t.text, marginLeft: size * 0.1 }]}>Waysake</Text>
    </View>
  );
}

/** Titre d'écran (--fs-2xl, 650 ≈ Geist Bold à l'écran, approche serrée). */
export function Title({ children, size = fs.xxl }: { children: ReactNode; size?: number }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={[type(size, 700, "tighter"), { color: t.text }]}>
      {children}
    </Text>
  );
}

type ButtonKind = "primary" | "quiet" | "plain";
/** `primary` : l'unique action Encre de l'écran. `quiet` : contour fin. `plain` : simple lien. */
export function Button({ title, onPress, kind = "primary", disabled, busy, style, small }: { title: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; busy?: boolean; style?: ViewStyle; small?: boolean }) {
  const t = useTheme();
  const primary = kind === "primary";
  const off = !!disabled && !busy;
  // Désactivé : fond creusé et texte pâle plutôt qu'une Encre délavée (illisible en sombre comme en clair).
  const fg = off ? t.faint : primary ? t.onAccent : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      hitSlop={small ? 8 : undefined}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        {
          backgroundColor: primary ? (off ? t.sunken : t.accent) : pressed && kind === "plain" ? t.line : "transparent",
          borderColor: primary ? (off ? t.line : t.accent) : kind === "quiet" ? t.lineStrong : "transparent",
          opacity: off && !primary ? 0.5 : pressed && primary ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[type(small ? fs.sm : fs.md, 600), { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

/** Champ de saisie : fond creusé, bord Encre au focus. */
export const Field = forwardRef<TextInput, TextInputProps & { label: string }>(function Field({ label, style, onFocus, onBlur, ...props }, ref) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type(fs.sm, 500), { color: t.muted }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={t.faint}
        selectionColor={t.accent}
        cursorColor={t.accent}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
        style={[styles.input, type(17, 500), { color: t.text, backgroundColor: t.sunken, borderColor: focused ? t.accent : t.line }, style]}
      />
    </View>
  );
});

/** Message d'état (erreur, avertissement) : un trait à gauche et le texte, jamais la couleur seule. */
export function Notice({ kind = "danger", children }: { kind?: "danger" | "warning"; children: ReactNode }) {
  const t = useTheme();
  const color = kind === "danger" ? t.danger : t.warning;
  return (
    <View accessibilityRole="alert" style={[styles.notice, { borderLeftColor: color, backgroundColor: t.surface }]}>
      <Text style={[type(fs.md, 500), { color }]}>{children}</Text>
    </View>
  );
}

/** Français / English. Chaque langue s'écrit dans sa propre langue. */
export function LanguageSwitch({ value, onChange }: { value: Locale; onChange: (l: Locale) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.lang, { backgroundColor: t.sunken, borderColor: t.line }]} accessibilityRole="radiogroup" accessibilityLabel={tr("lang.label")}>
      {(["fr", "en"] as const).map((l) => {
        const on = value === l;
        return (
          <Pressable
            key={l}
            onPress={() => onChange(l)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tr(l === "fr" ? "lang.fr" : "lang.en")}
            hitSlop={6}
            style={[styles.langItem, on && { backgroundColor: t.surface, borderColor: t.lineStrong }]}
          >
            <Text style={[type(fs.sm, 600), { color: on ? t.text : t.muted }]}>{l.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  wordmark: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  lang: { flexDirection: "row", borderRadius: radius.full, borderWidth: 1, padding: 3, gap: 2 },
  langItem: { borderRadius: radius.full, borderWidth: 1, borderColor: "transparent", paddingVertical: 6, paddingHorizontal: 12, minWidth: 44, alignItems: "center" },
  button: { borderRadius: radius.full, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", minHeight: 52 },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: 14, minHeight: 36 },
  input: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, minHeight: 52 },
  notice: { borderLeftWidth: 3, borderRadius: radius.xs, paddingVertical: 10, paddingHorizontal: 12 },
});
