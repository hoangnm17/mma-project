import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform, AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { api, authorize, API_URL } from "./api";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000, refetchInterval: 15000 },
    mutations: { retry: false },
  },
});
const Context = createContext(null);
export const useSession = () => useContext(Context);
const storage = {
  get: () =>
    Platform.OS === "web"
      ? Promise.resolve(null)
      : SecureStore.getItemAsync("stayflow-session"),
  set: (value) =>
    Platform.OS === "web"
      ? Promise.resolve()
      : SecureStore.setItemAsync("stayflow-session", value),
  clear: () =>
    Platform.OS === "web"
      ? Promise.resolve()
      : SecureStore.deleteItemAsync("stayflow-session"),
};
export function SessionProvider({ children }) {
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(false);
  const client = useQueryClient();
  async function save(value) {
    client.clear();
    authorize(value?.token);
    setSession(value);
    if (value?.user) await storage.set(JSON.stringify(value));
    else await storage.clear();
  }
  useEffect(() => {
    let active = true;
    storage
      .get()
      .then(async (raw) => {
        if (!raw) return;
        const value = JSON.parse(raw);
        try {
          const { data } = await api.post("/auth/refresh", {
            refreshToken: value.refreshToken,
          });
          if (active) {
            authorize(data.token);
            setSession(data);
            await storage.set(JSON.stringify(data));
          }
        } catch {
          await storage.clear();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const listener = api.interceptors.response.use(
      (r) => r,
      async (error) => {
        if (error.response?.status === 401 && session) {
          authorize(null);
          setSession(null);
          client.clear();
          await storage.clear();
        }
        return Promise.reject(error);
      },
    );
    return () => api.interceptors.response.eject(listener);
  }, [session, client]);
  useEffect(() => {
    if (!session) return;
    const socket = session.user
      ? io(API_URL, {
          auth: { token: session.token },
          transports: ["websocket"],
        })
      : null;
    const refresh = () => client.invalidateQueries();
    socket?.on("changed", refresh);
    socket?.on("connect", refresh);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      socket?.disconnect();
      sub.remove();
    };
  }, [session, client]);
  return (
    <Context.Provider value={{ session, ready, save }}>
      {children}
    </Context.Provider>
  );
}
