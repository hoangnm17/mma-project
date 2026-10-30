import React from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider, MD3LightTheme } from "react-native-paper";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, queryClient } from "../core/session";
import NotificationsBridge from "../core/NotificationsBridge";
import { Icon } from "../core/visuals";
const paperIcons = ({ name, color, size }) => (
  <Icon name={name} color={color} size={size} />
);
const theme = {
  ...MD3LightTheme,
  roundness: 3,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#087F8C",
    secondary: "#102D46",
    background: "#F4F7FA",
    surface: "#FFFFFF",
    outline: "#DFE8EB",
    onSurface: "#142D43",
    onSurfaceVariant: "#738494",
    primaryContainer: "#E5F4EF",
    secondaryContainer: "#E9F1FE",
  },
};
export default function Layout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={theme} settings={{ icon: paperIcons }}>
          <SessionProvider>
            <NotificationsBridge />
            <Stack screenOptions={{ headerShown: false }} />
          </SessionProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
