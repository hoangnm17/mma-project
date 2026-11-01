import React, { useState } from "react";
import { Image, View, StyleSheet, useWindowDimensions } from "react-native";
import { Text, Button, TextInput, TouchableRipple } from "react-native-paper";
import { Icon, IconTile, palette } from "../../core/visuals";
import { spacing, radii, typography, layout } from "../../core/theme";
import {
  Screen,
  Panel,
  Field,
  Dialog,
  Select,
  Dataset,
  useResource,
  useAction,
  ErrorMessage,
  usePage,
  Pager,
  Badge,
  labels,
  vnMoney,
  vnTime,
} from "../../core/ui";
import CustomerPicker, { customerBody, customerReady } from "../customers/CustomerPicker";
export default function Rooms() {
  const { width, fontScale } = useWindowDimensions();
  const twoColumns = width >= layout.tablet && fontScale <= 1.3;
  const [search, setSearch] = useState(""),
    [filtersOpen, setFiltersOpen] = useState(false),
    [filter, setFilter] = useState("ALL"),
    [typeId, setTypeId] = useState(""),
    [page, setPage] = usePage(),
    [room, setRoom] = useState(null),
    [form, setForm] = useState(null);
  const q = useResource("rooms", { search, page, status: filter, typeId });
  const types = useResource("roomTypes");
  const history = useResource("room-history", { roomId: room?.id }, !!room);
  const cleaningHistory = useResource("room-cleaning-history", { roomId: room?.id }, !!room);
  const mutation = useAction();
  return (
    <Screen
      title="Phòng"
      subtitle="Theo dõi trạng thái và nhận phòng trực tiếp."
      onRefresh={q.refetch}
      refreshing={q.isRefetching}
    >
      <Panel>
        <Field
          label="Tìm số phòng"
          left={<TextInput.Icon icon="magnify" />}
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <View style={roomStyles.filterToolbar}>
          <Button
            mode="outlined"
            icon="tune-variant"
            accessibilityLabel="Bộ lọc phòng"
            accessibilityState={{ expanded: filtersOpen }}
            aria-expanded={filtersOpen}
            contentStyle={{ minHeight: layout.touchTarget }}
            style={roomStyles.filterButton}
            onPress={() => setFiltersOpen(!filtersOpen)}
          >
            Bộ lọc{filter !== "ALL" || typeId ? ` (${Number(filter !== "ALL") + Number(!!typeId)})` : ""}
          </Button>
          <Text variant="bodyMedium" style={roomStyles.filterSummary}>
            {filter === "ALL" ? "Tất cả trạng thái" : labels[filter]}
            {" · "}{typeId ? types.data?.find((item) => item.id === typeId)?.name || "Loại phòng đã chọn" : "Tất cả loại phòng"}
          </Text>
        </View>
        {filtersOpen && (
          <>
            <Select
              label="Trạng thái"
              value={filter}
              onChange={(value) => { setFilter(value); setPage(1); }}
              options={[
                { value: "ALL", label: "Tất cả" },
                { value: "READY", label: "Sẵn sàng" },
                { value: "OCCUPIED", label: "Có khách" },
                { value: "DIRTY", label: "Cần dọn" },
                { value: "MAINTENANCE", label: "Bảo trì" },
              ]}
            />
            <Dataset query={types}>
              {(items) => <Select label="Loại phòng" value={typeId}
                onChange={(value) => { setTypeId(value); setPage(1); }}
                options={[{ value: "", label: "Tất cả" }, ...items.map((item) => ({ value: item.id, label: item.name }))]} />}
            </Dataset>
          </>
        )}
      </Panel>
      <Dataset query={q} empty="Không có phòng phù hợp. Hãy thử số phòng hoặc bộ lọc khác.">
        {(items) => (
          <>
            <View style={roomStyles.listHeading}>
              <Text accessibilityRole="header" variant="titleMedium" style={roomStyles.heading}>Danh sách phòng</Text>
              <Text variant="bodyMedium" style={roomStyles.muted}>{items.length} phòng trên trang {page}</Text>
            </View>
            {!items.some((r) => filter === "ALL" || r.status === filter) && (
              <Panel>
                <Text>Không có phòng phù hợp bộ lọc.</Text>
              </Panel>
            )}
            <View style={roomStyles.grid}>
              {items
                .filter((r) => filter === "ALL" || r.status === filter)
                .map((r) => (
                  <Panel key={r.id} style={[roomStyles.card, { flexBasis: twoColumns ? "48%" : "100%" }]} contentStyle={roomStyles.cardContent}>
                    <View style={roomStyles.cardHeader}>
                      <IconTile
                        name="bed-king-outline"
                        size={48}
                        tone={
                          r.status === "READY"
                            ? "mint"
                            : r.status === "OCCUPIED"
                              ? "blue"
                              : r.status === "MAINTENANCE" ? "rose" : r.status === "DISABLED" ? "canvas" : "amber"
                        }
                      />
                      <View style={roomStyles.identity}>
                        <Text
                          accessibilityRole="header"
                          variant="headlineMedium"
                          style={roomStyles.heading}
                        >
                          Phòng {r.number}
                        </Text>
                        <Text variant="bodyLarge" style={roomStyles.muted}>{r.typeName}</Text>
                      </View>
                    </View>
                    <Badge value={r.status} />
                    <View style={roomStyles.metadata}>
                      <View style={roomStyles.metaItem}>
                        <Icon
                          name="account-outline"
                          size={16}
                          color={palette.muted}
                        />
                        <Text variant="bodyMedium" style={roomStyles.metaText}>
                          {r.capacity} khách
                        </Text>
                      </View>
                      <View style={roomStyles.metaItem}>
                        <Icon
                          name="layers-outline"
                          size={16}
                          color={palette.muted}
                        />
                        <Text variant="bodyMedium" style={roomStyles.metaText}>{r.zone}</Text>
                      </View>
                    </View>
                    <View style={roomStyles.rates}>
                      <View style={roomStyles.rate}>
                        <Text variant="bodyMedium" style={roomStyles.muted}>Theo giờ</Text>
                        <Text variant="titleLarge" style={roomStyles.price}>{vnMoney(JSON.parse(r.rateJson).hour)}</Text>
                      </View>
                      <View style={roomStyles.rate}>
                        <Text variant="bodyMedium" style={roomStyles.muted}>Qua đêm</Text>
                        <Text variant="titleLarge" style={roomStyles.price}>{vnMoney(JSON.parse(r.rateJson).night)}</Text>
                      </View>
                    </View>
                    {r.expectedEnd && (
                      <View style={roomStyles.metaItem}>
                        <Icon name="clock-outline" size={16} color={palette.muted} />
                        <Text variant="bodyMedium" style={roomStyles.metaText}>Dự kiến trả: {vnTime(r.expectedEnd)}</Text>
                      </View>
                    )}
                    {r.status === "READY" && (
                      <RoomAction
                        primary
                        icon="key-outline"
                        onPress={() =>
                          setForm({
                            roomId: r.id,
                            customerId: "",
                            customer: { name: "", phone: "", notes: "" },
                            guests: 1,
                            mode: "HOUR",
                          })
                        }
                      >
                        Nhận phòng trực tiếp
                      </RoomAction>
                    )}
                    <RoomAction icon="history" onPress={() => setRoom(r)}>
                      Chi tiết và lịch sử
                    </RoomAction>
                  </Panel>
                ))}
            </View>
          </>
        )}
      </Dataset>
      <Pager page={page} setPage={setPage} count={q.data?.length || 0} />
      <Dialog
        title={"Phòng " + (room?.number || "")}
        visible={!!room}
        onDismiss={() => setRoom(null)}
      >
        {room?.photoUrl && (
          <Image
            source={{ uri: room.photoUrl }}
            style={{ height: 180, borderRadius: 12 }}
          />
        )}
        <Dataset query={history}>
          {(items) =>
            items.map((s) => (
              <Text key={s.id}>
                {s.customerName} · {vnTime(s.startedAt)} ·{" "}
                {s.status === "OPEN" ? "Đang ở" : "Đã trả"}
              </Text>
            ))
          }
        </Dataset>
        {room && <Panel title="Lịch sử dọn phòng">
          <Dataset query={cleaningHistory}>{(items) => items.map((task) => <Panel key={task.id}>
            <Badge value={task.status} />
            <Text>{task.serviceName || (task.serviceCode === "TURNOVER" ? "Dọn sau trả phòng" : "Dọn phòng")}</Text>
            {!!task.deskStartedAt && <Text>Bắt đầu: {vnTime(task.deskStartedAt)}</Text>}
            {!!task.completedAt && <Text>Hoàn tất: {vnTime(task.completedAt)}</Text>}
            {!task.deskStartedAt && !task.completedAt && <Text>Tạo yêu cầu: {vnTime(task.createdAt)}</Text>}
          </Panel>)}</Dataset>
        </Panel>}
      </Dialog>
      <Dialog
        title="Nhận phòng trực tiếp"
        visible={!!form}
        onDismiss={() => setForm(null)}
      >
        {form && (
          <>
            <CustomerPicker form={form} onChange={setForm} />
            <Field
              label="Số khách"
              keyboardType="number-pad"
              value={form.guests}
              onChangeText={(v) => setForm({ ...form, guests: Number(v) })}
            />
            <Select
              label="Thuê"
              value={form.mode}
              onChange={(v) => setForm({ ...form, mode: v })}
              options={[
                { value: "HOUR", label: "Giờ" },
                { value: "NIGHT", label: "Qua đêm" },
              ]}
            />
            <ErrorMessage error={mutation.error} />
            <Button
              mode="contained"
              disabled={mutation.isPending || !customerReady(form) || !Number.isInteger(form.guests) || form.guests < 1}
              loading={mutation.isPending}
              onPress={() =>
                mutation.mutate(
                  { name: "checkin", body: { ...form, ...customerBody(form) } },
                  { onSuccess: () => setForm(null) },
                )
              }
            >
              Xác nhận nhận phòng
            </Button>
          </>
        )}
      </Dialog>
    </Screen>
  );
}

function RoomAction({ primary = false, icon, onPress, children }) {
  const color = primary ? palette.surface : palette.teal;
  return (
    <TouchableRipple
      accessibilityRole="button"
      onPress={onPress}
      style={[roomStyles.button, primary && { backgroundColor: palette.teal }]}
    >
      <View style={roomStyles.buttonContent}>
        <Icon name={icon} size={20} color={color} />
        <Text style={[typography.labelLarge, roomStyles.buttonLabel, { color }]}>{children}</Text>
      </View>
    </TouchableRipple>
  );
}

const roomStyles = StyleSheet.create({
  heading: { color: palette.ink },
  muted: { color: palette.muted },
  filterToolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.md },
  filterButton: { borderRadius: radii.md, borderColor: palette.outline },
  filterSummary: { flex: 1, minWidth: 120, color: palette.muted },
  listHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  card: { flexGrow: 1, minWidth: 0 },
  cardContent: { padding: spacing.lg, gap: spacing.lg },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  identity: { flex: 1, minWidth: 0, gap: spacing.xs },
  metadata: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs, maxWidth: "100%" },
  metaText: { color: palette.muted, flexShrink: 1 },
  rates: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: palette.canvas,
  },
  rate: { flexBasis: 112, flexGrow: 1, gap: spacing.xs },
  price: { ...typography.titleMedium, fontSize: 20, lineHeight: 28, color: palette.ink, fontVariant: ["tabular-nums"] },
  button: { borderRadius: radii.md, overflow: "hidden" },
  buttonContent: {
    minHeight: layout.touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    gap: spacing.sm,
  },
  buttonLabel: { flexShrink: 1, textAlign: "center" },
});
