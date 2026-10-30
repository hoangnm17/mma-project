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
  Chip,
  ActivityIndicator,
  HelperText,
  Portal,
  Modal,
} from "react-native-paper";
import { Icon, IconTile, palette } from "./visuals";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { action, read, errorText, requestId } from "./api";
export const colors = {
  navy: "#102D46",
  teal: "#087F8C",
  bg: palette.canvas,
  muted: "#63788A",
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
    READY: ["#E5F4EF", "#1E7B60", "check-circle-outline"],
    COMPLETED: ["#E5F4EF", "#1E7B60", "check-circle-outline"],
    OCCUPIED: ["#E9F1FE", "#366EB4", "account-key-outline"],
    OPEN: ["#E9F1FE", "#366EB4", "key-outline"],
    DIRTY: ["#FFF2DA", "#A46F16", "broom"],
    PENDING: ["#FFF2DA", "#A46F16", "clock-outline"],
    AWAITING_VERIFICATION: ["#F0EBFC", "#7A57AC", "clipboard-check-outline"],
    IN_PROGRESS: ["#E3F4F3", "#087E83", "progress-clock"],
    CANCELLED: ["#FCEBEC", "#B45B64", "close-circle-outline"],
    DISABLED: ["#EDF1F4", "#738494", "pause-circle-outline"],
    MAINTENANCE: ["#FCEBEC", "#B45B64", "tools"],
  };
  const [backgroundColor, color, icon] = statusColors[value] || [
    "#EDF2F6",
    "#536B7D",
    "circle-small",
  ];
  return (
    <Chip
      compact
      icon={() => <Icon name={icon} size={15} color={color} />}
      textStyle={{ color, fontSize: 11, fontWeight: "700" }}
      style={{
        alignSelf: "flex-start",
        backgroundColor,
        borderRadius: 9,
      }}
    >
      {labels[value] || value}
    </Chip>
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
            <View style={{ flex: 1, gap: 7 }}>
              <Text style={styles.eyebrow}>STAYFLOW / QUẢN LÝ LƯU TRÚ</Text>
              <Text
                variant="headlineMedium"
                style={[styles.title, { fontSize: 28, letterSpacing: -0.8 }]}
              >
                {title}
              </Text>
              <Text style={styles.muted}>
                {subtitle || "Mọi thông tin cần thiết, ngay trong tầm tay."}
              </Text>
            </View>
            <IconTile
              name={icon || defaultIcons[title] || "home-outline"}
              size={48}
            />
          </View>
        )}
        {children}
        <View style={{ height: 28 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Panel({ title, children, icon, subtitle }) {
  return (
    <Card style={styles.panel} mode="outlined">
      <Card.Content style={{ gap: 12 }}>
        {title && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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
              size={34}
            />
            <View style={{ flex: 1 }}>
              <Text
                variant="titleMedium"
                style={[styles.title, { fontSize: 15 }]}
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
      value={String(value ?? "")}
      onChangeText={onChangeText}
      style={{ backgroundColor: "#FFF" }}
      outlineColor="#DDE7EA"
      activeOutlineColor={palette.teal}
      outlineStyle={{ borderRadius: 12 }}
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
      <HelperText type="info">
        Giờ Việt Nam · Ngày/tháng/năm giờ:phút
      </HelperText>
    </View>
  );
}
export function Select({ label, value, onChange, options }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: palette.ink }}>
        {label}
      </Text>
      <View style={styles.row}>
        {options.map((o) => (
          <Chip
            key={String(o.value)}
            selected={value === o.value}
            onPress={() => onChange(o.value)}
            style={{
              marginBottom: 3,
              backgroundColor: value === o.value ? palette.mint : "#FFF",
              borderWidth: 1,
              borderColor: value === o.value ? "#9CCAC0" : palette.line,
              borderRadius: 10,
            }}
            textStyle={{
              fontSize: 12,
              color: value === o.value ? palette.teal : palette.muted,
            }}
          >
            {o.label}
          </Chip>
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
          Đang hiển thị dữ liệu đã tải trước đó. Tải lại để xác nhận trạng thái
          mới nhất.
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
        style={{ borderRadius: 12 }}
        contentStyle={{ minHeight: 46 }}
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
          contentContainerStyle={{ gap: 14 }}
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
    padding: 20,
    gap: 18,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: palette.teal,
  },
  title: { fontWeight: "800", color: colors.navy },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  panel: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  modal: {
    margin: 20,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "white",
    maxHeight: "90%",
    maxWidth: 700,
    width: "92%",
    alignSelf: "center",
  },
});
