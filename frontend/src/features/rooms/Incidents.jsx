import React, { useState } from "react";
import { Text } from "react-native-paper";
import {
  Screen,
  Panel,
  Field,
  DateTimeField,
  Select,
  Dataset,
  useResource,
  ActionButton,
  isoAfter,
  vnTime,
} from "../../core/ui";
export default function Incidents() {
  const q = useResource("incidents"),
    rooms = useResource("rooms"),
    maintenance = useResource("maintenance");
  const [roomId, setRoomId] = useState(""),
    [description, setDescription] = useState(""),
    [resolution, setResolution] = useState(""),
    [start, setStart] = useState(isoAfter(0.1)),
    [end, setEnd] = useState(isoAfter(4));
  return (
    <Screen
      title="Sự cố & bảo trì"
      onRefresh={() => {
        q.refetch();
        maintenance.refetch();
      }}
    >
      <Panel title="Báo sự cố / lên lịch bảo trì">
        <Dataset query={rooms}>
          {(items) => (
            <Select
              label="Phòng"
              value={roomId}
              onChange={setRoomId}
              options={items.map((r) => ({ value: r.id, label: r.number }))}
            />
          )}
        </Dataset>
        <Field
          label="Nội dung"
          multiline
          value={description}
          onChangeText={setDescription}
        />
        <ActionButton
          name="incident"
          body={{ roomId, description }}
          disabled={!roomId || description.length < 5}
        >
          Báo sự cố phòng
        </ActionButton>
        <DateTimeField
          label="Bảo trì từ"
          value={start}
          onChangeText={setStart}
        />
        <DateTimeField label="Bảo trì đến" value={end} onChangeText={setEnd} />
        <ActionButton
          name="maintenance"
          body={{ roomId, startsAt: start, endsAt: end, reason: description }}
          disabled={!roomId || description.length < 5}
        >
          Tạo lịch chặn phòng bảo trì
        </ActionButton>
      </Panel>
      <Field
        label="Kết quả xử lý sự cố"
        value={resolution}
        onChangeText={setResolution}
      />
      <Dataset query={q}>
        {(items) =>
          items.map((i) => (
            <Panel
              key={i.id}
              title={
                "Phòng " +
                i.roomNumber +
                " · " +
                (i.status === "OPEN" ? "Chưa xử lý" : "Đã xử lý")
              }
            >
              <Text>{i.description}</Text>
              <Text>{i.resolution || vnTime(i.createdAt)}</Text>
              {i.status === "OPEN" && (
                <ActionButton
                  name="incident-resolve"
                  body={{ id: i.id, resolution }}
                  disabled={resolution.length < 5}
                >
                  Xác nhận đã xử lý
                </ActionButton>
              )}
            </Panel>
          ))
        }
      </Dataset>
      <Dataset query={maintenance}>
        {(items) =>
          items.map((m) => (
            <Panel key={m.id} title={"Bảo trì phòng " + m.roomNumber}>
              <Text>
                {vnTime(m.startsAt)} → {vnTime(m.endsAt)}
              </Text>
              <Text>{m.reason}</Text>
              {!m.resolvedAt && (
                <ActionButton name="maintenance-resolve" body={{ id: m.id }}>
                  Hoàn tất bảo trì
                </ActionButton>
              )}
            </Panel>
          ))
        }
      </Dataset>
    </Screen>
  );
}
