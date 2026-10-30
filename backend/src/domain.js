import { z } from "zod";
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function assert(ok, message, status = 409) {
  if (!ok) throw new HttpError(status, message);
}
export const money = z.number().int().min(0).max(1000000000);
export const timestamp = z.string().datetime({ offset: true });
export const serviceCodes = ["FULL", "TURNOVER", "LINEN", "BATHROOM", "TOWELS"];
export const checklists = {
  FULL: [
    "Thu gom rác",
    "Thay ga giường",
    "Vệ sinh sàn",
    "Lau bề mặt",
    "Vệ sinh phòng tắm",
    "Kiểm tra vật dụng",
  ],
  TURNOVER: [
    "Thu gom rác",
    "Thay ga giường",
    "Vệ sinh sàn",
    "Vệ sinh phòng tắm",
    "Bổ sung vật dụng",
    "Kiểm tra toàn phòng",
  ],
  LINEN: ["Thay ga giường", "Thu gom đồ vải"],
  BATHROOM: ["Vệ sinh phòng tắm", "Bổ sung giấy"],
  TOWELS: ["Bổ sung khăn", "Thu gom khăn bẩn"],
};
export const policy = {
  hour: 80000,
  day: 350000,
  night: 250000,
  graceMinutes: 15,
  extraHour: 50000,
};
export function priceRoom(rate, start, end, mode) {
  const minutes = (new Date(end) - new Date(start)) / 60000;
  assert(
    Number.isFinite(minutes) && minutes >= 0,
    "Giờ trả phòng không hợp lệ",
    400,
  );
  let units,
    base,
    surcharge = 0;
  if (mode === "HOUR") {
    units = Math.max(
      1,
      Math.ceil(Math.max(0, minutes - rate.graceMinutes) / 60),
    );
    base = units * rate.hour;
  } else if (mode === "DAY") {
    units = Math.max(
      1,
      Math.ceil(Math.max(0, minutes - rate.graceMinutes) / 1440),
    );
    base = units * rate.day;
  } else {
    assert(mode === "NIGHT", "Hình thức thuê không hợp lệ", 400);
    units = 1;
    base = rate.night;
    const local = new Date(new Date(start).getTime() + 7 * 3600000);
    local.setUTCHours(12, 0, 0, 0);
    if (local.getTime() - 7 * 3600000 <= new Date(start).getTime())
      local.setUTCDate(local.getUTCDate() + 1);
    const due = local.getTime() - 7 * 3600000;
    const late = Math.max(
      0,
      (new Date(end).getTime() - due) / 60000 - rate.graceMinutes,
    );
    surcharge = Math.ceil(late / 60) * rate.extraHour;
  }
  const total = base + surcharge;
  assert(
    Number.isSafeInteger(total) && total <= 1000000000,
    "Số tiền vượt giới hạn",
    400,
  );
  return { mode, units, minutes, base, surcharge, total };
}
export function rankCleaners(cleaners, zone, now = new Date()) {
  return cleaners
    .map((c) => {
      const breakdown = {
        version: "rules-v1",
        zoneFit: c.zone === zone ? 1 : 0,
        loadBalance: 1 - Math.min(1, c.workMinutes / 480),
        quality: ((c.ratingSum || 0) + 4 * 5) / ((c.ratingCount || 0) + 5) / 5,
        idleTime: Math.min(
          1,
          Math.max(
            0,
            (now - new Date(c.lastClosedAt || now.getTime() - 3600000)) /
              3600000,
          ),
        ),
      };
      const score =
        100 *
        (0.4 * breakdown.zoneFit +
          0.3 * breakdown.loadBalance +
          0.2 * breakdown.quality +
          0.1 * breakdown.idleTime);
      return { ...c, score, breakdown };
    })
    .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
}
export function validateDraft(value, now = new Date()) {
  const draft = z
    .object({
      serviceCode: z.enum(serviceCodes),
      checklist: z.array(z.string()).max(12),
      requestedDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      windowStart: timestamp.nullable(),
      windowEnd: timestamp.nullable(),
      clarificationNeeded: z.boolean(),
      clarificationQuestion: z.string().nullable(),
    })
    .parse(value);
  draft.checklist = checklists[draft.serviceCode];
  if (
    !draft.windowStart ||
    !draft.windowEnd ||
    new Date(draft.windowStart) < now ||
    new Date(draft.windowEnd) <= new Date(draft.windowStart) ||
    new Date(draft.windowEnd) - now > 7 * 86400000
  ) {
    draft.clarificationNeeded = true;
    draft.clarificationQuestion =
      "Bạn muốn dọn vào ngày nào, từ mấy giờ đến mấy giờ (trong 7 ngày tới)?";
  }
  if (draft.windowStart)
    draft.requestedDate = new Date(
      new Date(draft.windowStart).getTime() + 7 * 3600000,
    )
      .toISOString()
      .slice(0, 10);
  if (draft.clarificationNeeded && !draft.clarificationQuestion)
    draft.clarificationQuestion =
      "Bạn vui lòng nói rõ loại việc và khung giờ mong muốn?";
  return draft;
}
