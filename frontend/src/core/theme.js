import { MD3LightTheme } from "react-native-paper";

// Shared by Paper, custom components and feature screens.
export const palette = {
  ink: "#142D43",
  teal: "#08777C",
  mint: "#E5F4EF",
  blue: "#E9F1FE",
  amber: "#FFF2DA",
  rose: "#FCEBEC",
  violet: "#F0EBFC",
  muted: "#526779",
  line: "#DEE7EC",
  outline: "#788B99",
  canvas: "#F5F8FA",
  surface: "#FFFFFF",
  inverseMuted: "#C9DCE8",
  success: "#21684F",
  info: "#2D5F9B",
  warning: "#805611",
  error: "#A23D49",
  purple: "#69449A",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radii = { sm: 8, md: 12, lg: 20 };
export const layout = { maxWidth: 900, tablet: 768, touchTarget: 48 };

// Keep Paper's platform font families: System on iOS, sans-serif on Android.
// The same type roles are available to custom Text components as well.
export const typography = {
  headlineMedium: { ...MD3LightTheme.fonts.headlineMedium, fontSize: 28, lineHeight: 36, fontWeight: "700", letterSpacing: 0 },
  titleLarge: { ...MD3LightTheme.fonts.titleLarge, fontSize: 22, lineHeight: 30, fontWeight: "700", letterSpacing: 0 },
  titleMedium: { ...MD3LightTheme.fonts.titleMedium, fontSize: 16, lineHeight: 24, fontWeight: "600", letterSpacing: 0 },
  bodyLarge: { ...MD3LightTheme.fonts.bodyLarge, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  bodyMedium: { ...MD3LightTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 22, letterSpacing: 0 },
  labelLarge: { ...MD3LightTheme.fonts.labelLarge, fontSize: 14, lineHeight: 20, fontWeight: "600", letterSpacing: 0 },
  labelMedium: { ...MD3LightTheme.fonts.labelMedium, fontSize: 12, lineHeight: 18, fontWeight: "600", letterSpacing: 0 },
};

export const theme = {
  ...MD3LightTheme,
  roundness: 3,
  fonts: { ...MD3LightTheme.fonts, ...typography },
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.teal,
    onPrimary: palette.surface,
    primaryContainer: palette.mint,
    onPrimaryContainer: palette.ink,
    secondary: palette.ink,
    onSecondary: palette.surface,
    secondaryContainer: palette.blue,
    onSecondaryContainer: palette.ink,
    tertiary: palette.purple,
    onTertiary: palette.surface,
    tertiaryContainer: palette.violet,
    onTertiaryContainer: palette.purple,
    background: palette.canvas,
    onBackground: palette.ink,
    surface: palette.surface,
    onSurface: palette.ink,
    surfaceVariant: palette.canvas,
    onSurfaceVariant: palette.muted,
    outline: palette.outline,
    outlineVariant: palette.line,
    error: palette.error,
    onError: palette.surface,
    errorContainer: palette.rose,
    onErrorContainer: palette.error,
    inverseSurface: palette.ink,
    inverseOnSurface: palette.canvas,
    inversePrimary: "#88D4D1",
    backdrop: "rgba(20, 45, 67, 0.4)",
    elevation: {
      level0: "transparent",
      level1: "#F1F7F7",
      level2: "#EBF4F4",
      level3: "#E5F1F1",
      level4: "#E2EFEF",
      level5: "#DDECEC",
    },
  },
};
