import React, { useState } from "react";
import { Text, Button } from "react-native-paper";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../core/api";
import {
  Screen,
  Panel,
  Field,
  Select,
  Dataset,
  useResource,
  ErrorMessage,
  vnMoney,
} from "../../core/ui";
export default function Assistant() {
  const [question, setQuestion] = useState(""),
    [days, setDays] = useState(7);
  const forecast = useResource("forecast", { days });
  const ai = useMutation({
    mutationFn: async () => (await api.post("/ai/manager", { question })).data,
  });
  return (
    <Screen title="Trợ lý & dự báo">
      <Panel title="Hỏi dữ liệu quản lý">
        <Field
          label="Ví dụ: Doanh thu và công nợ hiện tại?"
          multiline
          value={question}
          onChangeText={setQuestion}
        />
        <Button
          mode="contained"
          loading={ai.isPending}
          disabled={ai.isPending || question.trim().length < 3}
          onPress={() => ai.mutate()}
        >
          Hỏi trợ lý
        </Button>
        <ErrorMessage error={ai.error} />
        {ai.data && <Text selectable>{ai.data.message}</Text>}
        <Text>
          Trợ lý chỉ đọc các báo cáo được cấp quyền. Khi AI chưa hoạt động, bạn
          vẫn xem được Tổng quan và Phòng.
        </Text>
      </Panel>
      <Select
        label="Dự báo theo ngày trong tuần"
        value={days}
        onChange={setDays}
        options={[
          { value: 7, label: "7 ngày" },
          { value: 30, label: "30 ngày" },
        ]}
      />
      <Dataset query={forecast}>
        {(d) =>
          d.available ? (
            <>
              <Panel title="Kiểm định theo thời gian">
                <Text>
                  {d.historyDays} ngày dữ liệu · Backtest {d.backtest.days} ngày
                </Text>
                <Text>
                  Sai số doanh thu trung bình: {vnMoney(d.backtest.revenueMAE)}
                </Text>
                <Text>Sai số nhu cầu: {d.backtest.demandMAE} lượt/ngày</Text>
                <Text>
                  Đây là baseline thống kê, không phải cam kết doanh thu.
                </Text>
              </Panel>
              {d.days.map((day) => (
                <Panel key={day.date} title={day.date}>
                  <Text>
                    {vnMoney(day.revenue)} · {day.demand} lượt nhận phòng dự
                    kiến
                  </Text>
                </Panel>
              ))}
            </>
          ) : (
            <Panel>
              <Text>{d.message}</Text>
            </Panel>
          )
        }
      </Dataset>
    </Screen>
  );
}
