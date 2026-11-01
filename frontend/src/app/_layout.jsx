import React from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider } from "react-native-paper";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, queryClient } from "../core/session";
import NotificationsBridge from "../core/NotificationsBridge";
import { Icon } from "../core/visuals";
import { theme } from "../core/theme";
const paperIcons = ({ name, color, size }) => (
  <Icon name={name} color={color} size={size} />
);
export default function Layout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {/* Paper's Portal.Host must stay inside the session for dialog content. */}
        <SessionProvider>
          <PaperProvider theme={theme} settings={{ icon: paperIcons }}>
            <NotificationsBridge />
            <Stack screenOptions={{ headerShown: false }} />
          </PaperProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
