import React, { useState } from "react";
import { Text, Button } from "react-native-paper";
import { useSession } from "../../core/session";
import {
  Screen,
  Panel,
  Field,
  Dialog,
  Select,
  Dataset,
  useResource,
  useAction,
  ActionButton,
  ErrorMessage,
  Badge,
  vnTime,
  vnMoney,
  usePage,
  Pager,
} from "../../core/ui";
function StayDetail({ stay, onClose }) {
  const [itemId, setItemId] = useState(null);
  const quote = useResource("quote", { stayId: stay.id });
  const receipts = useResource("receipts", { stayId: stay.id });
  const services = useResource("services");
  const mutation = useAction();
  const { session } = useSession();
  const [amount, setAmount] = useState(""),
    [method, setMethod] = useState("CASH"),
    [serviceId, setServiceId] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [link, setLink] = useState(""),
    [reason, setReason] = useState(""),
    [allowDebt, setAllowDebt] = useState(false),
    [voucherCode, setVoucherCode] = useState(""),
    [discount, setDiscount] = useState("0"),
    [surcharge, setSurcharge] = useState("0"),
    [returnId, setReturnId] = useState("");
  return (
    <>
      <Dataset query={quote}>
        {(q) => (
          <>
            <Panel title="Báo giá từ máy chủ">
              <Text>
                Tiền phòng: {vnMoney(q.room.base)} · Phụ thu giờ:{" "}
                {vnMoney(q.room.surcharge)}
              </Text>
              <Text>Dịch vụ: {vnMoney(q.services)}</Text>
              {q.items.map((i) => (
                <Panel key={i.id}>
                  <Text>
                    {i.name} × {i.quantity}: {vnMoney(i.quantity * i.unitPrice)}
                  </Text>
                  {q.stay.status === "OPEN" && !i.taskId && (
                    <Button
                      onPress={() => {
                        setItemId(i.id);
                        setServiceId(i.serviceId);
                        setQuantity(String(i.quantity));
                      }}
                    >
                      Sửa số lượng
                    </Button>
                  )}
                </Panel>
              ))}
              <Text variant="titleLarge">Tổng: {vnMoney(q.total)}</Text>
              <Text>
                Đã thu: {vnMoney(q.paid - q.refunded)} · Còn thu:{" "}
                {vnMoney(q.balance)}
              </Text>
            </Panel>
            {stay.status === "CLOSED" && q.balance > 0 && (
              <Panel title="Thu công nợ">
                <Field
                  label="Số tiền VND"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
                <ActionButton
                  name="receipt"
                  body={{ stayId: stay.id, amount: Number(amount), method }}
                  disabled={!Number(amount)}
                >
                  Ghi nhận thu công nợ
                </ActionButton>
              </Panel>
            )}
            {q.stay.status === "OPEN" && (
              <>
                <Panel title="Thu tiền">
                  <Field
                    label="Số tiền VND"
                    keyboardType="number-pad"
                    value={amount}
                    onChangeText={setAmount}
                  />
                  <Button
                    onPress={() => setAmount(String(Math.max(0, q.balance)))}
                  >
                    Điền số tiền còn thiếu
                  </Button>
                  <Select
                    label="Phương thức"
                    value={method}
                    onChange={setMethod}
                    options={[
                      { value: "CASH", label: "Tiền mặt" },
                      { value: "TRANSFER", label: "Chuyển khoản" },
                    ]}
                  />
                  <ActionButton
                    name="receipt"
                    body={{ stayId: stay.id, amount: Number(amount), method }}
                    disabled={!Number(amount)}
                  >
                    Xác nhận đã thu tiền
                  </ActionButton>
                </Panel>
                <Panel title="Dịch vụ sử dụng">
                  <Dataset query={services}>
                    {(items) => (
                      <Select
                        label="Dịch vụ"
                        value={serviceId}
                        onChange={(v) => {
                          setServiceId(v);
                          setItemId(null);
                        }}
                        options={items
                          .filter((s) => !s.cleaning)
                          .map((s) => ({
                            value: s.id,
                            label: s.name + " · " + vnMoney(s.price),
                          }))}
                      />
                    )}
                  </Dataset>
                  <Field
                    label="Số lượng"
                    keyboardType="number-pad"
                    value={quantity}
                    onChangeText={setQuantity}
                  />
                  <ActionButton
                    name="serviceItem"
                    body={{
                      stayId: stay.id,
                      serviceId,
                      quantity: Number(quantity),
                      ...(itemId ? { itemId } : {}),
                    }}
                    disabled={!serviceId}
                    onSuccess={() => {
                      setItemId(null);
                      setQuantity("1");
                    }}
                  >
                    {itemId ? "Lưu số lượng dịch vụ" : "Thêm dịch vụ"}
                  </ActionButton>
                </Panel>
                <Panel title="Link dành riêng cho khách">
                  <Button
                    mode="outlined"
                    loading={mutation.isPending}
                    disabled={mutation.isPending}
                    onPress={() =>
                      mutation.mutate(
                        { name: "guest-link", body: { stayId: stay.id } },
                        { onSuccess: (r) => setLink(r.url) },
                      )
                    }
                  >
                    Cấp link mới (thu hồi link cũ)
                  </Button>
                  {!!link && <Text selectable>{link}</Text>}
                  <ErrorMessage error={mutation.error} />
                  <ActionButton
                    name="dnd"
                    body={{ stayId: stay.id, dnd: !q.stay.dnd }}
                  >
                    {q.stay.dnd ? "Tắt Không làm phiền" : "Bật Không làm phiền"}
                  </ActionButton>
                </Panel>
                <Panel title="Trả phòng">
                  <Field
                    label="Mã voucher (nếu có)"
                    value={voucherCode}
                    onChangeText={(v) => setVoucherCode(v.toUpperCase())}
                  />
                  <Text>
                    Xác nhận chốt hóa đơn, kết thúc lượt ở và tạo việc dọn sau
                    trả phòng.
                  </Text>
                  {session.user.role === "Admin" && (
                    <>
                      <Field
                        label="Giảm giá VND"
                        keyboardType="numeric"
                        value={discount}
                        onChangeText={setDiscount}
                      />
                      <Field
                        label="Phụ thu VND"
                        keyboardType="numeric"
                        value={surcharge}
                        onChangeText={setSurcharge}
                      />
                      <Select
                        label="Công nợ"
                        value={allowDebt}
                        onChange={setAllowDebt}
                        options={[
                          { value: false, label: "Thu đủ trước khi trả" },
                          { value: true, label: "Cho nợ có lý do" },
                        ]}
                      />
                      {allowDebt && (
                        <Field
                          label="Lý do cho nợ"
                          value={reason}
                          onChangeText={setReason}
                        />
                      )}
                    </>
                  )}
                  <ActionButton
                    name="checkout"
                    body={{
                      stayId: stay.id,
                      allowDebt,
                      reason,
                      discount: Number(discount),
                      surcharge: Number(surcharge),
                      ...(voucherCode ? { voucherCode } : {}),
                    }}
                    onSuccess={onClose}
                  >
                    Xác nhận trả phòng
                  </ActionButton>
                </Panel>
              </>
            )}
          </>
        )}
      </Dataset>
      <Panel title="Lịch sử thu tiền">
        <Dataset query={receipts}>
          {(items) =>
            items.map((r) => (
              <Panel key={r.id}>
                <Text>
                  {vnTime(r.createdAt)} · {vnMoney(r.amount)} ·{" "}
                  {r.method === "CASH" ? "Tiền mặt" : "Chuyển khoản"}
                  {r.returned ? " · Đã hoàn " + vnMoney(r.returned) : ""}
                </Text>
                {session.user.role === "Admin" &&
                  stay.status === "OPEN" &&
                  r.amount > r.returned && (
                    <Button
                      onPress={() => {
                        setReturnId(r.id);
                        setAmount(String(r.amount - r.returned));
                      }}
                    >
                      Hoàn cọc / tiền thừa trước chốt
                    </Button>
                  )}
              </Panel>
            ))
          }
        </Dataset>
      </Panel>
      {!!returnId && (
        <Panel title="Hoàn tiền trước khi chốt">
          <Field
            label="Số tiền VND"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
          <Field label="Lý do hoàn" value={reason} onChangeText={setReason} />
          <ActionButton
            name="receipt-return"
            body={{ receiptId: returnId, amount: Number(amount), reason }}
            disabled={!Number(amount) || reason.length < 5}
            onSuccess={() => setReturnId("")}
          >
            Xác nhận hoàn tiền
          </ActionButton>
        </Panel>
      )}
    </>
  );
}
export default function Stays() {
  const [selected, setSelected] = useState(null);
  const [page, setPage] = usePage();
  const q = useResource("stays", { page });
  return (
    <Screen title="Lưu trú & thanh toán" onRefresh={q.refetch}>
      <Dataset query={q}>
        {(items) =>
          items.map((s) => (
            <Panel
              key={s.id}
              title={"Phòng " + s.roomNumber + " · " + s.customerName}
            >
              <Badge value={s.status} />
              <Text>
                {vnTime(s.startedAt)} → {vnTime(s.expectedEnd)}
              </Text>
              <Button onPress={() => setSelected(s)}>
                Dịch vụ, thu tiền và trả phòng
              </Button>
            </Panel>
          ))
        }
      </Dataset>
      <Pager page={page} setPage={setPage} count={q.data?.length || 0} />
      <Dialog
        title="Chi tiết lưu trú"
        visible={!!selected}
        onDismiss={() => setSelected(null)}
      >
        {selected && (
          <StayDetail
            key={selected.id}
            stay={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </Dialog>
    </Screen>
  );
}
