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
// Canonical identity shared by phone lookup and transactional booking/check-in.
export function normalizePhone(value) {
  let phone = String(value || "").trim().replace(/[ ()-]/g, "");
  if (phone.startsWith("0084")) phone = "0" + phone.slice(4);
  else if (phone.startsWith("+84")) phone = "0" + phone.slice(3);
  assert(/^\+?\d{8,15}$/.test(phone), "Số điện thoại không hợp lệ", 400);
  return phone;
}
export function expectedDeparture(start, mode) {
  const at = new Date(start);
  assert(Number.isFinite(at.getTime()), "Giờ nhận phòng không hợp lệ", 400);
  if (mode === "HOUR") return new Date(at.getTime() + 3600000);
  if (mode === "DAY") return new Date(at.getTime() + 86400000); // historical stays
  assert(mode === "NIGHT", "Hình thức thuê không hợp lệ", 400);
  const local = new Date(at.getTime() + 7 * 3600000);
  local.setUTCHours(12, 0, 0, 0);
  if (local.getTime() - 7 * 3600000 <= at.getTime())
    local.setUTCDate(local.getUTCDate() + 1);
  return new Date(local.getTime() - 7 * 3600000);
}
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
    const due = expectedDeparture(start, "NIGHT").getTime();
    const extraMinutes = Math.max(0, (new Date(end).getTime() - due) / 60000);
    const fullNights = Math.floor(extraMinutes / 1440);
    units = 1 + fullNights;
    const lateHours = Math.ceil(
      Math.max(0, extraMinutes - fullNights * 1440 - rate.graceMinutes) / 60,
    );
    surcharge = lateHours * rate.extraHour;
    // A partial extra day never costs more than one additional night.
    if (lateHours && surcharge >= rate.night) {
      units += 1;
      surcharge = 0;
    }
    base = units * rate.night;
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
