import React, { useState } from "react";
import { Platform } from "react-native";
import { Text, Button } from "react-native-paper";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { read } from "../../core/api";
import { useSession } from "../../core/session";
import {
  Screen,
  Panel,
  Dialog,
  Field,
  Select,
  Dataset,
  useResource,
  ActionButton,
  ErrorMessage,
  vnTime,
  vnMoney,
  usePage,
  Pager,
} from "../../core/ui";
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const modeName = (mode) => ({ HOUR: "Theo giờ", NIGHT: "Qua đêm", DAY: "Theo ngày (cũ)" })[mode] || mode;
function InvoiceDetail({ invoice }) {
  const detail = useResource("quote", { stayId: invoice.stayId });
  const receipts = useResource("receipts", { stayId: invoice.stayId });
  return <>
    <Dataset query={detail}>{(data) => <>
      <Text>Nhận: {vnTime(data.stay.startedAt)} · Trả: {vnTime(data.stay.endedAt)}</Text>
      <Text>Hình thức thuê: {modeName(data.stay.mode)}</Text>
      <Text>Tiền phòng: {vnMoney(data.room.base)} · Phụ thu giờ: {vnMoney(data.room.surcharge)}</Text>
      {data.items.map((item) => <Text key={item.id}>{item.name} × {item.quantity}: {vnMoney(item.unitPrice * item.quantity)}</Text>)}
      <Text>Giảm giá: {vnMoney(invoice.discount)} · Phụ thu khác: {vnMoney(invoice.surcharge)}</Text>
      <Text>Tổng ban đầu: {vnMoney(invoice.originalTotal ?? invoice.total)}</Text>
      <Text>Tổng sau điều chỉnh khi trả phòng: {vnMoney(invoice.total)}</Text>
      {!!invoice.adjustmentReason && <Text>Lý do: {invoice.adjustmentReason} · Người thực hiện: {invoice.adjustedByName || invoice.adjustedBy} · {vnTime(invoice.adjustedAt)}</Text>}
      <Text>Nghĩa vụ sau hoàn/điều chỉnh: {vnMoney(data.total)} · Còn thu: {vnMoney(data.balance)}</Text>
    </>}</Dataset>
    <Panel title="Lịch sử thanh toán">
      <Dataset query={receipts}>{(items) => items.map((receipt) => <Text key={receipt.id}>
        {vnTime(receipt.createdAt)} · {receipt.method === "TRANSFER" ? "Chuyển khoản" : "Tiền mặt"} · {vnMoney(receipt.amount)}
        {receipt.returned ? " · Đã hoàn " + vnMoney(receipt.returned) : ""}
      </Text>)}</Dataset>
    </Panel>
  </>;
}
export default function Invoices() {
  const [page, setPage] = usePage();
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const q = useResource("invoices", { page, paymentStatus });
  const { session } = useSession();
  const [refund, setRefund] = useState(null),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  async function pdf(invoice) {
    setBusy(true);
    setError(null);
    try {
      const detail = await read("quote", { stayId: invoice.stayId });
      const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Hóa đơn StayFlow</title></head><body style="font:16px sans-serif;padding:30px;color:#102D46"><h1>StayFlow · Hóa đơn</h1><p>${escapeHtml(invoice.customerName)} · Phòng ${escapeHtml(invoice.roomNumber)}</p><p>Nhận: ${escapeHtml(vnTime(detail.stay.startedAt))} · Trả: ${escapeHtml(vnTime(detail.stay.endedAt))}</p><p>Hình thức: ${escapeHtml(modeName(detail.stay.mode))}</p><p>Tiền phòng: ${vnMoney(detail.room.base)} · Phụ thu giờ: ${vnMoney(detail.room.surcharge)}</p>${detail.items.map((i) => `<p>${escapeHtml(i.name)} × ${i.quantity}: ${vnMoney(i.quantity * i.unitPrice)}</p>`).join("")}<p>Giảm giá: ${vnMoney(invoice.discount)} · Phụ thu khác: ${vnMoney(invoice.surcharge)}</p><p>Tổng ban đầu: ${vnMoney(invoice.originalTotal ?? invoice.total)} · Tổng khi chốt: ${vnMoney(invoice.total)}</p>${invoice.adjustmentReason ? `<p>Lý do điều chỉnh: ${escapeHtml(invoice.adjustmentReason)} · Người thực hiện: ${escapeHtml(invoice.adjustedByName || invoice.adjustedBy)}</p>` : ""}<h2>Tổng nghĩa vụ: ${vnMoney(detail.total)}</h2><p>Đã thu ròng: ${vnMoney(detail.paid - detail.refunded)} · Còn nợ: ${vnMoney(detail.balance)}</p></body></html>`;
      if (Platform.OS === "web") await Print.printAsync({ html });
      else {
        const file = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(file.uri, {
            mimeType: "application/pdf",
            dialogTitle: "Chia sẻ hóa đơn StayFlow",
          });
        else await Print.printAsync({ uri: file.uri });
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Hóa đơn" onRefresh={q.refetch}>
      <Select label="Trạng thái thanh toán" value={paymentStatus}
        onChange={(value) => { setPaymentStatus(value); setPage(1); }}
        options={[{ value: "ALL", label: "Tất cả" }, { value: "UNPAID", label: "Chưa thanh toán" }, { value: "PARTIAL", label: "Thanh toán một phần" }, { value: "PAID", label: "Đã thanh toán đủ" }]} />
      <ErrorMessage error={error} />
      <Dataset query={q}>
        {(items) =>
          items.map((i) => (
            <Panel
              key={i.id}
              title={"Phòng " + i.roomNumber + " · " + i.customerName}
            >
              <Text>{vnTime(i.createdAt)}</Text>
              <Text>Tổng ban đầu: {vnMoney(i.originalTotal ?? i.total)}</Text>
              <Text>Tổng sau điều chỉnh: {vnMoney(i.total - i.adjusted)}</Text>
              <Text>Trạng thái: {i.total - i.adjusted - i.paid + i.refunded <= 0 ? "Đã thanh toán đủ" : i.paid - i.refunded > 0 ? "Thanh toán một phần" : "Chưa thanh toán"}</Text>
              <Text>
                Thực thu: {vnMoney(i.paid - i.refunded)} · Công nợ:{" "}
                {vnMoney(i.total - i.adjusted - i.paid + i.refunded)}
              </Text>
              <Button onPress={() => setSelected(i)}>Chi tiết và lịch sử thanh toán</Button>
              <Button disabled={busy} loading={busy} onPress={() => pdf(i)}>
                In / chia sẻ PDF
              </Button>
              {session.user.role === "Admin" && (
                <Button
                  onPress={() => {
                    setRefund(i);
                    setAmount("");
                    setReason("");
                  }}
                >
                  Hoàn tiền và giảm nghĩa vụ
                </Button>
              )}
            </Panel>
          ))
        }
      </Dataset>
      <Pager page={page} setPage={setPage} count={q.data?.length || 0} />
      <Dialog title="Chi tiết hóa đơn" visible={!!selected} onDismiss={() => setSelected(null)}>
        {selected && <InvoiceDetail key={selected.id} invoice={selected} />}
      </Dialog>
      <Dialog
        title="Hoàn tiền có điều chỉnh hóa đơn"
        visible={!!refund}
        onDismiss={() => setRefund(null)}
      >
        <Field
          label="Số tiền VND"
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
        />
        <Field
          label="Lý do (tối thiểu 5 ký tự)"
          value={reason}
          onChangeText={setReason}
        />
        <ActionButton
          name="refund"
          body={{ invoiceId: refund?.id, amount: Number(amount), reason }}
          disabled={!Number(amount) || reason.length < 5}
          onSuccess={() => setRefund(null)}
        >
          Xác nhận hoàn tiền
        </ActionButton>
      </Dialog>
    </Screen>
  );
}
