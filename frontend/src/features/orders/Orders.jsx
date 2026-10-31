import React, { useState } from "react";
import { View } from "react-native";
import { Button, Text, Chip } from "react-native-paper";
import { useSession } from "../../core/session";
import {
  Screen,
  Panel,
  Field,
  Select,
  Dataset,
  Dialog,
  Pager,
  ActionButton,
  ErrorMessage,
  useResource,
  useAction,
  vnMoney,
  vnTime,
  styles,
} from "../../core/ui";

const statusLabels = {
  PENDING: "Chờ xử lý",
  PREPARING: "Đang thực hiện",
  COMPLETED: "Đã hoàn thành",
  CANCELLED: "Đã hủy",
};

export default function Orders({ kind = "FOOD", purpose = "MEAL_ASSISTANCE" }) {
  const { session } = useSession();
  const special = kind === "SPECIAL";
  const admin = session?.user?.role === "Admin";
  const allowed =
    admin ||
    (session?.user?.role === "Receptionist" &&
      (!special || session.user.canAccessSpecialServices));
  const privateSupport = special && purpose === "PRIVATE_SUPPORT";
  const title = special
    ? privateSupport
      ? "Gọi hỗ trợ riêng"
      : "Hỗ trợ ăn uống"
    : "Đồ ăn & thức uống";
  const [tab, setTab] = useState("orders");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [catalogueForm, setCatalogueForm] = useState(null);
  const [orderForm, setOrderForm] = useState(null);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const mutation = useAction();
  const scope = special ? { purpose } : {};
  const catalogue = useResource(
    special ? "special-services" : "food-items",
    scope,
    allowed,
  );
  const orders = useResource(
    special ? "special-requests" : "food-orders",
    { ...scope, page, ...(status ? { status } : {}) },
    allowed,
  );
  const stays = useResource("stays", { status: "OPEN" }, allowed && !!orderForm);
  const itemAction = special ? "special-service" : "food-item";
  const orderAction = special ? "special-request" : "food-order";
  const availableItems = (catalogue.data || []).filter((item) => item.enabled);
  const cart = orderForm?.items || [];
  const cartTotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const changeCart = (serviceId, changes) =>
    setOrderForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.serviceId === serviceId ? { ...item, ...changes } : item,
      ),
    }));

  if (!allowed)
    return (
      <Screen title="Dịch vụ hỗ trợ">
        <Panel>
          <Text>Bạn chưa được cấp quyền truy cập chức năng này.</Text>
        </Panel>
      </Screen>
    );

  return (
    <Screen
      title={title}
      icon={special ? "account-supervisor-outline" : "food-outline"}
      onRefresh={() => {
        catalogue.refetch();
        orders.refetch();
      }}
      refreshing={orders.isRefetching || catalogue.isRefetching}
    >
      {admin && (
        <Select
          label="Nội dung"
          value={tab}
          onChange={setTab}
          options={[
            { value: "orders", label: "Yêu cầu & lịch sử" },
            { value: "catalogue", label: "Danh mục & đơn giá" },
          ]}
        />
      )}
      {tab === "orders" ? (
        <>
          <Button
            mode="contained"
            icon="plus"
            onPress={() => {
              mutation.reset();
              setSelectedServiceId("");
              setServiceSearch("");
              setOrderForm({ stayId: "", items: [], notes: "" });
            }}
          >
            {special ? "Tạo yêu cầu hỗ trợ" : "Tạo đơn ăn uống"}
          </Button>
          <Select
            label="Trạng thái"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: "", label: "Tất cả" },
              ...Object.entries(statusLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <Dataset query={orders} empty="Chưa có yêu cầu trong nhóm này.">
            {(items) => (
              <>
                {items.map((order) => (
                  <Panel
                    key={order.id}
                    title={`Phòng ${order.roomNumber}`}
                    subtitle={vnTime(order.requestedAt)}
                  >
                    <Chip style={{ alignSelf: "flex-start" }}>
                      {statusLabels[order.status] || order.status}
                    </Chip>
                    {(order.items || []).map((item) => (
                      <View key={item.serviceId} style={{ gap: 3 }}>
                        <Text>
                          {item.name} × {item.quantity} {item.unit} ·{" "}
                          {vnMoney(item.unitPrice * item.quantity)}
                        </Text>
                        {!!item.notes && (
                          <Text style={styles.muted}>{item.notes}</Text>
                        )}
                      </View>
                    ))}
                    {!!order.notes && <Text>Ghi chú: {order.notes}</Text>}
                    <Text variant="titleMedium">Tổng: {vnMoney(order.total)}</Text>
                    {!!order.startedAt && (
                      <Text style={styles.muted}>
                        Bắt đầu: {vnTime(order.startedAt)}
                      </Text>
                    )}
                    {!!order.completedAt && (
                      <Text style={styles.muted}>
                        Hoàn thành: {vnTime(order.completedAt)} · Đã ghi phí vào
                        lượt lưu trú.
                      </Text>
                    )}
                    {order.status === "PENDING" && (
                      <ActionButton
                        name={`${orderAction}-status`}
                        body={{ id: order.id, status: "PREPARING" }}
                      >
                        {special ? "Bắt đầu hỗ trợ" : "Bắt đầu chuẩn bị"}
                      </ActionButton>
                    )}
                    {order.status === "PREPARING" && (
                      <ActionButton
                        name={`${orderAction}-status`}
                        body={{ id: order.id, status: "COMPLETED" }}
                      >
                        Hoàn thành & ghi phí
                      </ActionButton>
                    )}
                    {["PENDING", "PREPARING"].includes(order.status) && (
                      <ActionButton
                        name={`${orderAction}-status`}
                        body={{ id: order.id, status: "CANCELLED" }}
                        mode="outlined"
                      >
                        Hủy yêu cầu
                      </ActionButton>
                    )}
                  </Panel>
                ))}
              </>
            )}
          </Dataset>
          <Pager page={page} setPage={setPage} count={orders.data?.length || 0} />
        </>
      ) : (
        <>
          <Button
            mode="contained"
            icon="plus"
            onPress={() => {
              mutation.reset();
              setCatalogueForm({ name: "", unit: special ? "lượt" : "phần", price: 0, enabled: true });
            }}
          >
            {special ? "Thêm dịch vụ hỗ trợ" : "Thêm món ăn / thức uống"}
          </Button>
          <Field label="Tìm trong danh mục" value={catalogueSearch} onChangeText={setCatalogueSearch} />
          <Dataset query={catalogue} empty="Admin chưa thiết lập danh mục.">
            {(items) =>
              items
                .filter((item) => item.name.toLocaleLowerCase("vi").includes(catalogueSearch.toLocaleLowerCase("vi")))
                .map((item) => (
                  <Panel key={item.id} title={item.name}>
                    <Text>{vnMoney(item.price)} / {item.unit}</Text>
                    <Text>{item.enabled ? "Đang cung cấp" : "Đã ngừng cung cấp"}</Text>
                    <Button onPress={() => {
                      mutation.reset();
                      setCatalogueForm({ ...item });
                    }}>Chỉnh sửa</Button>
                  </Panel>
                ))
            }
          </Dataset>
        </>
      )}

      <Dialog
        title={special ? "Thiết lập dịch vụ hỗ trợ" : "Thiết lập món ăn / thức uống"}
        visible={!!catalogueForm}
        onDismiss={() => setCatalogueForm(null)}
      >
        {catalogueForm && (
          <>
            <Field label="Tên" value={catalogueForm.name} onChangeText={(name) => setCatalogueForm({ ...catalogueForm, name })} />
            <Field label="Đơn vị tính" value={catalogueForm.unit} onChangeText={(unit) => setCatalogueForm({ ...catalogueForm, unit })} />
            <Field label="Đơn giá VND" keyboardType="numeric" value={catalogueForm.price} onChangeText={(price) => setCatalogueForm({ ...catalogueForm, price: Number(price) })} />
            <Select label="Cung cấp" value={catalogueForm.enabled} onChange={(enabled) => setCatalogueForm({ ...catalogueForm, enabled })} options={[{ value: true, label: "Đang cung cấp" }, { value: false, label: "Ngừng cung cấp" }]} />
            <ErrorMessage error={mutation.error} />
            <Button mode="contained" loading={mutation.isPending} disabled={mutation.isPending || catalogueForm.name.trim().length < 2 || !catalogueForm.unit.trim() || !Number.isSafeInteger(catalogueForm.price) || catalogueForm.price < 0} onPress={() => mutation.mutate({ name: itemAction, body: { ...catalogueForm, ...scope } }, { onSuccess: () => setCatalogueForm(null) })}>Lưu danh mục</Button>
          </>
        )}
      </Dialog>

      <Dialog title={special ? "Tạo yêu cầu hỗ trợ" : "Tạo đơn ăn uống"} visible={!!orderForm} onDismiss={() => setOrderForm(null)}>
        {orderForm && (
          <>
            <Dataset query={stays} empty="Chưa có khách đang lưu trú.">
              {(items) => <Select label="Lượt lưu trú" value={orderForm.stayId} onChange={(stayId) => setOrderForm({ ...orderForm, stayId })} options={items.filter((stay) => stay.status === "OPEN").map((stay) => ({ value: stay.id, label: `Phòng ${stay.number || stay.roomNumber || "—"} · ${stay.customerName || "Khách lưu trú"}` }))} />}
            </Dataset>
            <Field label={special ? "Tìm dịch vụ hỗ trợ" : "Tìm món ăn / thức uống"} value={serviceSearch} onChangeText={setServiceSearch} />
            <Dataset query={catalogue} empty="Chưa có danh mục. Admin cần thêm mục và đơn giá trước.">
              {() => (
                <>
                  <Select label={special ? "Dịch vụ" : "Món ăn / thức uống"} value={selectedServiceId} onChange={setSelectedServiceId} options={availableItems.filter((item) => item.name.toLocaleLowerCase("vi").includes(serviceSearch.toLocaleLowerCase("vi"))).map((item) => ({ value: item.id, label: `${item.name} · ${vnMoney(item.price)}/${item.unit}` }))} />
                  {!availableItems.length && <Text>Danh mục hiện chưa có mục nào đang cung cấp.</Text>}
                  <Button disabled={!selectedServiceId || cart.length >= 30} onPress={() => {
                    const selected = availableItems.find((item) => item.id === selectedServiceId);
                    if (!selected) return;
                    const old = cart.find((item) => item.serviceId === selected.id);
                    if (old) changeCart(selected.id, { quantity: Math.min(1000, old.quantity + 1) });
                    else setOrderForm({ ...orderForm, items: [...cart, { serviceId: selected.id, name: selected.name, price: selected.price, unit: selected.unit, quantity: 1, notes: "" }] });
                  }}>Thêm vào yêu cầu</Button>
                </>
              )}
            </Dataset>
            {cart.map((item) => (
              <Panel key={item.serviceId} title={item.name}>
                <Text>{vnMoney(item.price)} / {item.unit}</Text>
                <Field label="Số lượng" value={item.quantity} keyboardType="numeric" onChangeText={(value) => changeCart(item.serviceId, { quantity: Number(value) })} />
                <Field label="Ghi chú cho mục này" value={item.notes} maxLength={300} onChangeText={(notes) => changeCart(item.serviceId, { notes })} />
                <Button onPress={() => setOrderForm({ ...orderForm, items: cart.filter((other) => other.serviceId !== item.serviceId) })}>Bỏ mục này</Button>
              </Panel>
            ))}
            <Field label="Ghi chú yêu cầu" value={orderForm.notes} multiline maxLength={1000} onChangeText={(notes) => setOrderForm({ ...orderForm, notes })} />
            <Text variant="titleMedium">Dự tính: {vnMoney(cartTotal)}</Text>
            <Text style={styles.muted}>Đơn giá được lưu khi tạo yêu cầu. Phí chỉ được cộng vào hóa đơn sau khi hoàn thành; yêu cầu hủy không tính phí.</Text>
            <ErrorMessage error={mutation.error} />
            <Button mode="contained" loading={mutation.isPending} disabled={mutation.isPending || !orderForm.stayId || !cart.length || cart.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) || cartTotal > 1000000000} onPress={() => mutation.mutate({ name: orderAction, body: { ...scope, stayId: orderForm.stayId, notes: orderForm.notes, items: cart.map(({ serviceId, quantity, notes }) => ({ serviceId, quantity, notes })) } }, { onSuccess: () => setOrderForm(null) })}>Xác nhận tạo yêu cầu</Button>
          </>
        )}
      </Dialog>
    </Screen>
  );
}
