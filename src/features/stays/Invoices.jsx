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
export default function Invoices() {
  const [page, setPage] = usePage();
  const q = useResource("invoices", { page });
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
      const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><body style="font:16px sans-serif;padding:30px;color:#102D46"><h1>StayFlow · Hóa đơn</h1><p>${escapeHtml(invoice.customerName)} · Phòng ${escapeHtml(invoice.roomNumber)}</p><p>${escapeHtml(vnTime(invoice.createdAt))}</p><p>Tiền phòng: ${vnMoney(detail.room.total)}</p>${detail.items.map((i) => `<p>${escapeHtml(i.name)} × ${i.quantity}: ${vnMoney(i.quantity * i.unitPrice)}</p>`).join("")}<p>Giảm giá: ${vnMoney(invoice.discount)} · Phụ thu: ${vnMoney(invoice.surcharge)}</p><h2>Tổng nghĩa vụ: ${vnMoney(detail.total)}</h2><p>Đã thu ròng: ${vnMoney(detail.paid - detail.refunded)} · Còn nợ: ${vnMoney(detail.balance)}</p></body></html>`;
      if (Platform.OS === "web") await Print.printAsync({ html });
      else {
        const file = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(file.uri, {
            mimeType: "application/pdf",
            dialogTitle: "Chia sẻ hóa đơn StayFlow",
          });
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Hóa đơn" onRefresh={q.refetch}>
      <ErrorMessage error={error} />
      <Dataset query={q}>
        {(items) =>
          items.map((i) => (
            <Panel
              key={i.id}
              title={"Phòng " + i.roomNumber + " · " + i.customerName}
            >
              <Text>{vnTime(i.createdAt)}</Text>
              <Text>Tổng sau điều chỉnh: {vnMoney(i.total - i.adjusted)}</Text>
              <Text>
                Thực thu: {vnMoney(i.paid - i.refunded)} · Công nợ:{" "}
                {vnMoney(i.total - i.adjusted - i.paid + i.refunded)}
              </Text>
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
