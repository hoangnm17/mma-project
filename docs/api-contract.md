# API contract

> **Bản tra cứu hiện hành, đối chiếu source local ngày 31/10/2026:** [90 API với input/output, quyền và màn hình sử dụng](api-reference-current.md), [bàn giao BE–FE mobile cho 2 người](team-handoff.md), [Postman collection](stayflow-team.postman_collection.json). Nội dung bên dưới là contract cũ, chưa cập nhật các thay đổi về HOUR/NIGHT, dọn trực tiếp, FOOD/SPECIAL, checkout và quyền báo cáo; dùng tài liệu hiện hành khi phát triển.

Base `/api`. JSON UTF-8, UTC ISO-8601 có offset ở input. Auth `Authorization: Bearer <token>`. Errors `{error, fields?}`: 400 validation, 401 token/khóa tài khoản, 403 quyền, 404 không có resource, 409 xung đột, 429 giới hạn, 503 AI/database không khả dụng. SQL details/secret không trả client.

## Authentication

- POST `/auth/login`: `{username,password}` → `{user:{id,name,role},token,refreshToken}`.
- POST `/auth/refresh`: `{refreshToken}` → phiên mới; token cũ bị revoke.
- POST `/guest-access/exchange`: `{token}` → `{token,stayId,room}`; chỉ random link hợp lệ.
- GET `/me`: thông tin actor công khai.

## Reads

GET `/:resource`, phân trang 30 dòng bằng `page` nếu resource có pagination; `search` tìm số phòng/tên/điện thoại tùy resource.

- Desk/Admin: `dashboard`, `rooms`, `customers`, `bookings`, `stays`, `invoices`, `roomTypes`, `maintenance`, `incidents`, `cleaners`, `campaign-options`.
- `availability?start=<ISO>&end=<ISO>&excludeBooking=<uuid optional>`; kiểm tra chính thức được lặp trong transaction ghi.
- `quote?stayId=...`: stay, invoice, room breakdown, items, services, total, paid, refunded, adjustments, balance, credit.
- `receipts?stayId=...`, `booking-receipts?bookingId=...`, `customer-history?customerId=...`, `room-history?roomId=...`.
- `forecast?days=7|30`: available=false/message khi thiếu dữ liệu; ngược lại model/historyDays/backtest/days, không phải số LLM tạo.
- Admin: `users`, `audit`, `campaigns`, `vouchers`.
- Cleaner: `offers` chỉ lời mời của mình còn hạn, kèm serverNow; `tasks` chỉ assignment của mình, không customer/invoice/revenue; `cleaner-status` tính busy/inShift từ DB.
- `tasks`: Desk xem chung, Guest chỉ stay được cấp quyền. `guest-stay`: Guest chỉ own stay và DND.
- `services`: danh mục hoạt động; `notifications`: chỉ user hiện tại.
- GET `/reports.csv`: Desk/Admin, UTF-8 BOM, các chỉ tiêu doanh thu/thực thu/công nợ.

## Actions

POST `/actions/<name>` bắt buộc `Idempotency-Key` 8–100 ký tự. Cùng actor/key/body trả kết quả cũ; key cũ/body khác →409. Mọi action chạy transaction + kiểm tra lại quyền trong transaction. Body chỉ dùng trường được schema cho phép; không nhận actor/role từ body.

Lưu trú:

- `customer`: `{id?,name,phone,notes?}`.
- `booking`: `{id?,roomId,customerId,startsAt,endsAt,guests,mode:HOUR|NIGHT|DAY,deposit?,method:CASH|TRANSFER,source?,campaignId?}`.
- `booking-cancel`: `{id}`; còn cọc chưa hoàn →409.
- `checkin`: `{bookingId?,roomId,customerId,expectedEnd,guests,mode}`; có booking thì nguồn dữ liệu lấy từ DB.
- `serviceItem`: `{stayId,serviceId,quantity,itemId?}`.
- `receipt`: `{stayId OR bookingId,amount,method}`.
- `receipt-return`: Admin, `{receiptId,amount,reason}` trước invoice.
- `checkout`: `{stayId,discount?,surcharge?,allowDebt?,reason?,voucherCode?}`; manual discount/surcharge/debt chỉ Admin.
- `refund`: Admin, `{invoiceId,amount,reason}`, giảm nghĩa vụ và trả tiền cùng transaction.
- `guest-link`: `{stayId}` → `{url}`; thu hồi link trước.
- `dnd`: `{stayId,dnd}`; Guest chỉ own stay.

Housekeeping:

- `task-create`: `{stayId,serviceCode:FULL|LINEN|BATHROOM|TOWELS,windowStart,windowEnd,entryConsent,feeApproved,notes?}`. TURNOVER nội bộ checkout.
- `cleaner-availability`: Cleaner, `{accepting}`; không tự thay busy/inShift.
- `offer-accept`, `offer-reject`: Cleaner, `{offerId}`.
- `task-start`: Cleaner own assignment, `{taskId}`.
- `task-submit`: Cleaner own assignment, `{taskId,checklist:[các mục checklist đã trả]}`.
- `task-verify`: Desk/Admin, `{taskId,passed,reason?}`; fail bắt buộc lý do.
- `task-cancel`: Desk hoặc Guest đúng stay, `{taskId}`; chỉ trước bắt đầu.
- `task-assign`: Desk/Admin, `{taskId,cleanerId}`, dùng cùng service assignment.
- `task-reassign`: Desk/Admin, `{taskId,reason}`; không tự giao lại khi mất socket.
- `task-reschedule`: Desk/Admin, `{taskId,windowStart,windowEnd,serviceCode?}`; chỉ PENDING, revoke offer/version++.
- `task-review`: Guest, `{taskId,rating:1..5,comment?}`, chỉ COMPLETED, một lần/task.

Quản trị/CRM:

- Admin `user`: `{id?,username,name,role,enabled,password?}`, tạo mới cần password; khóa/đổi quyền tăng authVersion.
- Admin `room`, `roomType`, `service`, `cleaner`: schema trong `backend/src/services/hotel.js`; roomType có rate `{hour,day,night,extraHour,graceMinutes}`, cleaner có userId/zone/skills/startsAt/endsAt.
- Desk/Admin `maintenance`: `{roomId,startsAt,endsAt,reason}`; `maintenance-resolve`: `{id}`.
- `incident`: `{roomId,description}`; Cleaner chỉ phòng từng được giao. `incident-resolve`: Desk/Admin `{id,resolution}`.
- Admin `campaign`: `{id?,name,channel,startsAt,endsAt,budget,draft?}`.
- Admin `voucher`: `{id?,code,discount,minTotal,startsAt,endsAt,maxUses,perCustomer,enabled?}`.
- Admin `membership`: `{customerId,tier:STANDARD|SILVER|GOLD}`.
- `password`: `{current,password}`; `logout`: `{}`; `notification-read`: `{id}`; `device`: `{token}`.

## AI và socket

- POST `/ai/draft`: `{stayId,text}` → schema serviceCode/checklist/requestedDate/windowStart/windowEnd/clarificationNeeded/clarificationQuestion + requiresConfirmation. Không tạo task.
- POST `/ai/manager`: Desk/Admin `{question}` → tool/message/data/asOf; chỉ read allowlist.
- POST `/ai/marketing`: Admin `{brief}` → `{draft,requiresApproval:true}`, không gửi.
- Socket.IO tại origin API, handshake `{auth:{token}}`, server room `user:<id>`, event `changed`. Client invalidate/refetch. Không nhận task status/assignment từ socket payload.
- GET `/health` ngoài `/api`: 200 DB sẵn sàng, 503 DB chưa kết nối.
