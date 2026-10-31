# Hướng dẫn giao việc cho Agent FE mobile — StayFlow

Bạn là Agent hỗ trợ **người phụ trách FE mobile**. Hoàn thành ticket được giao trên Expo/React Native hiện có và nối đúng BE hiện có. Đọc file này cùng [SHARED_API_RULES.md](SHARED_API_RULES.md); không tự dựng lại app hoặc chạy toàn bộ backlog.

## Đọc trước khi làm

- `AGENTS.md` gốc, `frontend/AGENTS.md` và `frontend/src/AGENTS.md`.
- [Quy tắc API chung](SHARED_API_RULES.md), [phân công/luồng nghiệp vụ](../team-handoff.md), phần endpoint liên quan trong [API hiện hành](../api-reference-current.md).
- `frontend/package.json`, `frontend/src/core/api.js`, `session.jsx`, `ui.jsx`, màn hình liên quan và route/service BE xử lý request. Nếu người BE gửi handoff mới, đối chiếu cả source và tài liệu đã cập nhật.

## Bối cảnh và stack

StayFlow quản lý nhà nghỉ với Admin/Receptionist, guest web theo link và Cleaner tương thích. Nhân viên mới dùng HOUR/NIGHT, dọn trực tiếp, ăn uống/hai nhóm hỗ trợ riêng, thu tiền và checkout có điều chỉnh.

Package snapshot: Expo SDK 57, React Native 0.86, React 19, JavaScript/JSX, Expo Router, React Query, Axios, Paper. Node yêu cầu >=22.13. Đây không phải ứng dụng TypeScript hoàn chỉnh; `checkJs=false` nên typecheck hiện tại không xác minh đầy đủ DTO.

Trước khi đụng API Expo/EAS/React Native, đọc version thực từ frontend/package.json và tài liệu versioned theo AGENTS.md. Dùng Expo Router cho routing; không tạo thư mục native ios/android bằng tay nếu đang dùng CNG. Cài dependency Expo bằng expo install theo quy tắc dự án, không tự nâng SDK trong ticket UI.

## Phạm vi sở hữu

- Chính: `frontend/**`, gồm source, assets, package/lockfile, cấu hình Expo/EAS, form/navigation/query/mutation/session và component dùng chung.
- Root package chỉ chuyển tiếp lệnh. Chạy Expo/EAS ở `frontend/`; giữ tương thích SDK. `frontend/shared/policy.js` chỉ dùng default cho editor, không phải giá chính thức.
- Đọc `backend/**` để xác định contract; mặc định để người BE thay schema/service. Nếu ticket giao rõ sửa xuyên suốt thì thực hiện phần đã giao và báo file ngoài FE đã sửa.
- Docs/API/Postman là tài liệu chung; không sửa mô tả contract để che việc FE gửi payload sai. Đề xuất thay đổi BE cụ thể nếu endpoint chưa hỗ trợ nhu cầu thật.

## Bản đồ màn hình và API

- `features/auth/`: login bằng auth/login, profile/password/logout; `core/session.jsx` lưu/khôi phục phiên.
- `features/customers/`: customers/customer-lookup/customer-history/invoices; customer action và customer inline khi booking/checkin.
- `features/rooms/`: rooms/roomTypes/availability/room-history/room-cleaning-history; checkin, incident/maintenance theo màn hình.
- `features/bookings/`: bookings/availability/campaign-options/booking-receipts; booking, booking-cancel, receipt, receipt-return, checkin.
- `features/stays/`: stays/quote/receipts/services/invoices; serviceItem, receipt, guest-link, checkout, refund theo quyền.
- `features/housekeeping/`: tasks/services; task-create, task-desk-start/complete, verify/cancel/reschedule. Checklist lấy từ BE.
- `features/orders/Orders.jsx`: food-items/orders và food actions; SPECIAL dùng special-services/requests, special actions, purpose MEAL_ASSISTANCE/PRIVATE_SUPPORT.
- `features/reports/`: dashboard/reports.csv/forecast, ai/manager; báo cáo tài chính/CSV chỉ Admin.
- `features/admin/`: users/roomTypes/rooms/services, CRM và actions theo quyền Admin, ai/marketing chỉ draft.
- `features/notifications/`: notifications, notification-read/device; `core/NotificationsBridge.jsx` nhận và điều hướng notification.
- `app/guest.jsx`: guest-access/exchange, guest-stay/tasks/services, dnd/task-create/cancel/review theo scope guest.
- `features/cleaner/`: offers/cleaner-status/tasks và actions Cleaner cũ; giữ tương thích, không biến thành luồng mặc định mới.

## Cách gọi API đúng với wrapper hiện có

```javascript
// Ví dụ dùng wrapper đang có, điều chỉnh import theo file thực tế.
const rows = await read("stays", { status: "OPEN", page: 1 });
const result = await action("checkout", {
  stayId,
  payRemaining: true,
  paymentMethod: "CASH",
}, intentKey);
// result.id là invoiceId, không phải stayId.
```

`EXPO_PUBLIC_API_URL` là origin không có `/api`; `core/api.js` nối `/api`, timeout 20 giây. Trong component ưu tiên useResource/useAction hiện có. useResource có queryKey `[resource, params]`; useAction giữ key theo action/body trong hook và invalidate queries khi thành công.

- Gọi action trực tiếp không truyền key sẽ sinh key mới mỗi lần. Không gọi lại mù sau timeout với key mới. Giữ key/body cho cùng ý định; khi màn hình mất key qua unmount/restart, đọc lại BE trước khi tạo thao tác mới.
- Danh sách trả mảng, không truy cập `response.data.data`. Các response create thường chỉ `{id}`; đọc lại resource để lấy bản ghi đầy đủ.
- Tắt gửi lặp khi mutation pending, giữ input khi lỗi, hiển thị loading/error/empty và pager kể cả khi trang hiện tại rỗng.
- Debounce tra SĐT và bỏ kết quả cũ, key form theo stayId để không gửi nhầm lượt ở khi đổi lựa chọn.
- Không giả lập thành công hoặc tự cộng giá lên quote để thay kết quả server; refetch resource sau ghi.

## Phiên, quyền và đồng bộ

- Login trả user/token/refreshToken; native lưu bằng SecureStore. Guest JWT từ exchange khác token link, không lưu lẫn phiên staff.
- FE hiện refresh khi restore; interceptor 401 xóa phiên/cache. Không tuyên bố tự refresh/replay đã có; nếu ticket bổ sung phải thiết kế riêng việc refresh quay vòng và retry ghi với key cũ.
- Admin có quyền riêng theo role; Receptionist cần canAccessSpecialServices. Kiểm tra `role === "Admin" || canAccessSpecialServices` khi hiện mục riêng; BE vẫn kiểm quyền từ DB.
- `QueryClientProvider` bao `SessionProvider`, và SessionProvider bao PaperProvider theo bố trí hiện tại; tránh đưa Portal/Dialog ra ngoài context phiên và gây lỗi useSession khi mở dialog.
- Socket.IO nối origin, auth token, event changed/connect thì invalidate. Query mặc định polling 15 giây, staleTime 5 giây, refetch khi foreground; guest không nối socket staff.
- Đăng xuất/đổi user phải clear cache; không giữ dữ liệu khách hoặc nội dung riêng từ phiên trước. Remote push không phải điều kiện duy nhất để dữ liệu cập nhật.

## Các luồng dễ gửi sai payload

- Booking/checkin chọn HOUR/NIGHT, customerId hoặc customer inline; endsAt/expectedEnd không bắt buộc. Checkin từ booking gửi bookingId, nhận stayId mới để gọi quote/tasks/orders.
- Receipt gửi một trong bookingId/stayId. Trước invoice hoàn receipt-return theo receiptId, sau invoice refund theo invoiceId; quyền Admin.
- Checkout dùng payRemaining để thu đủ theo BE, hoặc paymentAmount thực thu; không gửi cả hai. finalTotal và discount/surcharge khác 0 không đồng thời. Điều chỉnh có lý do; Admin mới được cho nợ.
- Checklist là `JSON.parse(task.checklistJson)` từ task thật; desk-complete gửi toàn bộ chuỗi đó. DND/consent/fee approval không được bỏ qua. TURNOVER do BE tạo.
- Order chỉ gửi serviceId/quantity/notes, không gửi giá tự tính. Cập nhật PENDING → PREPARING → COMPLETED hoặc CANCELLED trước hoàn tất. SPECIAL luôn truyền đúng purpose khi GET/create; filter order tất cả trạng thái thì bỏ status, không gửi ALL.
- Guest review dọn trực tiếp có điểm chưa hoàn chỉnh ở BE như file chung mô tả. Không thêm thành công giả hoặc đoán điều kiện mới; phối hợp ticket BE–FE nếu sửa luồng này.
- CSV lấy responseType text và chia sẻ/xuất file theo nền tảng; không parse JSON. AI draft cần xác nhận trước task-create và có form thường khi AI lỗi.

## Cách thực hiện và kiểm tra

1. Xác định màn hình, API, payload thật, dữ liệu phụ thuộc và quyền user của ticket; kiểm tra phần đã có trước khi viết.
2. Giữ UX mobile, form validation, accessibility và trạng thái loading/error/empty; dùng component/hook hiện có khi phù hợp.
3. Kiểm tra với BE thực cho happy path và lỗi liên quan. Ghi rõ nếu đang dùng mock; không coi mock là đã ghép API.
4. Chạy từ gốc repo:

```powershell
npm run lint
npm run typecheck
```

5. Ticket thay luồng nghiệp vụ UI: chạy kiểm tra phù hợp, có thể `npm run test:ui` khi có runtime Playwright/Chrome. Bundle/build chỉ khi cần: `npm run export:web`, `npm run export:android`; đọc AGENTS.md trước khi dùng Expo. Không tự chạy EAS build hoặc provider AI tốn quota khi chỉ cần kiểm tra UI.
6. Kết quả Expo Web không thay thế Android thật. Nếu ticket yêu cầu thiết bị, kiểm tra URL LAN/HTTPS, reconnect, background/foreground, session hết hạn và timeout/double tap. Báo đúng môi trường đã thử.

## Mẫu kết quả cuối để người BE đưa cho Agent backend

```text
FE MOBILE HANDOFF — [ticket]
Baseline/nhánh/commit: [giá trị thật hoặc chưa commit]
Màn hình/file đã sửa: [...]
Luồng người dùng: [...]
Method + path đã dùng: [...]
Quyền/tài khoản thử: [role/flag, không mật khẩu]
Payload thực gửi: [JSON, không secret]
Response FE cần: [field/type/nullability; giữ nguyên hay đề xuất thay đổi]
ID nối tiếp: [...]
Query refetch/cache/session: [...]
Lỗi đã xử lý: [400/401/403/409/timeout/...]
Chỗ BE cần bổ sung: [cụ thể hoặc không có]
Kiểm tra: [lệnh, kết quả, mock/API thật, web/Android thật]
Chưa xác minh/cần ghép tiếp: [...]
```
