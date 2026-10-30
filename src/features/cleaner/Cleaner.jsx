import React, { useEffect, useState } from "react";
import { Text, Checkbox, Button } from "react-native-paper";
import {
  Screen,
  Panel,
  Dataset,
  useResource,
  ActionButton,
  Badge,
  Select,
  vnTime,
  Field,
  usePage,
  Pager,
} from "../../core/ui";
function Offer({ offer }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const initial = new Date(offer.expiresAt) - new Date(offer.serverNow);
    const update = () =>
      setSeconds(
        Math.max(0, Math.floor((initial - (Date.now() - started)) / 1000)),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [offer.expiresAt, offer.serverNow]);
  return (
    <Panel title={"Phòng " + offer.roomNumber + " · " + offer.serviceName}>
      <Text>Còn {seconds} giây để nhận</Text>
      <Text>
        {vnTime(offer.windowStart)} → {vnTime(offer.windowEnd)}
      </Text>
      <Text>{offer.notes}</Text>
      <ActionButton
        name="offer-accept"
        body={{ offerId: offer.id }}
        disabled={!seconds}
      >
        Nhận việc
      </ActionButton>
      <ActionButton
        mode="outlined"
        name="offer-reject"
        body={{ offerId: offer.id }}
        disabled={!seconds}
      >
        Từ chối
      </ActionButton>
    </Panel>
  );
}
function AssignedTask({ task }) {
  const [checked, setChecked] = useState([]);
  const [description, setDescription] = useState("");
  return (
    <Panel title={"Phòng " + task.roomNumber + " · " + task.serviceName}>
      <Badge value={task.assignmentStatus || task.status} />
      {!!task.assignedAt && (
        <Text>
          Nhận: {vnTime(task.assignedAt)}
          {task.closedAt ? " · Đóng: " + vnTime(task.closedAt) : ""}
        </Text>
      )}
      <Text>{task.notes}</Text>
      {!!task.isActive && (
        <>
          <Field
            label="Báo sự cố tại phòng (nếu có)"
            value={description}
            onChangeText={setDescription}
          />
          <ActionButton
            mode="text"
            name="incident"
            body={{ roomId: task.roomId, description }}
            disabled={description.length < 5}
            onSuccess={() => setDescription("")}
          >
            Gửi báo sự cố cho lễ tân
          </ActionButton>
        </>
      )}
      {!!task.isActive && task.status === "ASSIGNED" && (
        <ActionButton name="task-start" body={{ taskId: task.id }}>
          Bắt đầu dọn
        </ActionButton>
      )}
      {!!task.isActive && task.status === "IN_PROGRESS" && (
        <>
          {JSON.parse(task.checklistJson).map((item) => (
            <Checkbox.Item
              key={item}
              label={item}
              status={checked.includes(item) ? "checked" : "unchecked"}
              onPress={() =>
                setChecked(
                  checked.includes(item)
                    ? checked.filter((i) => i !== item)
                    : [...checked, item],
                )
              }
            />
          ))}
          <ActionButton
            name="task-submit"
            body={{ taskId: task.id, checklist: checked }}
            disabled={checked.length !== JSON.parse(task.checklistJson).length}
          >
            Nộp checklist · Chờ kiểm tra
          </ActionButton>
        </>
      )}
    </Panel>
  );
}
export default function Cleaner({ initialTab = "offers", onNotifications }) {
  const [tab, setTab] = useState(initialTab);
  const [page, setPage] = usePage();
  const offers = useResource("offers");
  const tasks = useResource("tasks", { page });
  const status = useResource("cleaner-status");
  return (
    <Screen
      title="Công việc của tôi"
      subtitle="Nhận việc trong ca · Hoàn thành từng checklist"
      onRefresh={() => {
        offers.refetch();
        tasks.refetch();
        status.refetch();
      }}
    >
      <Button onPress={onNotifications}>Thông báo của tôi</Button>
      <Dataset query={status}>
        {(s) =>
          s ? (
            <Panel
              title={
                s.busy
                  ? "Đang bận"
                  : s.inShift
                    ? s.accepting
                      ? "Sẵn sàng nhận việc"
                      : "Tạm nghỉ nhận việc"
                    : "Ngoài ca"
              }
            >
              <Text>
                {s.zone}. Trạng thái bận và ca làm được kiểm tra trên máy chủ.
              </Text>
              <ActionButton
                name="cleaner-availability"
                body={{ accepting: !s.accepting }}
              >
                {s.accepting ? "Tạm nghỉ nhận việc" : "Bật nhận việc"}
              </ActionButton>
            </Panel>
          ) : (
            <Text>Chưa có hồ sơ nhân viên. Liên hệ quản lý.</Text>
          )
        }
      </Dataset>
      <Select
        label="Danh sách"
        value={tab}
        onChange={setTab}
        options={[
          { value: "offers", label: "Việc mới" },
          { value: "active", label: "Việc của tôi" },
          { value: "history", label: "Lịch sử" },
        ]}
      />
      {tab === "offers" ? (
        <Dataset query={offers} empty="Chưa có lời mời còn hiệu lực.">
          {(items) => items.map((o) => <Offer key={o.id} offer={o} />)}
        </Dataset>
      ) : (
        <Dataset query={tasks} empty="Chưa có công việc.">
          {(items) => (
            <>
              {!items.some((t) =>
                tab === "active" ? t.isActive : !t.isActive,
              ) && (
                <Panel>
                  <Text>Chưa có công việc trong danh sách này.</Text>
                </Panel>
              )}
              {items
                .filter((t) => (tab === "active" ? t.isActive : !t.isActive))
                .map((t) => (
                  <AssignedTask key={t.assignmentId} task={t} />
                ))}
            </>
          )}
        </Dataset>
      )}
      {tab !== "offers" && (
        <Pager page={page} setPage={setPage} count={tasks.data?.length || 0} />
      )}
    </Screen>
  );
}
