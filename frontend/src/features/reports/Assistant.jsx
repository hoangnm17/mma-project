import React, { useState } from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Text, Button } from "react-native-paper";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../core/api";
import { Screen, Panel, Field, Select, Dataset, useResource, ErrorMessage, vnMoney } from "../../core/ui";
import { Icon, IconTile } from "../../core/visuals";
import { palette, spacing, radii, typography } from "../../core/theme";
import { useSession } from "../../core/session";

const shortDate = date => new Date(date + "T12:00:00+07:00").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const changeText = value => value == null ? "Chưa có kỳ trước để so sánh" : `${value > 0 ? "+" : ""}${value}% so với bình quân kỳ trước`;

function ForecastResult({ data }) {
  const [expanded, setExpanded] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 600 && fontScale <= 1.3;
  if (!data.available) return <Panel title="Chưa đủ dữ liệu dự báo" icon="chart-timeline-variant"><Text>{data.message}</Text></Panel>;
  const preview = data.days.slice(0, 7);
  const maximum = Math.max(1, ...preview.map(day => day.revenue));
  const summary = data.summary || {
    totalRevenue: data.days.reduce((sum, day) => sum + day.revenue, 0),
    totalDemand: data.days.reduce((sum, day) => sum + day.demand, 0),
    peakDate: [...data.days].sort((a, b) => b.demand - a.demand)[0]?.date,
  };
  return <>
    <View style={[s.metrics, wide && s.metricsWide]}>
      <View style={s.primaryMetric}>
        <Text style={s.onDarkLabel}>DOANH THU ƯỚC TÍNH · {data.days.length} NGÀY</Text>
        <Text style={s.forecastValue}>{vnMoney(summary.totalRevenue)}</Text>
        <Text style={s.onDarkBody}>{changeText(summary.revenueChangePercent)}</Text>
      </View>
      <View style={s.secondaryMetric}>
        <IconTile name="account-arrow-right-outline" tone="blue" size={40} />
        <Text style={s.demandValue}>{summary.totalDemand} lượt nhận phòng</Text>
        <Text style={s.caption}>Dự kiến cao điểm: {summary.peakDate ? shortDate(summary.peakDate) : "—"}</Text>
        <Text style={s.caption}>{changeText(summary.demandChangePercent)}</Text>
      </View>
    </View>
    <Panel title="Nhìn trước 7 ngày" subtitle="Doanh thu ước tính theo ngày" icon="chart-bar">
      {fontScale <= 1.3 && <View style={s.chart}>
        {preview.map(day => <View key={day.date} style={s.chartColumn} accessible accessibilityLabel={`${shortDate(day.date)}: ${vnMoney(day.revenue)}, ${day.demand} lượt nhận phòng ước tính`}>
          <View style={s.chartTrack}><View style={[s.chartBar, { height: Math.max(4, day.revenue / maximum * 96) }]} /></View>
          <Text style={s.chartLabel}>{shortDate(day.date)}</Text>
        </View>)}
      </View>}
      <Text style={s.caption}>Mỗi cột là một ngày. Số liệu và khoảng tham khảo ở bên dưới.</Text>
      {(expanded ? data.days : preview).map(day => <View key={day.date} style={s.dayRow}>
        <View style={s.dayHeading}><Text style={s.dayDate}>{shortDate(day.date)}</Text><Text style={s.dayDemand}>{day.demand} lượt</Text></View>
        <View style={s.dayValues}>
          <Text style={s.dayRevenue}>{vnMoney(day.revenue)}</Text>
          {day.revenueRange && <Text style={s.caption}>Tham khảo: {vnMoney(day.revenueRange.low)} – {vnMoney(day.revenueRange.high)}</Text>}
          {day.demandRange && <Text style={s.caption}>Nhu cầu tham khảo: {day.demandRange.low}–{day.demandRange.high} lượt</Text>}
        </View>
      </View>)}
      {data.days.length > 7 && <Button mode="outlined" icon={expanded ? "chevron-up" : "chevron-down"} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} contentStyle={s.buttonContent}>
        {expanded ? "Thu gọn còn 7 ngày" : `Xem đủ ${data.days.length} ngày`}
      </Button>}
    </Panel>
    <Panel title="Độ tin cậy của dự báo" icon="shield-check-outline">
      <Text>{data.historyDays} ngày lịch sử · Kiểm thử trên {data.backtest.days} ngày gần nhất</Text>
      <Text style={s.caption}>Sai số trung bình: {vnMoney(data.backtest.revenueMAE)}/ngày và {data.backtest.demandMAE} lượt nhận phòng/ngày.</Text>
      <Text style={s.caption}>Mô hình xét ngày trong tuần và xu hướng gần đây. Khoảng tham khảo được mở rộng theo sai số và thời hạn dự báo, không phải xác suất bảo đảm. Sự kiện, giá mới và thị trường có thể làm kết quả thay đổi.</Text>
      {data.lastObservedDate && <Text style={s.caption}>Dữ liệu đến hết {shortDate(data.lastObservedDate)}. Không phải cam kết doanh thu.</Text>}
    </Panel>
  </>;
}

export default function Assistant() {
  const [question, setQuestion] = useState("");
  const [days, setDays] = useState(7);
  const { session } = useSession();
  const admin = session.user.role === "Admin";
  const forecast = useResource("forecast", { days });
  const ai = useMutation({ mutationFn: async text => (await api.post("/ai/manager", { question: text })).data });
  const suggestions = [
    { label: "Tuần tới có đông khách?", text: "Dự báo nhu cầu nhận phòng 7 ngày tới và ngày cao điểm là ngày nào?", icon: "calendar-week" },
    { label: "Lên kế hoạch tháng tới", text: "Dự báo nhu cầu nhận phòng 30 ngày tới để chuẩn bị nhân sự.", icon: "calendar-month-outline" },
    ...(admin ? [{ label: "Doanh thu 7 ngày tới", text: "Dự báo doanh thu và nhu cầu 7 ngày tới từ dữ liệu đang lưu trong hệ thống, kèm sai số dự báo.", icon: "chart-timeline-variant" },
      { label: "Doanh thu và công nợ", text: "Doanh thu, thực thu và công nợ hiện tại là bao nhiêu?", icon: "wallet-outline" }] : []),
    { label: "Tình hình phòng hôm nay", text: "Hiện có bao nhiêu phòng đang có khách, sắp nhận và sắp trả hôm nay?", icon: "bed-outline" },
  ];
  function editQuestion(text) { setQuestion(text); ai.reset(); }
  return <Screen title="Trợ lý & dự báo" subtitle="Chuẩn bị cho những ngày sắp tới" onRefresh={forecast.refetch} refreshing={forecast.isRefetching}>
    <Panel title="Hỏi trợ lý StayFlow" subtitle="Chọn gợi ý hoặc viết câu hỏi của bạn" icon="creation-outline">
      <View style={s.suggestions}>
        {suggestions.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label}
          accessibilityHint={item.text} disabled={ai.isPending} onPress={() => editQuestion(item.text)}
          style={({ pressed }) => [s.suggestion, (pressed || question === item.text) && s.suggestionSelected, ai.isPending && { opacity: 0.5 }]}
          accessibilityState={{ selected: question === item.text, disabled: ai.isPending }}>
          <Icon name={item.icon} size={20} /><Text style={s.suggestionLabel}>{item.label}</Text>
        </Pressable>)}
      </View>
      <Field label="Câu hỏi của bạn" multiline value={question} editable={!ai.isPending} onChangeText={editQuestion} />
      <Button mode="contained" icon="send-outline" contentStyle={s.buttonContent} loading={ai.isPending}
        disabled={ai.isPending || question.trim().length < 3} onPress={() => ai.mutate(question.trim())}>Hỏi trợ lý</Button>
      <ErrorMessage error={ai.error} />
      {ai.data && <View style={s.answer} accessibilityLiveRegion="polite"><Text style={s.answerTitle}>Trợ lý trả lời</Text><Text selectable style={s.answerBody}>{ai.data.message}</Text></View>}
      <Text style={s.caption}>Gợi ý chỉ điền câu hỏi; bấm “Hỏi trợ lý” để gửi. Trợ lý chỉ đọc dữ liệu được cấp quyền. Dự báo bên dưới vẫn hoạt động khi AI chưa được cấu hình.</Text>
    </Panel>
    <Select label="Thời gian dự báo" value={days} onChange={setDays} options={[{ value: 7, label: "7 ngày tới" }, { value: 30, label: "30 ngày tới" }]} />
    <Dataset query={forecast}>{data => <ForecastResult key={days} data={data} />}</Dataset>
  </Screen>;
}

const s = StyleSheet.create({
  caption: { ...typography.bodyMedium, color: palette.muted },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  suggestion: { flexGrow: 1, flexBasis: "44%", minHeight: 60, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md },
  suggestionSelected: { backgroundColor: palette.mint, borderColor: palette.teal },
  suggestionLabel: { ...typography.labelLarge, color: palette.ink, flex: 1 },
  buttonContent: { minHeight: 48 },
  answer: { backgroundColor: palette.mint, padding: spacing.lg, gap: spacing.sm, borderRadius: radii.md },
  answerTitle: { ...typography.titleMedium, color: palette.success },
  answerBody: { ...typography.bodyLarge, color: palette.ink },
  notice: { backgroundColor: palette.amber, borderRadius: radii.md, padding: spacing.lg, flexDirection: "row", gap: spacing.md, alignItems: "center" },
  noticeText: { ...typography.bodyMedium, color: palette.warning, flex: 1 },
  metrics: { gap: spacing.md },
  metricsWide: { flexDirection: "row", alignItems: "stretch" },
  primaryMetric: { flex: 1, backgroundColor: palette.ink, borderRadius: radii.lg, padding: spacing.xl, gap: spacing.md },
  secondaryMetric: { flex: 1, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radii.lg, padding: spacing.xl, gap: spacing.sm },
  onDarkLabel: { ...typography.labelMedium, color: palette.inverseMuted },
  forecastValue: { ...typography.headlineMedium, color: palette.surface, fontVariant: ["tabular-nums"] },
  onDarkBody: { ...typography.bodyMedium, color: palette.inverseMuted },
  demandValue: { ...typography.titleLarge, color: palette.ink },
  chart: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  chartColumn: { flex: 1, minWidth: 0, alignItems: "center", gap: spacing.sm },
  chartTrack: { width: "100%", height: 96, justifyContent: "flex-end", backgroundColor: palette.canvas, borderRadius: radii.sm, overflow: "hidden" },
  chartBar: { width: "100%", backgroundColor: palette.teal, borderRadius: radii.sm },
  chartLabel: { ...typography.labelMedium, color: palette.muted, fontSize: 11, letterSpacing: 0 },
  dayRow: { borderTopWidth: 1, borderColor: palette.line, paddingTop: spacing.md, gap: spacing.sm },
  dayHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  dayDate: { ...typography.titleMedium, color: palette.ink },
  dayDemand: { ...typography.labelLarge, color: palette.info },
  dayValues: { gap: spacing.xs },
  dayRevenue: { ...typography.titleMedium, color: palette.teal, fontVariant: ["tabular-nums"] },
});
