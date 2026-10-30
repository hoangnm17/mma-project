import React, { useState } from "react";
import { Text, Button } from "react-native-paper";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../core/api";
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
  ActionButton,
  ErrorMessage,
  isoAfter,
  vnMoney,
} from "../../core/ui";
export default function Marketing() {
  const [tab, setTab] = useState("campaigns"),
    [form, setForm] = useState(null),
    [brief, setBrief] = useState(""),
    [draft, setDraft] = useState(""),
    [customerId, setCustomerId] = useState(""),
    [tier, setTier] = useState("STANDARD");
  const q = useResource(tab);
  const customers = useResource("customers");
  const mutation = useAction();
  const ai = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/ai/marketing", { brief });
      setDraft(data.draft);
    },
  });
  const defaults =
    tab === "campaigns"
      ? {
          name: "",
          channel: "Trực tiếp",
          startsAt: isoAfter(0),
          endsAt: isoAfter(24 * 30),
          budget: 0,
          draft: "",
        }
      : {
          code: "",
          discount: 50000,
          minTotal: 300000,
          startsAt: isoAfter(0),
          endsAt: isoAfter(24 * 30),
          maxUses: 100,
          perCustomer: 1,
          enabled: true,
        };
  return (
    <Screen title="Chăm sóc khách hàng">
      <Select
        label="Danh mục"
        value={tab}
        onChange={setTab}
        options={[
          { value: "campaigns", label: "Chiến dịch" },
          { value: "vouchers", label: "Voucher" },
        ]}
      />
      <Button mode="contained" onPress={() => setForm(defaults)}>
        Tạo mới
      </Button>
      <Dataset query={q}>
        {(items) =>
          items.map((item) => (
            <Panel key={item.id} title={item.name || item.code}>
              <Text>
                {tab === "campaigns"
                  ? "Doanh thu quy nguồn: " + vnMoney(item.attributedRevenue)
                  : "Giảm " +
                    vnMoney(item.discount) +
                    " · " +
                    item.uses +
                    "/" +
                    item.maxUses +
                    " lượt"}
              </Text>
              {tab === "campaigns" && (
                <Text>
                  Ngân sách: {vnMoney(item.budget)}. Quy nguồn không chứng minh
                  doanh thu tăng thêm.
                </Text>
              )}
              <Button
                onPress={() =>
                  setForm({
                    ...item,
                    startsAt: new Date(item.startsAt).toISOString(),
                    endsAt: new Date(item.endsAt).toISOString(),
                  })
                }
              >
                Chỉnh sửa
              </Button>
            </Panel>
          ))
        }
      </Dataset>
      <Panel title="Hạng khách hàng">
        <Dataset query={customers}>
          {(items) => (
            <Select
              label="Khách"
              value={customerId}
              onChange={setCustomerId}
              options={items.map((c) => ({
                value: c.id,
                label: c.name + " · " + c.tier,
              }))}
            />
          )}
        </Dataset>
        <Select
          label="Hạng"
          value={tier}
          onChange={setTier}
          options={[
            { value: "STANDARD", label: "Tiêu chuẩn" },
            { value: "SILVER", label: "Bạc" },
            { value: "GOLD", label: "Vàng" },
          ]}
        />
        <ActionButton
          name="membership"
          body={{ customerId, tier }}
          disabled={!customerId}
        >
          Cập nhật hạng
        </ActionButton>
      </Panel>
      <Panel title="AI soạn nội dung chăm sóc">
        <Field
          label="Mô tả nội dung muốn soạn"
          value={brief}
          onChangeText={setBrief}
          multiline
        />
        <Button
          loading={ai.isPending}
          disabled={ai.isPending || brief.length < 5}
          onPress={() => ai.mutate()}
        >
          Tạo bản nháp
        </Button>
        <ErrorMessage error={ai.error} />
        {!!draft && <Text selectable>{draft}</Text>}
        <Text>
          Nội dung chỉ là bản nháp để duyệt. Ứng dụng không tự gửi tin hoặc đăng
          quảng cáo.
        </Text>
      </Panel>
      <Dialog
        title={tab === "campaigns" ? "Chiến dịch" : "Voucher"}
        visible={!!form}
        onDismiss={() => setForm(null)}
      >
        {form && (
          <>
            {(tab === "campaigns"
              ? [
                  ["name", "Tên chiến dịch"],
                  ["channel", "Kênh"],
                  ["budget", "Ngân sách VND"],
                  ["draft", "Nội dung chăm sóc"],
                ]
              : [
                  ["code", "Mã voucher"],
                  ["discount", "Số tiền giảm VND"],
                  ["minTotal", "Hóa đơn tối thiểu VND"],
                  ["maxUses", "Tổng lượt tối đa"],
                  ["perCustomer", "Lượt mỗi khách"],
                ]
            ).map(([k, label]) => (
              <Field
                key={k}
                label={label}
                value={form[k]}
                onChangeText={(v) =>
                  setForm({
                    ...form,
                    [k]: [
                      "budget",
                      "discount",
                      "minTotal",
                      "maxUses",
                      "perCustomer",
                    ].includes(k)
                      ? Number(v)
                      : v,
                  })
                }
              />
            ))}
            <DateTimeField
              label="Bắt đầu"
              value={form.startsAt}
              onChangeText={(v) => setForm({ ...form, startsAt: v })}
            />
            <DateTimeField
              label="Kết thúc"
              value={form.endsAt}
              onChangeText={(v) => setForm({ ...form, endsAt: v })}
            />
            <ErrorMessage error={mutation.error} />
            <Button
              mode="contained"
              loading={mutation.isPending}
              disabled={mutation.isPending}
              onPress={() =>
                mutation.mutate(
                  {
                    name: tab === "campaigns" ? "campaign" : "voucher",
                    body: form,
                  },
                  { onSuccess: () => setForm(null) },
                )
              }
            >
              Lưu
            </Button>
          </>
        )}
      </Dialog>
    </Screen>
  );
}
