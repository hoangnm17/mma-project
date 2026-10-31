import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Text, Button, TextInput } from "react-native-paper";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../core/api";
import { useSession } from "../../core/session";
import { Screen, Panel, Field, ErrorMessage, styles } from "../../core/ui";
import { Icon, IconTile, palette } from "../../core/visuals";
const schema = z.object({
  username: z.string().min(3, "Nhập tên đăng nhập"),
  password: z.string().min(1, "Nhập mật khẩu"),
});
export default function Login() {
  const [visible, setVisible] = useState(false);
  const { save } = useSession();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });
  const mutation = useMutation({
    mutationFn: async (b) => {
      const { data } = await api.post("/auth/login", b);
      await save(data);
    },
  });
  return (
    <Screen
      title="StayFlow"
      header={
        <LinearGradient colors={["#102F43", "#0C686D"]} style={login.hero}>
          <View style={login.brand}>
            <View style={login.logo}>
              <Icon name="home-heart" size={28} color="#C1EFDA" />
            </View>
            <Text style={login.brandName}>
              StayFlow<Text style={{ color: "#9ED8C7" }}>.</Text>
            </Text>
          </View>
          <Text style={login.tag}>QUẢN LÝ LƯU TRÚ</Text>
        </LinearGradient>
      }
    >
      <Panel title="Đăng nhập" icon="login-variant">
        {["username", "password"].map((name) => (
          <Controller
            key={name}
            control={control}
            name={name}
            render={({ field: { onChange, value } }) => (
              <>
                <Field
                  label={name === "username" ? "Tên đăng nhập" : "Mật khẩu"}
                  autoCapitalize="none"
                  secureTextEntry={name === "password" && !visible}
                  left={
                    <TextInput.Icon
                      icon={
                        name === "username" ? "account-outline" : "lock-outline"
                      }
                    />
                  }
                  right={
                    name === "password" ? (
                      <TextInput.Icon
                        icon={visible ? "eye-off-outline" : "eye-outline"}
                        onPress={() => setVisible(!visible)}
                        forceTextInputFocus={false}
                      />
                    ) : undefined
                  }
                  value={value}
                  onChangeText={onChange}
                />
                <ErrorMessage error={errors[name]?.message} />
              </>
            )}
          />
        ))}
        <ErrorMessage error={mutation.error} />
        <Button
          mode="contained"
          icon="arrow-right"
          style={{ borderRadius: 12 }}
          contentStyle={{ height: 50, flexDirection: "row-reverse" }}
          loading={mutation.isPending}
          disabled={mutation.isPending}
          onPress={handleSubmit((b) => mutation.mutate(b))}
        >
          Đăng nhập
        </Button>
      </Panel>
      <View style={login.guest}>
        <IconTile name="qrcode-scan" tone="blue" size={38} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={login.guestTitle}>Bạn là khách lưu trú?</Text>
          <Text style={styles.muted}>
            Mở link do lễ tân cung cấp.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
const login = StyleSheet.create({
  hero: { padding: 24, borderRadius: 26, gap: 14, marginTop: 8 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -1,
    color: "white",
  },
  tag: {
    fontSize: 9,
    letterSpacing: 1.7,
    color: "#A6CFC8",
    fontWeight: "700",
    marginTop: 10,
  },
  headline: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: "800",
    color: "white",
    letterSpacing: -0.9,
  },
  subtitle: { fontSize: 12, lineHeight: 21, color: "#C1D9D9" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,.06)",
    padding: 8,
    borderRadius: 9,
  },
  tagText: { fontSize: 9, color: "#BBDDD4" },
  guest: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  guestTitle: { fontSize: 13, fontWeight: "700", color: palette.ink },
});
