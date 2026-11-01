import React, { useState, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import {
  Text,
  Button,
  TextInput,
  Card,
  TouchableRipple,
  ActivityIndicator,
  HelperText,
  Portal,
  Modal,
} from "react-native-paper";
import { Icon, IconTile, palette } from "./visuals";
import { spacing, radii, typography, layout } from "./theme";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { action, read, errorText, requestId } from "./api";
export const colors = {
  navy: palette.ink,
  teal: palette.teal,
  bg: palette.canvas,
  muted: palette.muted,
};
export const vnMoney = (n) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    n || 0,
  );
export const vnTime = (value) =>
  value
    ? new Date(value).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
      })
    : "—";
export const isoAfter = (hours) =>
  new Date(Date.now() + hours * 3600000).toISOString();
export const labels = {
  PENDING: "Chờ nhận",
  REWORK: "Cần làm lại",
  SUBMITTED: "Đã nộp checklist",
  REASSIGNED: "Đã giao lại",
  ASSIGNED: "Đã giao",
  IN_PROGRESS: "Đang dọn",
  AWAITING_VERIFICATION: "Chờ kiểm tra",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  READY: "Sẵn sàng",
  OCCUPIED: "Đang có khách",
  DIRTY: "Cần dọn",
  MAINTENANCE: "Bảo trì",
  DISABLED: "Ngừng sử dụng",
  OPEN: "Đang lưu trú",
  CLOSED: "Đã trả phòng",
  CONFIRMED: "Đã xác nhận",
  CHECKED_IN: "Đã nhận phòng",
};
export function Badge({ value }) {
  const statusColors = {
    READY: [palette.mint, palette.success, "check-circle-outline"],
    COMPLETED: [palette.mint, palette.success, "check-circle-outline"],
    OCCUPIED: [palette.blue, palette.info, "account-key-outline"],
    OPEN: [palette.blue, palette.info, "key-outline"],
    DIRTY: [palette.amber, palette.warning, "broom"],
    PENDING: [palette.amber, palette.warning, "clock-outline"],
    AWAITING_VERIFICATION: [palette.violet, palette.purple, "clipboard-check-outline"],
    IN_PROGRESS: [palette.mint, palette.teal, "progress-clock"],
    CANCELLED: [palette.rose, palette.error, "close-circle-outline"],
    DISABLED: [palette.canvas, palette.muted, "pause-circle-outline"],
    MAINTENANCE: [palette.rose, palette.error, "tools"],
  };
  const [backgroundColor, color, icon] = statusColors[value] || [
    palette.canvas,
    palette.muted,
    "circle-small",
  ];
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Icon name={icon} size={16} color={color} />
      <Text style={[typography.labelMedium, { color, flexShrink: 1 }]}>
        {labels[value] || value}
      </Text>
    </View>
  );
}
export function Screen({
  title,
  subtitle,
  children,
  onRefresh,
  refreshing = false,
  header,
  icon,
}) {
  const defaultIcons = {
    "Tổng quan": "view-dashboard-outline",
    Phòng: "bed-outline",
    "Đặt phòng": "calendar-month-outline",
    "Khách hàng": "account-group-outline",
    "Smart Housekeeping": "broom",
    "Công việc của tôi": "clipboard-check-outline",
    "Hóa đơn": "receipt-text-outline",
    "Quản trị": "shield-account-outline",
    "Cá nhân": "account-circle-outline",
    "Thông báo": "bell-outline",
    "Lưu trú & thanh toán": "key-outline",
    "Sự cố & bảo trì": "tools",
    "Chăm sóc khách hàng": "bullhorn-outline",
    "Trợ lý & dự báo": "creation-outline",
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {header || (
          <View style={styles.screenHeader}>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text
                variant="headlineMedium"
                accessibilityRole="header"
                style={[typography.headlineMedium, styles.title]}
              >
                {title}
              </Text>
              {!!subtitle && <Text style={styles.muted}>{subtitle}</Text>}
            </View>
            <IconTile
              name={icon || defaultIcons[title] || "home-outline"}
              size={48}
            />
          </View>
        )}
        {children}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Panel({ title, children, icon, subtitle, style, contentStyle }) {
  return (
    <Card style={[styles.panel, style]} mode="outlined">
      <Card.Content style={[{ gap: spacing.lg }, contentStyle]}>
        {title && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <IconTile
              name={
                icon ||
                (/Phòng/.test(title)
                  ? "bed-outline"
                  : /tiền|Tài chính|cọc/.test(title)
                    ? "wallet-outline"
                    : /khách|Khách/.test(title)
                      ? "account-outline"
                      : /dọn|Checklist|công việc/.test(title)
                        ? "broom"
                        : "layers-outline")
              }
              size={32}
            />
            <View style={{ flex: 1 }}>
              <Text
                variant="titleMedium"
                accessibilityRole="header"
                style={[typography.titleMedium, styles.title]}
              >
                {title}
              </Text>
              {subtitle && <Text style={styles.muted}>{subtitle}</Text>}
            </View>
          </View>
        )}
        {children}
      </Card.Content>
    </Card>
  );
}
export function Field({ label, value, onChangeText, ...props }) {
  return (
    <TextInput
      mode="outlined"
      label={label}
      accessibilityLabel={label}
      value={String(value ?? "")}
      onChangeText={onChangeText}
      style={{ backgroundColor: palette.surface }}
      outlineColor={palette.outline}
      activeOutlineColor={palette.teal}
      outlineStyle={{ borderRadius: radii.md }}
      {...props}
    />
  );
}
export function DateTimeField({ label, value, onChangeText }) {
  const format = (iso) => {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || !Number.isFinite(Date.parse(iso)))
      return iso;
    const local = new Date(new Date(iso).getTime() + 7 * 3600000).toISOString();
    return `${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)} ${local.slice(11, 16)}`;
  };
  return (
    <View>
      <Field
        label={label}
        value={format(String(value || ""))}
        onChangeText={(v) => {
          const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
          const iso = m
            ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+07:00`
            : null;
          onChangeText(
            iso && Number.isFinite(Date.parse(iso)) && format(iso) === v
              ? new Date(iso).toISOString()
              : v,
          );
        }}
      />
      <HelperText type="info">Ngày/tháng/năm giờ:phút</HelperText>
    </View>
  );
}
export function Select({ label, value, onChange, options }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.labelLarge, { color: palette.ink }]}>
        {label}
      </Text>
      <View style={styles.row}>
        {options.map((o) => (
          <TouchableRipple
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${o.label}`}
            accessibilityState={{ selected: value === o.value }}
            {...(Platform.OS === "web" ? { "aria-pressed": value === o.value } : {})}
            onPress={() => onChange(o.value)}
            style={[styles.option, {
              backgroundColor: value === o.value ? palette.mint : palette.surface,
              borderColor: value === o.value ? palette.teal : palette.outline,
            }]}
          >
            <View style={styles.optionContent}>
              {value === o.value && <Icon name="check" size={16} />}
              <Text style={[typography.labelLarge, { flexShrink: 1, color: value === o.value ? palette.teal : palette.muted }]}>
                {o.label}
              </Text>
            </View>
          </TouchableRipple>
        ))}
      </View>
    </View>
  );
}
export function ErrorMessage({ error }) {
  return error ? (
    <HelperText type="error" visible>
      {typeof error === "string" ? error : errorText(error)}
    </HelperText>
  ) : null;
}
export function Dataset({ query, children, empty = "Chưa có dữ liệu." }) {
  if (query.isPending)
    return (
      <Panel>
        <View style={{ alignItems: "center", padding: 24, gap: 12 }}>
          <ActivityIndicator />
          <Text style={styles.muted}>Đang cập nhật dữ liệu…</Text>
        </View>
      </Panel>
    );
  if (query.isError && query.data !== undefined)
    return (
      <>
        <ErrorMessage error={query.error} />
        <Text style={styles.muted}>
          Dữ liệu cũ. Kéo xuống để tải lại.
        </Text>
        {children(query.data)}
      </>
    );
  if (query.isError)
    return (
      <Panel>
        <ErrorMessage error={query.error} />
        <Button onPress={() => query.refetch()}>Thử lại</Button>
      </Panel>
    );
  if (Array.isArray(query.data) && !query.data.length)
    return (
      <Panel>
        <View style={{ alignItems: "center", padding: 22, gap: 12 }}>
          <IconTile name="tray-arrow-down" size={54} />
          <Text style={styles.muted}>{empty}</Text>
        </View>
      </Panel>
    );
  return children(query.data);
}
export function useResource(resource, params = {}, enabled = true) {
  return useQuery({
    queryKey: [resource, params],
    queryFn: () => read(resource, params),
    enabled,
  });
}
export function useAction() {
  const client = useQueryClient();
  const pendingKeys = useRef(new Map());
  return useMutation({
    mutationFn: ({ name, body, key }) => {
      const signature = JSON.stringify({ name, body });
      if (!pendingKeys.current.has(signature))
        pendingKeys.current.set(signature, key || requestId());
      return action(name, body, pendingKeys.current.get(signature));
    },
    onSuccess: (data, variables) => {
      pendingKeys.current.delete(
        JSON.stringify({ name: variables.name, body: variables.body }),
      );
      return client.invalidateQueries();
    },
  });
}
export function ActionButton({
  name,
  body,
  children,
  onSuccess,
  mode = "contained",
  disabled = false,
  icon,
}) {
  const mutation = useAction();
  return (
    <View>
      <Button
        mode={mode}
        icon={
          icon ||
          (/cancel|reject/.test(name)
            ? "close-circle-outline"
            : /verify|submit/.test(name)
              ? "check-circle-outline"
              : /receipt|refund/.test(name)
                ? "wallet-outline"
                : /start/.test(name)
                  ? "play-circle-outline"
                  : /accept|assign/.test(name)
                    ? "hand-okay"
                    : /create|customer|booking/.test(name)
                      ? "plus-circle-outline"
                      : "arrow-right")
        }
        style={{ borderRadius: radii.md }}
        contentStyle={{ minHeight: layout.touchTarget }}
        loading={mutation.isPending}
        disabled={disabled || mutation.isPending}
        onPress={() => mutation.mutate({ name, body }, { onSuccess })}
      >
        {children}
      </Button>
      <ErrorMessage error={mutation.error} />
    </View>
  );
}
export function Pager({ page, setPage, count }) {
  if (page === 1 && count < 30) return null;
  return (
    <View style={styles.row}>
      <Button disabled={page === 1} onPress={() => setPage(page - 1)}>
        Trước
      </Button>
      <Text>Trang {page}</Text>
      <Button disabled={count < 30} onPress={() => setPage(page + 1)}>
        Tiếp
      </Button>
    </View>
  );
}
export function usePage() {
  return useState(1);
}
export function Dialog({ visible, onDismiss, title, children }) {
  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.lg }}
        >
          <Text variant="titleLarge" style={styles.title}>
            {title}
          </Text>
          {children}
          <Button onPress={onDismiss}>Đóng</Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}
export const styles = StyleSheet.create({
  screen: {
    padding: spacing.lg,
    gap: spacing.lg,
    width: "100%",
    maxWidth: layout.maxWidth,
    alignSelf: "center",
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: palette.teal,
  },
  title: { fontWeight: "700", color: colors.navy },
  muted: { ...typography.bodyMedium, color: colors.muted },
  panel: {
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.line,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  option: {
    minHeight: layout.touchTarget,
    maxWidth: "100%",
    borderWidth: 1,
    borderRadius: radii.md,
    justifyContent: "center",
    overflow: "hidden",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  modal: {
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    maxHeight: "90%",
    maxWidth: 700,
    width: "92%",
    alignSelf: "center",
  },
});
