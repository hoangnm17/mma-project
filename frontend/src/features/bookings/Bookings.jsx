import React, { useState } from "react";
import { Text, Button } from "react-native-paper";
import {
  Screen,
  Panel,
  Field,
  DateTimeField,
  Dialog,
  Select,
  Dataset,
  useResource,
  useAction,
  ErrorMessage,
  usePage,
  Pager,
  Badge,
  vnTime,
  vnMoney,
  isoAfter,
  ActionButton,
} from "../../core/ui";
import { useSession } from "../../core/session";
import CustomerPicker, { customerBody, customerReady } from "../customers/CustomerPicker";
function DepositDetail({ booking }) {
  const q = useResource("booking-receipts", { bookingId: booking.id });
  const { session } = useSession();
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  return (
    <>
      <Field
        label="Số tiền VND"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />
      <ActionButton
        name="receipt"
        body={{ bookingId: booking.id, amount: Number(amount), method: "CASH" }}
        disabled={!Number(amount)}
      >
        Thu thêm cọc tiền mặt
      </ActionButton>
      <Field label="Lý do hoàn cọc" value={reason} onChangeText={setReason} />
      <Dataset query={q}>
        {(items) =>
          items.map((r) => (
            <Panel key={r.id}>
              <Text>
                {vnTime(r.createdAt)} · {vnMoney(r.amount)} · Đã hoàn{" "}
                {vnMoney(r.returned)}
              </Text>
              {session.user.role === "Admin" && (
                <ActionButton
                  name="receipt-return"
                  body={{ receiptId: r.id, amount: Number(amount), reason }}
                  disabled={!Number(amount) || reason.length < 5}
                >
                  Hoàn số tiền đã nhập từ phiếu này
                </ActionButton>
              )}
            </Panel>
          ))
        }
      </Dataset>
    </>
  );
}
export default function Bookings() {
  const [depositBooking, setDepositBooking] = useState(null);
  const campaigns = useResource("campaign-options");
  const [page, setPage] = usePage(),
    [editing, setEditing] = useState(null);
  const q = useResource("bookings", { page });
  const mutation = useAction();
  const availability = useResource(
    "availability",
    {
      start: editing?.startsAt,
      end: editing?.endsAt,
      mode: editing?.mode,
      excludeBooking: editing?.id,
    },
    !!editing && Number.isFinite(Date.parse(editing.startsAt)),
  );
  return (
    <Screen
      title="Đặt phòng"
      onRefresh={q.refetch}
    >
      <Button
        mode="contained"
        onPress={() => {
          mutation.reset();
          setEditing({
            roomId: "",
            customerId: "",
            startsAt: isoAfter(24),
            customer: { name: "", phone: "", notes: "" },
            guests: 2,
            mode: "HOUR",
            deposit: 0,
            method: "CASH",
          });
        }}
      >
        Tạo đặt phòng
      </Button>
      <Dataset query={q}>
        {(items) => (
          <>
            {items.map((b) => (
              <Panel
                key={b.id}
                title={"Phòng " + b.roomNumber + " · " + b.customerName}
              >
                <Badge value={b.status} />
                <Text>
                  Khách dự kiến đến: {vnTime(b.startsAt)} · {b.mode === "NIGHT" ? "Qua đêm" : b.mode === "HOUR" ? "Theo giờ" : "Theo ngày (cũ)"}
                </Text>
                <Text>Cọc đã thu: {vnMoney(b.deposit)}</Text>
                {b.status === "CONFIRMED" && (
                  <>
                    <Button onPress={() => setDepositBooking(b)}>
                      Phiếu thu và hoàn cọc
                    </Button>
                    <Button
                      onPress={() =>
                        setEditing({
                          ...b,
                          startsAt: new Date(b.startsAt).toISOString(),
                          deposit: 0,
                        })
                      }
                    >
                      Sửa lịch đặt
                    </Button>
                    <ActionButton
                      name="checkin"
                      body={{
                        bookingId: b.id,
                      }}
                    >
                      Nhận phòng
                    </ActionButton>
                    <ActionButton
                      mode="outlined"
                      name="booking-cancel"
                      body={{ id: b.id }}
                    >
                      Hủy đặt phòng
                    </ActionButton>
                  </>
                )}
              </Panel>
            ))}
          </>
        )}
      </Dataset>
      <Pager page={page} setPage={setPage} count={q.data?.length || 0} />
      <Dialog
        title="Đặt phòng"
        visible={!!editing}
        onDismiss={() => { if (!mutation.isPending) setEditing(null); }}
      >
        {editing && (
          <>
            <DateTimeField
              label="Khách dự kiến đến nhận phòng"
              value={editing.startsAt}
              onChangeText={(v) =>
                setEditing({ ...editing, startsAt: v, roomId: "" })
              }
            />
            <Dataset
              query={availability}
              empty="Không có phòng trống trong khoảng giờ này."
            >
              {(rooms) => (
                <Select
                  label="Phòng còn trống"
                  value={editing.roomId}
                  onChange={(v) => setEditing({ ...editing, roomId: v })}
                  options={rooms.map((r) => ({
                    value: r.id,
                    label: r.number + " · " + r.typeName,
                  }))}
                />
              )}
            </Dataset>
            <CustomerPicker form={editing} onChange={setEditing} />
            <Select
              label="Hình thức thuê"
              value={editing.mode}
              onChange={(v) => setEditing({ ...editing, mode: v, endsAt: undefined, roomId: "" })}
              options={[
                { value: "HOUR", label: "Theo giờ" },
                { value: "NIGHT", label: "Qua đêm" },
              ]}
            />
            <Field
              label="Số khách"
              keyboardType="number-pad"
              value={editing.guests}
              onChangeText={(v) =>
                setEditing({ ...editing, guests: Number(v) })
              }
            />
            {!editing.id && (
              <Field
                label="Tiền cọc (VND)"
                keyboardType="number-pad"
                value={editing.deposit}
                onChangeText={(v) =>
                  setEditing({ ...editing, deposit: Number(v) })
                }
              />
            )}
            <Select
              label="Phương thức cọc"
              value={editing.method}
              onChange={(v) => setEditing({ ...editing, method: v })}
              options={[
                { value: "CASH", label: "Tiền mặt" },
                { value: "TRANSFER", label: "Chuyển khoản" },
              ]}
            />
            <ErrorMessage error={mutation.error} />
            <Field
              label="Nguồn đặt phòng"
              value={editing.source || "Trực tiếp"}
              onChangeText={(v) => setEditing({ ...editing, source: v })}
            />
            <Dataset
              query={campaigns}
              empty="Chưa có chiến dịch đang hoạt động."
            >
              {(items) => (
                <Select
                  label="Chiến dịch quy nguồn (tùy chọn)"
                  value={editing.campaignId || null}
                  onChange={(v) => setEditing({ ...editing, campaignId: v })}
                  options={[
                    { value: null, label: "Không có" },
                    ...items.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              )}
            </Dataset>
            <Button
              mode="contained"
              loading={mutation.isPending}
              disabled={
                mutation.isPending || !editing.roomId || !customerReady(editing)
              }
              onPress={() =>
                mutation.mutate(
                  { name: "booking", body: { ...editing, ...customerBody(editing) } },
                  { onSuccess: () => setEditing(null) },
                )
              }
            >
              Xác nhận đặt phòng
            </Button>
          </>
        )}
      </Dialog>
      <Dialog
        title="Tiền cọc đặt phòng"
        visible={!!depositBooking}
        onDismiss={() => setDepositBooking(null)}
      >
        {depositBooking && <DepositDetail key={depositBooking.id} booking={depositBooking} />}
      </Dialog>
    </Screen>
  );
}
