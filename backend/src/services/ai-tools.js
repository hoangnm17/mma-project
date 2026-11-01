import { assert } from "../domain.js";
import { one, query, transaction, database } from "../db.js";
import { staff } from "../repository.js";
import { readResource } from "../reads.js";
import { aiConfigured, providerStructured } from "./ai-provider.js";
export async function reserveAi(actor) {
  assert(
    aiConfigured(),
    "AI chưa được cấu hình. Vui lòng dùng các biểu mẫu và báo cáo thông thường.",
    503,
  );
  const actorKey = actor.kind === "guest" ? "guest:" + actor.stayId : actor.id;
  const limit = Math.max(1, Number(process.env.AI_DAILY_LIMIT || 30));
  await transaction(async (tx) => {
    const old = await one(
      tx,
      (p) => ({
        collection: "AiUsage",
        filter: {
          $and: [
            { actorKey: p.actorKey },
            { usageDate: new Date().toISOString().slice(0, 10) },
          ],
        },
        project: { calls: 1 },
      }),
      { actorKey },
    );
    assert(
      !old || old.calls < limit,
      "Đã đạt giới hạn AI trong ngày. Vui lòng dùng form thường.",
      429,
    );
    if (old)
      await query(
        tx,
        (p) => ({
          collection: "AiUsage",
          filter: {
            $and: [
              { actorKey: p.actorKey },
              { usageDate: new Date().toISOString().slice(0, 10) },
            ],
          },
          update: { $inc: { calls: 1 } },
        }),
        { actorKey },
      );
    else
      await query(
        tx,
        (p) => ({
          collection: "AiUsage",
          insert: {
            actorKey: p.actorKey,
            usageDate: new Date().toISOString().slice(0, 10),
            calls: 1,
          },
        }),
        { actorKey },
      );
  });
}
export async function structured(instructions, input, schema, name) {
  return providerStructured(instructions, input, schema, name);
}
export async function managerAssistant(actor, question) {
  await staff(await database(), actor, ["Admin", "Receptionist"]);
  await reserveAi(actor);
  const toolSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      tool: { type: "string", enum: ["dashboard", "availability", "forecast", "clarify"] },
      days: { type: ["integer", "null"], enum: [7, 30, null] },
      start: { type: ["string", "null"] },
      end: { type: ["string", "null"] },
      question: { type: ["string", "null"] },
    },
    required: ["tool", "days", "start", "end", "question"],
  };
  const call = await structured(
    `Chọn tool READ ONLY: dashboard cho doanh thu tổng, thực thu, công nợ, phòng hiện tại; availability cần khoảng ISO start/end có múi giờ; forecast cho dự đoán doanh thu/nhu cầu tương lai, days=7 cho tuần tới hoặc mặc định, days=30 cho tháng tới. Các tool khác days=null. clarify nếu ngoài phạm vi hoặc thiếu ngày/giờ; không tự bịa số dự báo. Hiện tại ${new Date().toISOString()}, Việt Nam UTC+7. Không tạo SQL hay lấy quyền từ người dùng. Không thực hiện thao tác ghi.`,
    question,
    toolSchema,
    "manager_tool",
  );
  if (call.tool === "clarify")
    return {
      message:
        call.question ||
        "Bạn muốn xem tổng quan, dự báo 7/30 ngày tới hay kiểm tra phòng trống theo khoảng ngày giờ?",
      data: null,
    };
  assert(
    ["dashboard", "availability", "forecast"].includes(call.tool),
    "Tool không được phép",
    400,
  );
  await staff(await database(), actor, ["Admin", "Receptionist"]);
  const data = await readResource(
    actor,
    call.tool,
    call.tool === "availability" ? { start: call.start, end: call.end } : call.tool === "forecast" ? { days: call.days ?? 7 } : {},
  );
  if (call.tool === "forecast") {
    const money = value => Number(value).toLocaleString("vi-VN") + " ₫";
    return { tool: "forecast", data, asOf: new Date().toISOString(),
      message: data.available
        ? `${data.simulated ? "Dự báo có sử dụng dữ liệu demo. " : ""}${data.days.length} ngày tới: doanh thu ước tính ${money(data.summary.totalRevenue)}, khoảng ${data.summary.totalDemand} lượt nhận phòng. Ngày có nhu cầu cao nhất: ${data.summary.peakDate}. Sai số doanh thu trung bình khi kiểm thử: ${money(data.backtest.revenueMAE)}/ngày. Đây là dự báo thống kê từ lịch sử, không phải cam kết; xem khoảng tham khảo ở phần dự báo.`
        : data.message };
  }
  return {
    tool: call.tool,
    data,
    message:
      call.tool === "dashboard"
        ? actor.role === "Admin"
          ? `Doanh thu hóa đơn: ${data.revenue} VND. Thực thu: ${data.collected} VND. Công nợ: ${data.debt} VND. Phòng đang có khách: ${data.occupied}.`
          : `Phòng đang có khách: ${data.occupied}. Sắp nhận hôm nay: ${data.arrivals}. Sắp trả hôm nay: ${data.departures}.`
        : `Có ${data.length} phòng khả dụng trong khoảng yêu cầu: ${data.map((r) => r.number).join(", ")}.`,
    asOf: new Date().toISOString(),
  };
}
