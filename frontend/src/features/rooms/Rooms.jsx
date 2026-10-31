import React, { useState } from "react";
import { Image, View } from "react-native";
import { Text, Button, TextInput } from "react-native-paper";
import { Icon, IconTile, palette, visualStyles } from "../../core/visuals";
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
  vnMoney,
  vnTime,
} from "../../core/ui";
import CustomerPicker, { customerBody, customerReady } from "../customers/CustomerPicker";
export default function Rooms() {
  const [search, setSearch] = useState(""),
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
      onRefresh={q.refetch}
    >
      <Field
        label="Tìm số phòng"
        left={<TextInput.Icon icon="magnify" />}
        value={search}
        onChangeText={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />
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
      <Dataset query={q}>
        {(items) => (
          <>
            {!items.some((r) => filter === "ALL" || r.status === filter) && (
              <Panel>
                <Text>Không có phòng phù hợp bộ lọc.</Text>
              </Panel>
            )}
            {items
              .filter((r) => filter === "ALL" || r.status === filter)
              .map((r) => (
                <Panel key={r.id}>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 14,
                      alignItems: "center",
                    }}
                  >
                    <IconTile
                      name="bed-king-outline"
                      size={56}
                      tone={
                        r.status === "READY"
                          ? "mint"
                          : r.status === "OCCUPIED"
                            ? "blue"
                            : "amber"
                      }
                    />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{
                          fontSize: 24,
                          fontWeight: "800",
                          letterSpacing: -0.8,
                          color: palette.ink,
                        }}
                      >
                        {r.number}
                      </Text>
                      <Text style={visualStyles.caption}>{r.typeName}</Text>
                    </View>
                    <Badge value={r.status} />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 16,
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Icon
                        name="account-outline"
                        size={16}
                        color={palette.muted}
                      />
                      <Text style={visualStyles.caption}>
                        {r.capacity} khách
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Icon
                        name="layers-outline"
                        size={16}
                        color={palette.muted}
                      />
                      <Text style={visualStyles.caption}>{r.zone}</Text>
                    </View>
                  </View>
                  <View style={{ height: 1, backgroundColor: palette.line }} />
                  <Text
                    style={{
                      fontSize: 19,
                      fontWeight: "700",
                      color: palette.ink,
                    }}
                  >
                    {vnMoney(JSON.parse(r.rateJson).hour)}{" "}
                    <Text style={visualStyles.caption}>/ giờ · {vnMoney(JSON.parse(r.rateJson).night)} / đêm</Text>
                  </Text>
                  {r.expectedEnd && (
                    <Text>Dự kiến trả: {vnTime(r.expectedEnd)}</Text>
                  )}
                  <Button icon="history" onPress={() => setRoom(r)}>
                    Chi tiết và lịch sử
                  </Button>
                  {r.status === "READY" && (
                    <Button
                      mode="contained"
                      icon="key-outline"
                      style={{ borderRadius: 12 }}
                      contentStyle={{ height: 44 }}
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
                    </Button>
                  )}
                </Panel>
              ))}
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
