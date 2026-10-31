import React, { useState } from "react";
import { Text, Button, Switch } from "react-native-paper";
import {
  Screen,
  Panel,
  Field,
  DateTimeField,
  Select,
  Dialog,
  Dataset,
  useResource,
  useAction,
  ErrorMessage,
  isoAfter,
  ActionButton,
  vnTime,
} from "../../core/ui";
import { policy } from "../../../shared/policy";
const definitions = {
  users: {
    label: "Tài khoản",
    action: "user",
    defaults: {
      username: "",
      name: "",
      password: "",
      role: "Receptionist",
      enabled: true,
      canAccessSpecialServices: false,
    },
    fields: [
      ["username", "Tên đăng nhập"],
      ["name", "Tên hiển thị"],
      ["password", "Mật khẩu mới (ít nhất 10 ký tự)"],
    ],
  },
  rooms: {
    label: "Phòng",
    action: "room",
    defaults: {
      number: "",
      typeId: "",
      zone: "Tầng 1",
      enabled: true,
      photoUrl: null,
    },
    fields: [
      ["number", "Số phòng"],
      ["zone", "Khu vực / tầng"],
      ["photoUrl", "Đường dẫn ảnh HTTPS (tùy chọn)"],
    ],
  },
  roomTypes: {
    label: "Loại phòng & giá",
    action: "roomType",
    defaults: { name: "", capacity: 2, rate: policy },
    fields: [
      ["name", "Tên loại phòng"],
      ["capacity", "Sức chứa", "number"],
    ],
  },
  services: {
    label: "Dịch vụ",
    action: "service",
    defaults: {
      code: "",
      name: "",
      unit: "Lần",
      price: 0,
      cleaning: false,
      fullClean: false,
      enabled: true,
    },
    fields: [
      ["code", "Mã (chữ hoa)"],
      ["name", "Tên dịch vụ"],
      ["unit", "Đơn vị"],
      ["price", "Đơn giá VND", "number"],
    ],
  },
  maintenance: {
    label: "Bảo trì",
    action: "maintenance",
    defaults: {
      roomId: "",
      startsAt: isoAfter(0.1),
      endsAt: isoAfter(4),
      reason: "",
    },
    fields: [
      ["startsAt", "Bắt đầu (ISO có múi giờ)"],
      ["endsAt", "Kết thúc (ISO có múi giờ)"],
      ["reason", "Nội dung bảo trì"],
    ],
  },
};
export default function Admin() {
  const [section, setSection] = useState("users"),
    [form, setForm] = useState(null);
  const def = definitions[section];
  const q = useResource(section, section === "services" ? { includeDisabled: true } : {});
  const types = useResource("roomTypes"),
    rooms = useResource("rooms");
  const mutation = useAction();
  function edit(item) {
    mutation.reset();
    setForm({
      ...def.defaults,
      ...item,
      ...(section === "roomTypes" ? { rate: JSON.parse(item.rateJson) } : {}),
      ...(section === "users" ? { password: "" } : {}),
    });
  }
  function submit() {
    const b = { ...form };
    if (section === "users" && !b.password) delete b.password;
    if (section === "rooms" && !b.photoUrl) b.photoUrl = null;
    mutation.mutate(
      { name: def.action, body: b },
      { onSuccess: () => setForm(null) },
    );
  }
  return (
    <Screen
      title="Quản trị"
    >
      <Select
        label="Danh mục"
        value={section}
        onChange={(v) => {
          setSection(v);
          setForm(null);
        }}
        options={Object.entries(definitions).map(([value, d]) => ({
          value,
          label: d.label,
        }))}
      />
      <Button mode="contained" onPress={() => { mutation.reset(); setForm({ ...def.defaults }); }}>
        Thêm {def.label.toLowerCase()}
      </Button>
      <Dataset query={q}>
        {(items) =>
          items.map((item) => (
            <Panel
              key={item.id}
              title={item.name || item.number || item.roomNumber}
            >
              <Text>
                {item.username || item.code || item.zone || item.reason || ""}
              </Text>
              {section === "maintenance" ? (
                <>
                  <Text>
                    {vnTime(item.startsAt)} → {vnTime(item.endsAt)}
                  </Text>
                  {!item.resolvedAt && (
                    <ActionButton
                      name="maintenance-resolve"
                      body={{ id: item.id }}
                    >
                      Xác nhận đã xử lý
                    </ActionButton>
                  )}
                </>
              ) : (
                <Button
                  disabled={section === "services" && !!item.cleaning}
                  onPress={() => edit(item)}
                >
                  Chỉnh sửa
                </Button>
              )}
            </Panel>
          ))
        }
      </Dataset>
      <Dialog
        title={def.label}
        visible={!!form}
        onDismiss={() => setForm(null)}
      >
        {form && (
          <>
            {def.fields.map(([key, label, type]) =>
              ["startsAt", "endsAt"].includes(key) ? (
                <DateTimeField
                  key={key}
                  label={label.replace(" (ISO có múi giờ)", "")}
                  value={form[key]}
                  onChangeText={(v) => setForm({ ...form, [key]: v })}
                />
              ) : (
                <Field
                  key={key}
                  label={label}
                  value={form[key]}
                  secureTextEntry={key === "password"}
                  keyboardType={type === "number" ? "numeric" : "default"}
                  onChangeText={(v) =>
                    setForm({
                      ...form,
                      [key]: type === "number" ? Number(v) : v,
                    })
                  }
                />
              ),
            )}
            {section === "users" && (
              <Select
                label="Vai trò"
                value={form.role}
                onChange={(v) => setForm({ ...form, role: v })}
                options={[
                  { value: "Admin", label: "Quản lý" },
                  { value: "Receptionist", label: "Lễ tân" },
                ]}
              />
            )}
            {section === "users" && form.role === "Receptionist" && (
              <>
                <Text>Cho phép truy cập dịch vụ hỗ trợ riêng</Text>
                <Switch
                  value={!!form.canAccessSpecialServices}
                  onValueChange={(value) => setForm({ ...form, canAccessSpecialServices: value })}
                />
              </>
            )}
            {"enabled" in form && (
              <>
                <Text>Đang hoạt động</Text>
                <Switch
                  value={!!form.enabled}
                  onValueChange={(v) => setForm({ ...form, enabled: v })}
                />
              </>
            )}
            {section === "rooms" && (
              <Dataset query={types}>
                {(items) => (
                  <Select
                    label="Loại phòng"
                    value={form.typeId}
                    onChange={(v) => setForm({ ...form, typeId: v })}
                    options={items.map((i) => ({ value: i.id, label: i.name }))}
                  />
                )}
              </Dataset>
            )}
            {section === "roomTypes" &&
              Object.entries({
                hour: "Giá giờ",
                night: "Giá qua đêm",
                extraHour: "Phụ thu mỗi giờ",
                graceMinutes: "Phút miễn tính thêm",
              }).map(([k, label]) => (
                <Field
                  key={k}
                  label={label}
                  keyboardType="numeric"
                  value={form.rate[k]}
                  onChangeText={(v) =>
                    setForm({ ...form, rate: { ...form.rate, [k]: Number(v) } })
                  }
                />
              ))}
            {section === "maintenance" && (
              <Dataset query={rooms}>
                {(items) => (
                  <Select
                    label="Phòng"
                    value={form.roomId}
                    onChange={(v) => setForm({ ...form, roomId: v })}
                    options={items.map((r) => ({
                      value: r.id,
                      label: r.number,
                    }))}
                  />
                )}
              </Dataset>
            )}
            <ErrorMessage error={mutation.error} />
            <Button
              mode="contained"
              disabled={mutation.isPending}
              loading={mutation.isPending}
              onPress={submit}
            >
              Lưu thay đổi
            </Button>
          </>
        )}
      </Dialog>
    </Screen>
  );
}
