import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Text, Button } from "react-native-paper";
import { useSession } from "../../core/session";
import { Screen, Panel, Dataset, useResource, vnMoney, DateTimeField, ErrorMessage, Dialog, Select } from "../../core/ui";
import { api } from "../../core/api";
import { exportCsv } from "../../core/export";
import { IconTile, StatCard, palette, visualStyles } from "../../core/visuals";

export default function Dashboard({ navigate }) {
  const [range, setRange] = useState({});
  const [period, setPeriod] = useState("ALL");
  const [custom, setCustom] = useState(false), [details, setDetails] = useState(false);
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const { session } = useSession();
  const isAdmin = session.user.role === "Admin";
  const q = useResource("dashboard", range);
  const notifications = useResource("notifications");
  function choosePeriod(value) {
    if (value === "CUSTOM") { setCustom(true); return; }
    setPeriod(value);
    if (value === "ALL") { setRange({}); return; }
    const local = new Date(Date.now() + 7 * 3600000);
    const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
    const month = value === "MONTH";
    setRange({ from: new Date(Date.UTC(y, m, month ? 1 : d) - 7 * 3600000).toISOString(),
      to: new Date(Date.UTC(y, month ? m + 1 : m, month ? 1 : d + 1) - 7 * 3600000).toISOString() });
  }
  async function download() {
    setBusy(true); setError(null);
    try { const { data } = await api.get("/reports.csv", { params: range, responseType: "text" }); await exportCsv(data); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }
  return <Screen title="Tổng quan" onRefresh={q.refetch} refreshing={q.isRefetching}
    header={<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <View><Text style={{ fontSize: 26, fontWeight: "800", color: palette.ink }}>Tổng quan</Text>
        <Text style={visualStyles.caption}>{session.user.name}</Text></View>
      <Button icon="bell-outline" onPress={() => navigate("notifications")}>
        {notifications.data?.filter(item => !item.isRead).length || ""}
      </Button>
    </View>}>
    <View style={{ flexDirection: "row", gap: 8 }}>
      {[["Nhận phòng", "key-outline", "rooms"], ["Trả phòng", "logout-variant", "stays"], ["Đặt phòng", "calendar-plus", "bookings"], ["Dọn phòng", "broom", "housekeeping"]].map(([label, icon, screen]) =>
        <Pressable key={screen} accessibilityRole="button" accessibilityLabel={label} onPress={() => navigate(screen)}
          style={{ flex: 1, alignItems: "center", gap: 8, paddingVertical: 12, backgroundColor: "white", borderRadius: 16 }}>
          <IconTile name={icon} size={40} /><Text style={{ fontSize: 11, color: palette.ink }}>{label}</Text>
        </Pressable>)}
    </View>
    <Dataset query={q}>{data => <>
      <View style={visualStyles.grid}>
        <StatCard icon="bed-outline" value={data.roomCounts?.READY ?? 0} label="Phòng trống" onPress={() => navigate("rooms")} />
        <StatCard icon="account-key-outline" value={data.occupied} label="Đang có khách" tone="blue" />
        <StatCard icon="broom" value={data.roomCounts?.DIRTY ?? 0} label="Cần dọn" tone="amber" onPress={() => navigate("housekeeping")} />
        <StatCard icon="tools" value={data.roomCounts?.MAINTENANCE ?? 0} label="Bảo trì" tone="rose" onPress={() => navigate("incidents")} />
      </View>
      <Panel title="Hôm nay">
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Text style={{ flex: 1 }}>Sắp nhận: {data.arrivals}</Text><Text style={{ flex: 1 }}>Sắp trả: {data.departures}</Text>
        </View>
        {(data.pending > 0 || data.verifying > 0) && <Button icon="broom" onPress={() => navigate("housekeeping")}>
          {data.pending} việc chờ · {data.verifying} việc cần kiểm tra
        </Button>}
      </Panel>
      {isAdmin && <>
        <Select label="Tài chính" value={period} onChange={choosePeriod} options={[
          { value: "DAY", label: "Hôm nay" }, { value: "MONTH", label: "Tháng này" },
          { value: "ALL", label: "Tất cả" }, { value: "CUSTOM", label: "Chọn ngày" },
        ]} />
        <Panel>
          <Text style={visualStyles.caption}>DOANH THU</Text>
          <Text style={{ fontSize: 30, fontWeight: "800", color: palette.teal }}>{vnMoney(data.revenue)}</Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={{ flex: 1 }}><Text style={visualStyles.caption}>Thực thu</Text><Text style={{ fontWeight: "700" }}>{vnMoney(data.collected)}</Text></View>
            <View style={{ flex: 1 }}><Text style={visualStyles.caption}>Còn thu</Text><Text style={{ fontWeight: "700", color: data.debt > 0 ? "#A46F16" : palette.ink }}>{vnMoney(data.debt)}</Text></View>
          </View>
          <View style={{ flexDirection: "row" }}><Button onPress={() => setDetails(true)}>Chi tiết</Button><Button icon="download-outline" loading={busy} disabled={busy} onPress={download}>Xuất CSV</Button></View>
          <ErrorMessage error={error} />
        </Panel>
        <Dialog title="Chọn thời gian" visible={custom} onDismiss={() => setCustom(false)}>
          <DateTimeField label="Từ" value={from} onChangeText={setFrom} />
          <DateTimeField label="Đến trước" value={to} onChangeText={setTo} />
          <Button mode="contained" disabled={!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || new Date(to) <= new Date(from)}
            onPress={() => { setPeriod("CUSTOM"); setRange({ from, to }); setCustom(false); }}>Áp dụng</Button>
        </Dialog>
        <Dialog title="Báo cáo" visible={details} onDismiss={() => setDetails(false)}>
          <Text style={visualStyles.caption}>{range.from ? `${new Date(range.from).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} → ${new Date(range.to).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : "Toàn bộ thời gian"}</Text>
          {Object.entries({ ROOM: "Tiền phòng", SERVICE: "Dịch vụ", FOOD: "Ăn uống", SPECIAL: "Hỗ trợ riêng" }).map(([key, label]) =>
            <View key={key} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text>{label}</Text><Text>{vnMoney(data.report?.bySource[key])}</Text></View>)}
          <Text>Hóa đơn: {data.report?.invoiceCounts.PAID || 0} đã trả · {data.report?.invoiceCounts.PARTIAL || 0} trả một phần · {data.report?.invoiceCounts.UNPAID || 0} chưa trả</Text>
          <Text>Nhận: {data.report?.arrivals || 0} · Trả: {data.report?.departures || 0}</Text>
          <Text>Lưu trú trung bình: {Number(data.report?.averageStayHours || 0).toFixed(1)} giờ</Text>
          <Text>Công suất: {Number(data.report?.occupancyRate || 0).toFixed(1)}%</Text>
          {!!data.unpaidInvoices?.length && <Button icon="receipt-text-outline" onPress={() => { setDetails(false); navigate("invoices"); }}>Xem hóa đơn còn nợ</Button>}
          <Text style={visualStyles.caption}>Doanh thu theo ngày chốt; thực thu theo ngày thu/hoàn tiền.</Text>
        </Dialog>
      </>}
    </>}</Dataset>
  </Screen>;
}
