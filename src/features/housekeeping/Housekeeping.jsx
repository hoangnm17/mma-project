import React, { useState } from "react";
import { Text, Button } from "react-native-paper";
import { View } from "react-native";
import { Icon, IconTile, palette } from "../../core/visuals";
import {
  Screen,
  Panel,
  Field,
  Dialog,
  Select,
  Dataset,
  useResource,
  ActionButton,
  usePage,
  Pager,
  Badge,
  vnTime,
  DateTimeField,
  isoAfter,
} from "../../core/ui";
import TaskForm from "./TaskForm";
export default function Housekeeping() {
  const [newStart, setNewStart] = useState(isoAfter(1)),
    [newEnd, setNewEnd] = useState(isoAfter(2)),
    [serviceCode, setServiceCode] = useState("FULL");
  const [page, setPage] = usePage(),
    [selectedStay, setSelectedStay] = useState(""),
    [open, setOpen] = useState(false),
    [detail, setDetail] = useState(null),
    [reason, setReason] = useState(""),
    [cleanerId, setCleanerId] = useState("");
  const q = useResource("tasks", { page });
  const stays = useResource("stays");
  const cleaners = useResource("cleaners");
  return (
    <Screen
      title="Smart Housekeeping"
      subtitle="Yêu cầu → Nhận việc → Checklist → Kiểm tra"
      onRefresh={q.refetch}
    >
      <View
        style={{
          backgroundColor: palette.mint,
          borderRadius: 18,
          padding: 16,
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
        }}
      >
        <IconTile name="broom" size={40} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontWeight: "700", fontSize: 14, color: palette.ink }}>
            Đúng người, đúng thời điểm
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 19, color: palette.muted }}>
            Yêu cầu được gửi tới nhân viên phù hợp trong ca. Lễ tân kiểm tra
            trước khi hoàn tất.
          </Text>
        </View>
      </View>
      <Button
        mode="contained"
        icon="plus-circle-outline"
        contentStyle={{ height: 46 }}
        style={{ borderRadius: 12 }}
        onPress={() => setOpen(true)}
      >
        Tạo yêu cầu thay khách
      </Button>
      <Dataset query={q}>
        {(items) => (
          <>
            {items.map((t) => (
              <Panel
                key={t.id}
                title={"Phòng " + t.roomNumber + " · " + t.serviceName}
              >
                <Badge value={t.status} />
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <Icon name="clock-outline" size={17} color={palette.muted} />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      lineHeight: 20,
                      color: palette.muted,
                    }}
                  >
                    {vnTime(t.windowStart)} → {vnTime(t.windowEnd)}
                  </Text>
                </View>
                <Text>{t.notes || "Không có ghi chú"}</Text>
                {!!t.escalated && (
                  <Text style={{ color: "#A54422" }}>
                    Chưa có người nhận, cần lễ tân điều phối.
                  </Text>
                )}
                <Button
                  onPress={() => {
                    setDetail(t);
                    setReason("");
                    setCleanerId("");
                  }}
                >
                  Xử lý công việc
                </Button>
                {t.status === "AWAITING_VERIFICATION" && (
                  <ActionButton
                    name="task-verify"
                    body={{ taskId: t.id, passed: true }}
                  >
                    Kiểm tra đạt · Hoàn tất
                  </ActionButton>
                )}
              </Panel>
            ))}
            <Pager page={page} setPage={setPage} count={items.length} />
          </>
        )}
      </Dataset>
      <Dialog
        title="Tạo yêu cầu"
        visible={open}
        onDismiss={() => setOpen(false)}
      >
        <Dataset query={stays}>
          {(items) => (
            <Select
              label="Lượt lưu trú đang mở"
              value={selectedStay}
              onChange={setSelectedStay}
              options={items
                .filter((s) => s.status === "OPEN")
                .map((s) => ({
                  value: s.id,
                  label: s.roomNumber + " · " + s.customerName,
                }))}
            />
          )}
        </Dataset>
        {selectedStay && (
          <TaskForm
            key={selectedStay}
            stayId={selectedStay}
            onSuccess={() => setOpen(false)}
          />
        )}
      </Dialog>
      <Dialog
        title="Xử lý công việc"
        visible={!!detail}
        onDismiss={() => setDetail(null)}
      >
        {detail && (
          <>
            <Text>
              {detail.serviceName} · Phòng {detail.roomNumber}
            </Text>
            <Text>
              Checklist: {JSON.parse(detail.checklistJson).join(" · ")}
            </Text>
            <Field
              label="Lý do làm lại / giao lại"
              value={reason}
              onChangeText={setReason}
            />
            {detail.status === "AWAITING_VERIFICATION" && (
              <ActionButton
                name="task-verify"
                body={{ taskId: detail.id, passed: false, reason }}
                disabled={reason.trim().length < 5}
                onSuccess={() => setDetail(null)}
              >
                Yêu cầu làm lại
              </ActionButton>
            )}
            {["PENDING", "ASSIGNED"].includes(detail.status) && (
              <ActionButton
                name="task-cancel"
                body={{ taskId: detail.id }}
                onSuccess={() => setDetail(null)}
              >
                Hủy công việc
              </ActionButton>
            )}
            {["ASSIGNED", "IN_PROGRESS"].includes(detail.status) && (
              <ActionButton
                name="task-reassign"
                body={{ taskId: detail.id, reason }}
                disabled={reason.trim().length < 5}
                onSuccess={() => setDetail(null)}
              >
                Đã xác minh · Giao lại
              </ActionButton>
            )}
            {detail.status === "PENDING" && (
              <>
                <DateTimeField
                  label="Đổi lịch: từ giờ"
                  value={newStart}
                  onChangeText={setNewStart}
                />
                <DateTimeField
                  label="Đổi lịch: đến giờ"
                  value={newEnd}
                  onChangeText={setNewEnd}
                />
                <Select
                  label="Đổi loại việc"
                  value={serviceCode}
                  onChange={setServiceCode}
                  options={[
                    { value: "FULL", label: "Dọn toàn phòng" },
                    { value: "LINEN", label: "Thay ga" },
                    { value: "TOWELS", label: "Bổ sung khăn" },
                    { value: "BATHROOM", label: "Phòng tắm" },
                  ]}
                />
                {detail.source !== "CHECKOUT" && (
                  <ActionButton
                    mode="outlined"
                    name="task-reschedule"
                    body={{
                      taskId: detail.id,
                      windowStart: newStart,
                      windowEnd: newEnd,
                      serviceCode,
                    }}
                    onSuccess={() => setDetail(null)}
                  >
                    Xác nhận đổi · Thu hồi lời mời cũ
                  </ActionButton>
                )}
                <Dataset query={cleaners}>
                  {(items) => (
                    <Select
                      label="Giao thủ công (server kiểm tra ca/kỹ năng)"
                      value={cleanerId}
                      onChange={setCleanerId}
                      options={items.map((c) => ({
                        value: c.id,
                        label:
                          c.name +
                          (c.busy
                            ? " · Bận"
                            : c.inShift
                              ? " · Trong ca"
                              : " · Ngoài ca"),
                      }))}
                    />
                  )}
                </Dataset>
                <ActionButton
                  name="task-assign"
                  body={{ taskId: detail.id, cleanerId }}
                  disabled={!cleanerId}
                  onSuccess={() => setDetail(null)}
                >
                  Giao cho nhân viên
                </ActionButton>
              </>
            )}
          </>
        )}
      </Dialog>
    </Screen>
  );
}
