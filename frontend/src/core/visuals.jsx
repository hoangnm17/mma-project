import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { palette } from "./theme";
export { palette } from "./theme";
export function Icon({ name, size = 22, color = palette.teal, ...props }) {
  return (
    <MaterialCommunityIcons name={name} size={size} color={color} {...props} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
  );
}
export const featureIcons = {
  dashboard: "view-dashboard-outline",
  rooms: "bed-outline",
  bookings: "calendar-month-outline",
  customers: "account-group-outline",
  more: "dots-grid",
  stays: "key-outline",
  housekeeping: "broom",
  invoices: "receipt-text-outline",
  incidents: "tools",
  assistant: "creation-outline",
  notifications: "bell-outline",
  admin: "shield-account-outline",
  marketing: "bullhorn-outline",
  profile: "account-circle-outline",
  cleaner: "bell-ring-outline",
  mytasks: "clipboard-check-outline",
  history: "history",
};
export function IconTile({ name, tone = "mint", size = 44 }) {
  return (
    <View
      style={[
        s.iconTile,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: palette[tone] || tone,
        },
      ]}
    >
      <Icon
        name={name}
        size={size * 0.5}
        color={
          tone === "amber"
            ? palette.warning
            : tone === "rose"
              ? palette.error
              : tone === "blue"
                ? palette.info
                : palette.teal
        }
      />
    </View>
  );
}
export function SectionHeading({ title, subtitle, action, onAction }) {
  return (
    <View style={s.heading}>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle && <Text style={s.caption}>{subtitle}</Text>}
      </View>
      {action && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
          <Text style={s.link}>{action} →</Text>
        </Pressable>
      )}
    </View>
  );
}
export function MenuItem({ icon, title, description, onPress, tone = "mint" }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [s.menu, pressed && { opacity: 0.72 }]}
    >
      <IconTile name={icon} tone={tone} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.menuTitle}>{title}</Text>
        {!!description && <Text style={s.caption}>{description}</Text>}
      </View>
      <Icon name="chevron-right" color="#9BAAB5" />
    </Pressable>
  );
}
export function StatCard({ icon, value, label, tone = "mint", onPress }) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={({ pressed }) => [s.stat, onPress && pressed && { backgroundColor: palette.mint }]}
    >
      <IconTile name={icon} tone={tone} size={36} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.caption}>{label}</Text>
    </Pressable>
  );
}
export const visualStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: palette.muted,
  },
  caption: { fontSize: 14, lineHeight: 22, color: palette.muted },
});
const s = StyleSheet.create({
  iconTile: { alignItems: "center", justifyContent: "center" },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: palette.ink,
    letterSpacing: -0.5,
  },
  caption: { fontSize: 14, lineHeight: 22, color: palette.muted },
  link: { fontSize: 12, color: palette.teal, fontWeight: "700" },
  menu: {
    backgroundColor: "white",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  menuTitle: { fontWeight: "700", fontSize: 15, color: palette.ink },
  stat: {
    flexGrow: 1,
    flexBasis: "44%",
    minWidth: 130,
    borderRadius: 20,
    padding: 16,
    gap: 8,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: palette.line,
  },
  statValue: {
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -1,
    color: palette.ink,
  },
});
