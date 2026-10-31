import React, { useState } from "react";
import { Platform } from "react-native";
import { Text, Button } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../core/api";
import { useSession } from "../core/session";
import {
  Screen,
  Panel,
  Field,
  Dataset,
  useResource,
  ActionButton,
  ErrorMessage,
  Badge,
  vnTime,
} from "../core/ui";
import TaskForm from "../features/housekeeping/TaskForm";
function GuestContent() {
  const { session } = useSession();
  const q = useResource("tasks"),
    stay = useResource("guest-stay");
  return (
    <Screen
      title="StayFlow · Dành cho khách"
      subtitle="Yêu cầu dọn phòng trong lượt lưu trú của bạn"
      onRefresh={() => {
        q.refetch();
        stay.refetch();
      }}
    >
      <Dataset query={stay}>
        {(s) => (
          <Panel title={"Phòng " + s.number}>
            <Text>
              {s.dnd
                ? "Đang bật Không làm phiền"
                : "Có thể gửi yêu cầu dọn phòng"}
            </Text>
            <ActionButton name="dnd" body={{ stayId: s.id, dnd: !s.dnd }}>
              {s.dnd ? "Tắt Không làm phiền" : "Bật Không làm phiền"}
            </ActionButton>
          </Panel>
        )}
      </Dataset>
      <TaskForm stayId={session.stayId} />
      <Dataset query={q} empty="Bạn chưa có yêu cầu nào.">
        {(items) =>
          items.map((t) => (
            <Panel key={t.id} title={t.serviceName}>
              <Badge value={t.status} />
              <Text>
                {vnTime(t.windowStart)} → {vnTime(t.windowEnd)}
              </Text>
              {["PENDING", "ASSIGNED"].includes(t.status) && (
                <ActionButton
                  mode="outlined"
                  name="task-cancel"
                  body={{ taskId: t.id }}
                >
                  Hủy yêu cầu
                </ActionButton>
              )}
              {t.status === "IN_PROGRESS" && (
                <Text>
                  Công việc đang thực hiện. Nếu cần dừng, vui lòng liên hệ lễ
                  tân.
                </Text>
              )}
              {t.status === "COMPLETED" && (
                <>
                  <Text>Đánh giá lần dọn này</Text>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <ActionButton
                      key={rating}
                      mode="text"
                      name="task-review"
                      body={{ taskId: t.id, rating }}
                    >
                      {rating} sao
                    </ActionButton>
                  ))}
                </>
              )}
            </Panel>
          ))
        }
      </Dataset>
    </Screen>
  );
}
export default function Guest() {
  const { session, save } = useSession();
  const [token, setToken] = useState(() =>
      Platform.OS === "web" && typeof window !== "undefined"
        ? new URLSearchParams(window.location.hash.slice(1)).get("token") || ""
        : "",
    ),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  async function exchange(value) {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/guest-access/exchange", {
        token: value,
      });
      await save(data);
      if (Platform.OS === "web")
        window.history.replaceState(null, "", "/guest");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {session && !session.user ? (
        <GuestContent />
      ) : (
        <Screen title="StayFlow · Dành cho khách">
          <Panel title="Mở quyền truy cập">
            <Text>
              Mở link riêng hoặc nhập mã được lễ tân cấp. Số phòng không phải mã
              truy cập.
            </Text>
            <Field
              label="Mã truy cập"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
            />
            <ErrorMessage error={error} />
            <Button
              mode="contained"
              loading={busy}
              disabled={busy || !token}
              onPress={() => exchange(token)}
            >
              Tiếp tục
            </Button>
          </Panel>
        </Screen>
      )}
    </SafeAreaView>
  );
}
