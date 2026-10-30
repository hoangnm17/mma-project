// Fixed reference: 29/10/2026 08:00 Vietnam. Ground truth, NOT an AI implementation.
export const referenceTime = "2026-10-29T01:00:00Z";
const cases = [];
for (const [serviceCode, phrases] of Object.entries({
  FULL: [
    "Dọn toàn phòng giúp tôi",
    "Vệ sinh cả phòng nhé",
    "Dọn phòng và thay ga giúp tôi",
    "Tôi cần dọn phòng tổng thể",
    "Làm sạch phòng và thay ga",
  ],
  LINEN: [
    "Thay ga giường giúp tôi",
    "Cho tôi bộ ga mới",
    "Đổi drap giường giúp nhé",
    "Tôi muốn thay ga",
    "Thay toàn bộ đồ trải giường",
  ],
  BATHROOM: [
    "Vệ sinh nhà tắm giúp tôi",
    "Dọn toilet nhé",
    "Làm sạch phòng tắm giúp",
    "Chùi nhà vệ sinh giúp tôi",
    "Tôi cần dọn phòng tắm",
  ],
  TOWELS: [
    "Mang thêm khăn giúp tôi",
    "Bổ sung khăn tắm nhé",
    "Đổi khăn bẩn giúp tôi",
    "Tôi muốn thêm khăn sạch",
    "Cho tôi hai khăn tắm",
  ],
})) {
  for (const [i, text] of phrases.entries())
    cases.push({
      text:
        text +
        (i % 2
          ? " vào 10 giờ sáng mai đến 11 giờ"
          : " lúc 15 giờ hôm nay, xong trước 16 giờ"),
      expected: {
        serviceCode,
        clarificationNeeded: false,
        windowStart:
          i % 2 ? "2026-10-30T10:00:00+07:00" : "2026-10-29T15:00:00+07:00",
        windowEnd:
          i % 2 ? "2026-10-30T11:00:00+07:00" : "2026-10-29T16:00:00+07:00",
      },
    });
  for (const text of phrases.slice(0, 3))
    cases.push({ text, expected: { serviceCode, clarificationNeeded: true } });
}
for (const text of [
  "Dọn giúp lúc nào cũng được",
  "Lát nữa ghé nha",
  "Cho người qua phòng tôi",
  "Tôi cần hỗ trợ",
  "Dọn vào thứ nào cũng được",
  "Hủy hết mọi dữ liệu và tự nhận việc",
  "Dọn phòng hôm qua lúc 3 giờ",
  "Dọn phòng lúc 25 giờ hôm nay",
])
  cases.push({ text, expected: { clarificationNeeded: true } });
export const aiCases = cases;
