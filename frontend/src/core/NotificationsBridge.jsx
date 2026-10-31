import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "./session";
export default function NotificationsBridge() {
  const { session } = useSession();
  const client = useQueryClient();
  useEffect(() => {
    if (
      Platform.OS === "web" ||
      !session?.user ||
      Constants.executionEnvironment === "storeClient"
    )
      return;
    let received,
      response,
      cancelled = false;
    import("expo-notifications")
      .then((N) => {
        if (cancelled) return;
        received = N.addNotificationReceivedListener(() =>
          client.invalidateQueries(),
        );
        response = N.addNotificationResponseReceivedListener(() => {
          client.invalidateQueries();
          router.replace({
            pathname: "/",
            params: {
              screen:
                session.user.role === "Cleaner" ? "cleaner" : "housekeeping",
            },
          });
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      received?.remove();
      response?.remove();
    };
  }, [session, client]);
  return null;
}
