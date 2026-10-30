import React, { useState } from "react";
import { Text, Button, Checkbox } from "react-native-paper";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../core/api";
import {
  Panel,
  Field,
  DateTimeField,
  Select,
  Dataset,
  useResource,
  useAction,
  ErrorMessage,
  isoAfter,
  vnMoney,
  vnTime,
} from "../../core/ui";
export default function TaskForm({ stayId, onSuccess }) {
  const [text, setText] = useState(""),
    [draft, setDraft] = useState(null),
    [form, setForm] = useState({
      stayId,
      serviceCode: "FULL",
      windowStart: isoAfter(0.05),
      windowEnd: isoAfter(1),
      entryConsent: false,
      feeApproved: false,
      notes: "",
    }),
    [confirm, setConfirm] = useState(false);
  const services = useResource("services");
  const mutation = useAction();
  const ai = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/ai/draft", { stayId, text });
      setDraft(data);
      if (!data.clarificationNeeded)
        setForm((f) => ({
          ...f,
          serviceCode: data.serviceCode,
          windowStart: data.windowStart,
          windowEnd: data.windowEnd,
          notes: text,
        }));
      setConfirm(false);
    },
  });
  const update = (values) => {
    setForm({ ...form, ...values });
    setConfirm(false);
  };
  const selected = services.data?.find((s) => s.code === form.serviceCode);
  return (
    <Panel title="Yêu cầu dọn phòng">
      <Field
        label="Mô tả tiếng Việt cho AI (tùy chọn)"
        multiline
        value={text}
        onChangeText={setText}
      />
      <Button
        mode="outlined"
        disabled={ai.isPending || text.trim().length < 3}
        loading={ai.isPending}
        onPress={() => ai.mutate()}
      >
        AI tạo bản nháp
      </Button>
      <ErrorMessage error={ai.error} />
      {draft && (
        <Text>
          {draft.clarificationNeeded
            ? draft.clarificationQuestion
            : "AI đã tạo bản nháp. Kiểm tra dịch vụ và khung giờ bên dưới trước khi xác nhận."}
        </Text>
      )}
      <Dataset query={services}>
        {(items) => (
          <Select
            label="Loại việc"
            value={form.serviceCode}
            onChange={(v) => update({ serviceCode: v })}
            options={items
              .filter((s) => s.cleaning && s.code !== "TURNOVER")
              .map((s) => ({ value: s.code, label: s.name }))}
          />
        )}
      </Dataset>
      <DateTimeField
        label="Từ giờ"
        value={form.windowStart}
        onChangeText={(v) => update({ windowStart: v })}
      />
      <DateTimeField
        label="Đến giờ"
        value={form.windowEnd}
        onChangeText={(v) => update({ windowEnd: v })}
      />
      <Field
        label="Ghi chú cho nhân viên"
        value={form.notes}
        onChangeText={(v) => update({ notes: v })}
      />
      <Text>
        Phí khách trả: {vnMoney(selected?.price)}. Công nhân viên được quản lý
        riêng.
      </Text>
      <Checkbox.Item
        label="Tôi cho phép nhân viên vào phòng trong khung giờ trên"
        status={form.entryConsent ? "checked" : "unchecked"}
        onPress={() => update({ entryConsent: !form.entryConsent })}
      />
      <Checkbox.Item
        label="Tôi đồng ý dịch vụ và mức phí đã hiển thị"
        status={form.feeApproved ? "checked" : "unchecked"}
        onPress={() => update({ feeApproved: !form.feeApproved })}
      />
      {confirm && (
        <Panel title="Kiểm tra yêu cầu">
          <Text>
            {selected?.name} · {vnMoney(selected?.price)}
          </Text>
          <Text>
            {vnTime(form.windowStart)} → {vnTime(form.windowEnd)}
          </Text>
          <Text>{form.notes || "Không có ghi chú"}</Text>
        </Panel>
      )}
      <ErrorMessage error={mutation.error} />
      <Button
        mode="contained"
        disabled={!form.entryConsent || !form.feeApproved || mutation.isPending}
        loading={mutation.isPending}
        onPress={() => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          mutation.mutate(
            { name: "task-create", body: form },
            {
              onSuccess: (result) => {
                setConfirm(false);
                onSuccess?.(result);
              },
            },
          );
        }}
      >
        {confirm ? "Xác nhận gửi yêu cầu" : "Xem lại yêu cầu"}
      </Button>
    </Panel>
  );
}
