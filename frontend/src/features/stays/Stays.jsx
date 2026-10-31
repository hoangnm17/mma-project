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
  const [section, setSection] = useState("checkout");
  const [adjustPrice, setAdjustPrice] = useState(false);
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
    [finalTotal, setFinalTotal] = useState(""),
    [adjustmentReason, setAdjustmentReason] = useState(""),
    [checkoutPayment, setCheckoutPayment] = useState(""),
    [payRemaining, setPayRemaining] = useState(true),
    [returnId, setReturnId] = useState("");
  return (
    <>
      <Dataset query={quote}>
        {(q) => (
          <>
            <Panel title={q.stay.status === "OPEN" ? "Tạm tính" : "Hóa đơn"}>
              <Text>
                Tiền phòng: {vnMoney(q.room.base)} · Phụ thu giờ:{" "}
                {vnMoney(q.room.surcharge)}
              </Text>
              <Text>Dịch vụ: {vnMoney(q.services)}</Text>
              {(section === "service" || q.stay.status === "CLOSED") && q.items.map((i) => (
                <Panel key={i.id}>
                  <Text>
                    {i.name} × {i.quantity}: {vnMoney(i.quantity * i.unitPrice)}
                  </Text>
                  {q.stay.status === "OPEN" && i.serviceId && i.category !== "SPECIAL" && !i.taskId && !i.orderId && (
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
              {q.invoice?.originalTotal != null && (
                <Text>Tổng ban đầu: {vnMoney(q.invoice.originalTotal)} · Điều chỉnh: {vnMoney(q.invoice.adjustmentAmount || 0)}</Text>
              )}
              <Text>
                Đã thu: {vnMoney(q.paid - q.refunded)} · Còn thu:{" "}
                {vnMoney(q.balance)}
              </Text>
            </Panel>
            {q.stay.status === "CLOSED" && q.balance > 0 && (
              <Panel title="Thu công nợ">
                <Select label="Phương thức" value={method} onChange={setMethod}
                  options={[{ value: "CASH", label: "Tiền mặt" }, { value: "TRANSFER", label: "Chuyển khoản" }]} />
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
                <Select label="Thao tác" value={section} onChange={setSection} options={[
                  { value: "checkout", label: "Trả phòng" }, { value: "service", label: "Dịch vụ" },
                  { value: "payment", label: "Thu tiền" }, { value: "guest", label: "Link khách" },
                ]} />
                {section === "payment" && <Panel title="Thu tiền">
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
                    disabled={!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || Number(amount) > q.balance}
                    onSuccess={() => setAmount("")}
                  >
                    Xác nhận đã thu tiền
                  </ActionButton>
                </Panel>}
                {section === "service" && <Panel title="Thêm dịch vụ">
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
                    disabled={!serviceId || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1}
                    onSuccess={() => {
                      setItemId(null);
                      setQuantity("1");
                    }}
                  >
                    {itemId ? "Lưu số lượng dịch vụ" : "Thêm dịch vụ"}
                  </ActionButton>
                </Panel>}
                {section === "guest" && <Panel title="Link khách">
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
                    Tạo link mới
                  </Button>
                  {!!link && <Text selectable>{link}</Text>}
                  <ErrorMessage error={mutation.error} />
                  <ActionButton
                    name="dnd"
                    body={{ stayId: stay.id, dnd: !q.stay.dnd }}
                  >
                    {q.stay.dnd ? "Tắt Không làm phiền" : "Bật Không làm phiền"}
                  </ActionButton>
                  <Text>Link mới thay thế link cũ.</Text>
                </Panel>}
                {section === "checkout" && <Panel title="Trả phòng">
                  <Field
                    label="Mã giảm giá (tùy chọn)"
                    value={voucherCode}
                    onChangeText={(v) => setVoucherCode(v.toUpperCase())}
                  />
                  <Button mode="text" onPress={() => { setAdjustPrice(!adjustPrice); setFinalTotal(""); setAdjustmentReason(""); }}>
                    {adjustPrice ? "Giữ giá hệ thống" : "Điều chỉnh tổng tiền"}
                  </Button>
                  {adjustPrice && <Field
                    label="Tổng thanh toán (VND)"
                    value={finalTotal}
                    keyboardType="numeric"
                    onChangeText={setFinalTotal}
                  />}
                  {adjustPrice ? (
                    <Field label="Lý do điều chỉnh (ít nhất 5 ký tự)"
                      value={adjustmentReason} onChangeText={setAdjustmentReason} />
                  ) : null}
                  <Select label="Khoản thu lúc trả phòng" value={payRemaining} onChange={setPayRemaining}
                    options={[{ value: true, label: "Thu đủ số còn lại" }, { value: false, label: "Nhập số tiền thu thêm" }]} />
                  {!payRemaining && (
                    <Field label="Thu thêm (VND)"
                      value={checkoutPayment} onChangeText={setCheckoutPayment} keyboardType="numeric" />
                  )}
                  <Select label="Phương thức thanh toán" value={method} onChange={setMethod}
                    options={[{ value: "CASH", label: "Tiền mặt" }, { value: "TRANSFER", label: "Chuyển khoản" }]} />
                  {session.user.role === "Admin" && (
                    <>
                      <Select
                        label="Công nợ"
                        value={allowDebt}
                        onChange={(value) => { setAllowDebt(value); if (value) setPayRemaining(false); }}
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
                      ...(finalTotal !== "" ? { finalTotal: Number(finalTotal) } : {}),
                      ...(adjustmentReason ? { adjustmentReason } : {}),
                      payRemaining,
                      paymentMethod: method,
                      ...(!payRemaining && checkoutPayment !== "" ? { paymentAmount: Number(checkoutPayment) } : {}),
                      ...(voucherCode ? { voucherCode } : {}),
                    }}
                    onSuccess={onClose}
                    disabled={
                      (finalTotal !== "" && (!Number.isSafeInteger(Number(finalTotal)) || Number(finalTotal) < 0)) ||
                      (adjustPrice && (finalTotal === "" || adjustmentReason.trim().length < 5)) ||
                      (allowDebt && reason.trim().length < 5) ||
                      (!payRemaining && checkoutPayment !== "" && (!Number.isSafeInteger(Number(checkoutPayment)) || Number(checkoutPayment) < 0))
                    }
                  >
                    {payRemaining ? "Thu tiền & trả phòng" : "Xác nhận trả phòng"}
                  </ActionButton>
                </Panel>}
              </>
            )}
          </>
        )}
      </Dataset>
      {(section === "payment" || stay.status === "CLOSED") && <Panel title="Lịch sử thu tiền">
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
      </Panel>}
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
  const [status, setStatus] = useState("OPEN");
  const q = useResource("stays", { page, status });
  return (
    <Screen title="Lưu trú & thanh toán" onRefresh={q.refetch}>
      <Select label="Trạng thái lưu trú" value={status}
        onChange={(value) => { setStatus(value); setPage(1); }}
        options={[{ value: "OPEN", label: "Đang ở" }, { value: "CLOSED", label: "Đã trả" }, { value: "ALL", label: "Tất cả" }]} />
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
                Chi tiết
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
