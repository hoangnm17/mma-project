import React, { useState } from "react";
import { Text, Button } from "react-native-paper";
import {
  Screen,
  Panel,
  Field,
  Dialog,
  Dataset,
  useResource,
  useAction,
  ErrorMessage,
  usePage,
  Pager,
  vnTime,
  vnMoney,
} from "../../core/ui";
export default function Customers() {
  const [search, setSearch] = useState(""),
    [page, setPage] = usePage(),
    [editing, setEditing] = useState(null),
    [history, setHistory] = useState(null);
  const q = useResource("customers", { search, page });
  const h = useResource(
    "customer-history",
    { customerId: history?.id },
    !!history,
  );
  const [invoicePage, setInvoicePage] = usePage();
  const invoices = useResource("invoices", { customerId: history?.id, page: invoicePage }, !!history);
  const mutation = useAction();
  return (
    <Screen
      title="Khách hàng"
      subtitle="Thông tin khách và lịch sử lưu trú"
      onRefresh={q.refetch}
    >
      <Field
        label="Tìm tên hoặc điện thoại"
        value={search}
        onChangeText={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />
      <Button
        mode="contained"
        onPress={() => { mutation.reset(); setEditing({ name: "", phone: "", notes: "" }); }}
      >
        Thêm khách hàng
      </Button>
      <Dataset query={q}>
        {(items) => (
          <>
            {items.map((c) => (
              <Panel key={c.id} title={c.name}>
                <Text>{c.phone}</Text>
                <Text>{c.notes}</Text>
                <Button onPress={() => setEditing(c)}>Chỉnh sửa</Button>
                <Button onPress={() => { setHistory(c); setInvoicePage(1); }}>Lịch sử lưu trú và hóa đơn</Button>
              </Panel>
            ))}
          </>
        )}
      </Dataset>
      <Pager page={page} setPage={setPage} count={q.data?.length || 0} />
      <Dialog
        title="Thông tin khách"
        visible={!!editing}
        onDismiss={() => setEditing(null)}
      >
        {editing && (
          <>
            {[
              ["name", "Họ tên"],
              ["phone", "Điện thoại"],
              ["notes", "Ghi chú"],
            ].map(([k, label]) => (
              <Field
                key={k}
                label={label}
                value={editing[k]}
                onChangeText={(v) => setEditing({ ...editing, [k]: v })}
              />
            ))}
            <ErrorMessage error={mutation.error} />
            <Button
              mode="contained"
              disabled={mutation.isPending}
              loading={mutation.isPending}
              onPress={() =>
                mutation.mutate(
                  { name: "customer", body: editing },
                  { onSuccess: () => setEditing(null) },
                )
              }
            >
              Lưu khách hàng
            </Button>
          </>
        )}
      </Dialog>
      <Dialog
        title={history?.name || "Lịch sử"}
        visible={!!history}
        onDismiss={() => setHistory(null)}
      >
        <Dataset query={h}>
          {(items) =>
            items.map((s) => (
              <Text key={s.id}>
                Phòng {s.roomNumber} · {vnTime(s.startedAt)} ·{" "}
                {s.status === "OPEN" ? "Đang ở" : "Đã trả"}
              </Text>
            ))
          }
        </Dataset>
        {history && <Panel title="Hóa đơn của khách">
          <Dataset query={invoices}>{(items) => <>
            {items.map((invoice) => <Text key={invoice.id}>
              {vnTime(invoice.createdAt)} · Phòng {invoice.roomNumber} · Tổng {vnMoney(invoice.total - invoice.adjusted)} · Còn thu {vnMoney(invoice.total - invoice.adjusted - invoice.paid + invoice.refunded)}
            </Text>)}
            <Pager page={invoicePage} setPage={setInvoicePage} count={items.length} />
          </>}</Dataset>
        </Panel>}
      </Dialog>
    </Screen>
  );
}
