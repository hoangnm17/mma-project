import React, { useState } from "react";
import { Text, Button } from "react-native-paper";
import { api } from "../../core/api";
import { exportCsv } from "../../core/export";
import { useSession } from "../../core/session";
import {
  Screen,
  Panel,
  Field,
  ActionButton,
  ErrorMessage,
} from "../../core/ui";
export default function Profile() {
  const { session, save } = useSession();
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(null),
    [csv, setCsv] = useState("");
  return (
    <Screen title="Cá nhân">
      <Panel title={session.user.name}>
        <Text>
          {session.user.role === "Cleaner"
            ? "Nhân viên dọn phòng"
            : session.user.role === "Admin"
              ? "Quản lý"
              : "Lễ tân"}
        </Text>
        <ActionButton name="logout" body={{}} onSuccess={() => save(null)}>
          Đăng xuất các phiên
        </ActionButton>
        <Button onPress={() => save(null)}>
          Đăng xuất trên thiết bị khi mất mạng
        </Button>
      </Panel>
      <Panel title="Đổi mật khẩu">
        <Field
          label="Mật khẩu hiện tại"
          secureTextEntry
          value={current}
          onChangeText={setCurrent}
        />
        <Field
          label="Mật khẩu mới (ít nhất 10 ký tự)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <ActionButton
          name="password"
          body={{ current, password }}
          disabled={password.length < 10}
          onSuccess={() => save(null)}
        >
          Đổi mật khẩu và đăng nhập lại
        </ActionButton>
      </Panel>
      {session.user.role !== "Cleaner" && (
        <Panel title="Xuất báo cáo CSV">
          <Button
            onPress={async () => {
              try {
                const response = await api.get("/reports.csv");
                setCsv(response.data);
                await exportCsv(response.data);
                setError(null);
              } catch (e) {
                setError(e);
              }
            }}
          >
            Tải / chia sẻ file CSV
          </Button>
          {!!csv && <Text selectable>{csv}</Text>}
          <ErrorMessage error={error} />
        </Panel>
      )}
    </Screen>
  );
}
