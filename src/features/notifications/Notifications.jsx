import React, { useState } from "react";
import { Platform } from "react-native";
import { Text, Button } from "react-native-paper";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { action } from "../../core/api";
import {
  Screen,
  Panel,
  Dataset,
  useResource,
  ActionButton,
  ErrorMessage,
  vnTime,
  usePage,
  Pager,
} from "../../core/ui";
export default function Notifications({ navigate }) {
  const [page, setPage] = usePage();
  const q = useResource("notifications", { page });
  const [status, setStatus] = useState(""),
    [error, setError] = useState(null);
  async function register() {
    try {
      setError(null);
      if (Platform.OS === "web" || !Device.isDevice) {
        setStatus(
          "Thông báo đẩy cần thiết bị Android thật và development build/APK đã cấu hình FCM.",
        );
        return;
      }
      if (Constants.executionEnvironment === "storeClient") {
        setStatus(
          "Thông báo đẩy cần development build hoặc APK. Expo Go chưa hỗ trợ luồng này.",
        );
        return;
      }
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        setStatus(
          "Chưa có EAS projectId. Quản lý cần cấu hình dự án EAS và FCM.",
        );
        return;
      }
      const N = await import("expo-notifications");
      await N.setNotificationChannelAsync("housekeeping", {
        name: "Công việc dọn phòng",
        importance: N.AndroidImportance.HIGH,
      });
      const permission = await N.requestPermissionsAsync();
      if (permission.status !== "granted") {
        setStatus("Bạn chưa cấp quyền thông báo.");
        return;
      }
      const token = (await N.getExpoPushTokenAsync({ projectId })).data;
      await action("device", { token });
      setStatus(
        "Đã đăng ký thiết bị. Cần kiểm thử gửi/nhận từ backend trên APK.",
      );
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Screen title="Thông báo" onRefresh={q.refetch}>
      <Button mode="outlined" onPress={register}>
        Bật thông báo đẩy trên thiết bị
      </Button>
      {!!status && <Text>{status}</Text>}
      <ErrorMessage error={error} />
      <Dataset query={q}>
        {(items) =>
          items.map((n) => (
            <Panel key={n.id} title={(n.isRead ? "" : "● ") + n.title}>
              <Text>{n.body}</Text>
              <Text>{vnTime(n.createdAt)}</Text>
              {!n.isRead && (
                <ActionButton
                  mode="text"
                  name="notification-read"
                  body={{ id: n.id }}
                >
                  Đánh dấu đã đọc
                </ActionButton>
              )}
              {n.taskId && (
                <Button onPress={() => navigate("housekeeping")}>
                  Mở công việc
                </Button>
              )}
            </Panel>
          ))
        }
      </Dataset>
      <Pager page={page} setPage={setPage} count={q.data?.length || 0} />
    </Screen>
  );
}
