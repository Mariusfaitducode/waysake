import { useColorScheme } from "react-native";

/** Les couleurs de Waysake (identiques au site) : vert autoroute, blanc neutre, nuit. */
export const green = "#0B7A4B";
export function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    dark,
    paper: dark ? "#101312" : "#FAFAF8",
    surface: dark ? "#1A1E1D" : "#FFFFFF",
    ink: dark ? "#EEF0EE" : "#16191B",
    muted: dark ? "#949B98" : "#6A7074",
    hairline: dark ? "rgba(238,240,238,0.12)" : "rgba(22,25,27,0.10)",
    accent: dark ? "#19A266" : green,
    signal: "#F2C230",
    danger: "#C4392B",
  };
}
export type Theme = ReturnType<typeof useTheme>;
export const font = { sign: "BarlowCondensed_600SemiBold", signMedium: "BarlowCondensed_500Medium" };
