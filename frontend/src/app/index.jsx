import React from "react";
import Assistant from "../features/reports/Assistant";
import Marketing from "../features/admin/Marketing";
import Incidents from "../features/rooms/Incidents";
import { router, useLocalSearchParams } from "expo-router";
import { View, Pressable, StyleSheet } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../core/session";
import Login from "../features/auth/Login";
import Profile from "../features/auth/Profile";
import Dashboard from "../features/reports/Dashboard";
import Rooms from "../features/rooms/Rooms";
import Customers from "../features/customers/Customers";
import Bookings from "../features/bookings/Bookings";
import Stays from "../features/stays/Stays";
import Invoices from "../features/stays/Invoices";
import Housekeeping from "../features/housekeeping/Housekeeping";
import Cleaner from "../features/cleaner/Cleaner";
import Admin from "../features/admin/Admin";
import Notifications from "../features/notifications/Notifications";
import Orders from "../features/orders/Orders";
import MealAssistants from "../features/orders/MealAssistants";
import { Screen } from "../core/ui";
import { Icon, featureIcons, MenuItem, palette } from "../core/visuals";
export default function Home() {
  const { session, ready } = useSession();
  const { screen: tab = "dashboard" } = useLocalSearchParams();
  const setTab = (value) => router.setParams({ screen: value });
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!session?.user)
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <Login />
      </SafeAreaView>
    );
  const cleaner = session.user.role === "Cleaner";
  const options = cleaner
    ? [
        ["cleaner", "Việc mới"],
        ["mytasks", "Việc của tôi"],
        ["history", "Lịch sử"],
        ["profile", "Cá nhân"],
      ]
    : [
        ["dashboard", "Tổng quan"],
        ["rooms", "Phòng"],
        ["bookings", "Đặt phòng"],
        ["customers", "Khách hàng"],
        ["more", "Thêm"],
      ];
  const moreOptions = cleaner
    ? [["notifications", "Thông báo"]]
    : [
        ["stays", "Lịch sử lưu trú"],
        ["housekeeping", "Dọn phòng"],
        ["food", "Ăn uống"],
        ...(session.user.role === "Admin" || session.user.canAccessSpecialServices
          ? [["mealSupport", "Đút thức ăn"], ["privateSupport", "Gọi hỗ trợ riêng"]]
          : []),
        ["invoices", "Hóa đơn"],
        ["incidents", "Sự cố"],
        ["assistant", "Trợ lý"],
        ["notifications", "Thông báo"],
        ...(session.user.role === "Admin"
          ? [
              ["admin", "Quản trị"],
              ["mealAssistants", "Quản lý người bón"],
              ["marketing", "Chăm sóc khách"],
            ]
          : []),
        ["profile", "Cá nhân"],
      ];
  const selected = [...options, ...moreOptions].some(([key]) => key === tab)
    ? tab
    : cleaner
      ? "cleaner"
      : "dashboard";
  const screens = {
    assistant: <Assistant />,
    marketing: <Marketing />,
    incidents: <Incidents />,
    dashboard: <Dashboard navigate={setTab} />,
    rooms: <Rooms />,
    customers: <Customers />,
    bookings: <Bookings />,
    stays: <Stays />,
    invoices: <Invoices />,
    housekeeping: <Housekeeping />,
    food: <Orders />,
    mealSupport: <Orders kind="SPECIAL" purpose="MEAL_ASSISTANCE" />,
    privateSupport: <Orders kind="SPECIAL" purpose="PRIVATE_SUPPORT" />,
    mealAssistants: <MealAssistants />,
    cleaner: (
      <Cleaner
        initialTab="offers"
        onNotifications={() => setTab("notifications")}
      />
    ),
    mytasks: (
      <Cleaner
        initialTab="active"
        onNotifications={() => setTab("notifications")}
      />
    ),
    history: (
      <Cleaner
        initialTab="history"
        onNotifications={() => setTab("notifications")}
      />
    ),
    more: (
      <Screen title="Thêm" subtitle="Vận hành và quản lý StayFlow">
        {moreOptions.map(([key, label]) => (
          <MenuItem
            key={key}
            icon={featureIcons[key] || (key === "food" ? "food-outline" : "account-heart-outline")}
            title={label}
            onPress={() => setTab(key)}
            tone={
              key === "incidents"
                ? "amber"
                : key === "marketing"
                  ? "rose"
                  : key === "admin"
                    ? "blue"
                    : "mint"
            }
          />
        ))}
      </Screen>
    ),
    admin: <Admin />,
    notifications: (
      <Notifications
        navigate={(value) => setTab(cleaner ? "cleaner" : value)}
      />
    ),
    profile: <Profile />,
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F4F7FA" }}>
      <View style={{ flex: 1 }} key={session.user.id + selected}>
        {screens[selected]}
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: "#DFE7ED",
          backgroundColor: "white",
        }}
      >
        <View style={{ flexDirection: "row", paddingVertical: 6 }}>
          {options.map(([key, label]) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{
                selected:
                  selected === key ||
                  (key === "more" && moreOptions.some(([k]) => k === selected)),
              }}
              onPress={() => setTab(key)}
              style={nav.item}
            >
              <View
                style={[
                  nav.iconWrap,
                  (selected === key ||
                    (key === "more" &&
                      moreOptions.some(([k]) => k === selected))) &&
                    nav.active,
                ]}
              >
                <Icon
                  name={featureIcons[key]}
                  size={23}
                  color={
                    selected === key ||
                    (key === "more" &&
                      moreOptions.some(([k]) => k === selected))
                      ? palette.teal
                      : palette.muted
                  }
                />
              </View>
              <Text
                style={[
                  nav.label,
                  (selected === key ||
                    (key === "more" &&
                      moreOptions.some(([k]) => k === selected))) && {
                    color: palette.teal,
                    fontWeight: "800",
                  },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
const nav = StyleSheet.create({
  item: { flex: 1, minHeight: 56, alignItems: "center", gap: 4, paddingVertical: 4 },
  iconWrap: {
    width: 48,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  active: { backgroundColor: palette.mint },
  label: { fontSize: 12, lineHeight: 18, color: palette.muted, fontWeight: "600", textAlign: "center" },
});
