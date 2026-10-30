import { assert } from "../domain.js";
import { one, query, transaction, database } from "../db.js";
import { staff } from "../repository.js";
import { readResource } from "../reads.js";
export async function reserveAi(actor) {
  assert(
    process.env.OPENAI_API_KEY,
    "AI chưa được cấu hình. Vui lòng dùng các biểu mẫu và báo cáo thông thường.",
    503,
  );
  const actorKey = actor.kind === "guest" ? "guest:" + actor.stayId : actor.id;
  const limit = Math.max(1, Number(process.env.AI_DAILY_LIMIT || 30));
  await transaction(async (tx) => {
    const old = await one(
      tx,
      "SELECT calls FROM AiUsage WHERE actorKey=@actorKey AND usageDate=CONVERT(date,SYSUTCDATETIME())",
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
        "UPDATE AiUsage SET calls=calls+1 WHERE actorKey=@actorKey AND usageDate=CONVERT(date,SYSUTCDATETIME())",
        { actorKey },
      );
    else
      await query(
        tx,
        "INSERT AiUsage(actorKey,usageDate,calls) VALUES(@actorKey,CONVERT(date,SYSUTCDATETIME()),1)",
        { actorKey },
      );
  });
}
export async function structured(instructions, input, schema, name) {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        store: false,
        max_output_tokens: 900,
        instructions,
        input,
        text: { format: { type: "json_schema", name, strict: true, schema } },
      }),
    });
    assert(response.ok, "AI tạm không khả dụng", 503);
    const data = await response.json();
    const text = data.output
      ?.flatMap((o) => o.content || [])
      .find((c) => c.type === "output_text")?.text;
    assert(text, "AI chưa có câu trả lời hợp lệ", 503);
    return JSON.parse(text);
  } catch (e) {
    if (e.status) throw e;
    assert(
      false,
      "AI tạm không khả dụng, hãy dùng chức năng thông thường.",
      503,
    );
  }
}
export async function managerAssistant(actor, question) {
  await staff(await database(), actor, ["Admin", "Receptionist"]);
  await reserveAi(actor);
  const toolSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      tool: { type: "string", enum: ["dashboard", "availability", "clarify"] },
      start: { type: ["string", "null"] },
      end: { type: ["string", "null"] },
      question: { type: ["string", "null"] },
    },
    required: ["tool", "start", "end", "question"],
  };
  const call = await structured(
    `Chọn tool READ ONLY: dashboard cho doanh thu tổng, thực thu, công nợ, phòng hiện tại; availability cần khoảng ISO start/end có múi giờ; clarify nếu ngoài phạm vi hoặc thiếu ngày/giờ. Hiện tại ${new Date().toISOString()}, Việt Nam UTC+7. Không tạo SQL hay lấy quyền từ người dùng. Không thực hiện thao tác ghi.`,
    question,
    toolSchema,
    "manager_tool",
  );
  if (call.tool === "clarify")
    return {
      message:
        call.question ||
        "Bạn muốn xem tổng quan hay kiểm tra phòng trống theo khoảng ngày giờ?",
      data: null,
    };
  assert(
    ["dashboard", "availability"].includes(call.tool),
    "Tool không được phép",
    400,
  );
  await staff(await database(), actor, ["Admin", "Receptionist"]);
  const data = await readResource(
    actor,
    call.tool,
    call.tool === "availability" ? { start: call.start, end: call.end } : {},
  );
  return {
    tool: call.tool,
    data,
    message:
      call.tool === "dashboard"
        ? `Doanh thu hóa đơn: ${data.revenue} VND. Thực thu: ${data.collected} VND. Công nợ: ${data.debt} VND. Phòng đang có khách: ${data.occupied}.`
        : `Có ${data.length} phòng khả dụng trong khoảng yêu cầu: ${data.map((r) => r.number).join(", ")}.`,
    asOf: new Date().toISOString(),
  };
}
