import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text, Button } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useSession } from "../../core/session";
import { Screen, Panel, Dataset, useResource, vnMoney } from "../../core/ui";
import {
  Icon,
  IconTile,
  StatCard,
  SectionHeading,
  palette,
  visualStyles,
} from "../../core/visuals";
export default function Dashboard({ navigate }) {
  const q = useResource("dashboard");
  const notifications=useResource('notifications');
  const { session } = useSession();
  const firstName = session.user.name.split(" ").at(-1);
  const date = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return (
    <Screen
      title="Tổng quan"
      onRefresh={q.refetch}
      header={
        <View style={s.top}>
          <View style={{flex:1}}>
            <Text style={visualStyles.eyebrow}>STAYFLOW · HÔM NAY</Text>
            <Text style={s.greeting}>
              Xin chào, {firstName} <Text style={{ fontSize: 20 }}>☀</Text>
            </Text>
            <Text style={s.date}>{date}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở thông báo"
            onPress={() => navigate("notifications")}
            style={s.notification}
          >
            <Icon name="bell-outline" color={palette.ink} />
            {notifications.data?.some(n=>!n.isRead)&&<View style={s.notificationDot} />}
          </Pressable>
        </View>
      }
    >
      <Dataset query={q}>
        {(d) => (
          <>
            <LinearGradient
              colors={["#102F43", "#0C686D"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.hero}
            >
              <View style={s.heroCircle} />
              <View style={s.heroHeading}>
                <View style={s.heroPill}>
                  <Icon name="home-heart" size={14} color="#A4E4CF" />
                  <Text style={s.heroPillText}>CHĂM SÓC TỪNG CĂN PHÒNG</Text>
                </View>
                <Icon
                  name="home-city-outline"
                  size={70}
                  color="rgba(255,255,255,.22)"
                />
              </View>
              <Text style={s.heroTitle}>
                Vận hành nhẹ nhàng.{"\n"}Khách ở an tâm.
              </Text>
              <Text style={s.heroCaption}>
                {d.occupied} phòng đang có khách · {d.pending} yêu cầu đang chờ
              </Text>
              <Button
                mode="contained"
                icon="broom"
                buttonColor="#D6F4E7"
                textColor="#105C55"
                contentStyle={{ minHeight: 42 }}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 8,
                  borderRadius: 12,
                }}
                onPress={() => navigate("housekeeping")}
              >
                Điều phối dọn phòng
              </Button>
            </LinearGradient>
            <SectionHeading
              title="Thao tác nhanh"
              subtitle="Sẵn sàng cho một ngày bận rộn"
            />
            <View style={s.quickGrid}>
              {[
                {
                  title: "Nhận phòng",
                  icon: "key-outline",
                  screen: "rooms",
                  tone: "mint",
                },
                {
                  title: "Đặt phòng",
                  icon: "calendar-plus",
                  screen: "bookings",
                  tone: "blue",
                },
                {
                  title: "Dọn phòng",
                  icon: "broom",
                  screen: "housekeeping",
                  tone: "amber",
                },
                {
                  title: "Khách hàng",
                  icon: "account-outline",
                  screen: "customers",
                  tone: "rose",
                },
              ].map((a) => (
                <Pressable
                  key={a.screen}
                  accessibilityRole="button"
                  accessibilityLabel={a.title}
                  onPress={() => navigate(a.screen)}
                  style={s.quick}
                >
                  <IconTile name={a.icon} tone={a.tone} size={46} />
                  <Text style={s.quickLabel}>{a.title}</Text>
                </Pressable>
              ))}
            </View>
            <SectionHeading
              title="Nhịp vận hành"
              subtitle={`${d.departures} lượt dự kiến trả phòng hôm nay`}
              action="Xem phòng"
              onAction={() => navigate("rooms")}
            />
            <View style={visualStyles.grid}>
              <StatCard
                icon="bed-outline"
                label="Phòng đang có khách"
                value={d.occupied}
              />
              <StatCard
                icon="calendar-arrow-right"
                label="Lượt sắp nhận hôm nay"
                value={d.arrivals}
                tone="blue"
              />
              <StatCard
                icon="broom"
                label="Yêu cầu chờ nhận"
                value={d.pending}
                tone="amber"
                onPress={() => navigate("housekeeping")}
              />
              <StatCard
                icon="clipboard-check-outline"
                label="Việc chờ kiểm tra"
                value={d.verifying}
                tone="rose"
                onPress={() => navigate("housekeeping")}
              />
            </View>
            <SectionHeading
              title="Tài chính rõ ràng"
              subtitle="Số liệu tổng hợp từ hóa đơn và phiếu thu"
            />
            <Panel>
              <View style={s.financeTop}>
                <IconTile name="chart-line" size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={s.financeLabel}>DOANH THU ĐÃ CHỐT</Text>
                  <Text style={s.revenue}>{vnMoney(d.revenue)}</Text>
                </View>
              </View>
              <View style={s.financeDivider} />
              <View style={s.financeBottom}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={s.date}>Tiền thực thu</Text>
                  <Text style={s.financeValue}>{vnMoney(d.collected)}</Text>
                </View>
                <View style={{ width: 1, backgroundColor: palette.line }} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={s.date}>Công nợ</Text>
                  <Text
                    style={[
                      s.financeValue,
                      { color: d.debt > 0 ? "#AF7633" : palette.ink },
                    ]}
                  >
                    {vnMoney(d.debt)}
                  </Text>
                </View>
              </View>
              <Text style={s.note}>
                Thực thu gồm tiền cọc; doanh thu tính theo hóa đơn đã chốt.
              </Text>
            </Panel>
            <View style={s.footer}>
              <Icon name="shield-check-outline" size={16} color="#8A9CA6" />
              <Text style={s.footerText}>
                StayFlow · Đồng hành cùng cơ sở của bạn
              </Text>
            </View>
          </>
        )}
      </Dataset>
    </Screen>
  );
}
const s = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 4,
    gap: 12,
  },
  greeting: {
    fontSize: 25,
    fontWeight: "800",
    color: palette.ink,
    letterSpacing: -0.7,
    marginTop: 8,
  },
  date: { fontSize: 12, color: palette.muted, marginTop: 4 },
  notification: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationDot: {
    position: "absolute",
    top: 9,
    right: 11,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ECA65C",
  },
  hero: { borderRadius: 24, padding: 22, overflow: "hidden", gap: 8 },
  heroCircle: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,.035)",
    right: -75,
    bottom: -90,
  },
  heroHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    height: 32,
  },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroPillText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#B6DAD4",
  },
  heroTitle: {
    fontSize: 27,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: "#FFF",
    maxWidth: 285,
  },
  heroCaption: { fontSize: 12, lineHeight: 21, color: "#C8DEDF" },
  quickGrid: { flexDirection: "row", gap: 8 },
  quick: {
    flex: 1,
    alignItems: "center",
    gap: 9,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: palette.line,
    paddingVertical: 15,
    borderRadius: 18,
  },
  quickLabel: { fontSize: 10, fontWeight: "700", color: palette.ink },
  financeTop: { flexDirection: "row", gap: 14, alignItems: "center" },
  financeLabel: {
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "700",
    color: palette.muted,
  },
  revenue: {
    fontSize: 27,
    fontWeight: "800",
    color: palette.ink,
    marginTop: 7,
    letterSpacing: -1,
  },
  financeDivider: {
    height: 1,
    backgroundColor: palette.line,
    marginVertical: 4,
  },
  financeBottom: { flexDirection: "row", gap: 18 },
  financeValue: { fontSize: 18, fontWeight: "700", color: palette.ink },
  note: { fontSize: 10, lineHeight: 17, color: palette.muted, marginTop: 3 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerText: { fontSize: 10, color: "#8A9CA6" },
});
