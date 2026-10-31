# Đối chiếu yêu cầu

## Thay đổi backend hiện hành 30/10/2026

User yêu cầu Express + MongoDB thay SQL Server để deploy EC2 2 GB. Đã chuyển data access/native aggregations, schema/index migration, seed và Docker. Transaction cần replica set; property mutex + partial unique indexes bảo vệ race task/cleaner/booking/voucher/finance. Mongo integration 22 kịch bản con pass (TAP24), unit17 pass. API/JS mobile giữ nguyên. Dữ liệu SQL cũ chưa được nhập sang Mongo và không bị xóa. Hướng dẫn: deploy-mongo.md. Các mục SQL dưới đây ghi lại checkpoint cũ, không phải backend hiện hành.

Trạng thái dưới đây phân biệt code, kiểm thử tự động và xác nhận môi trường thật. Không coi các mục đã có code là đã test đầy đủ trên Android.

## Nền tảng và dữ liệu

- Expo SDK 57 + React Native + JS/JSX: frontend/src/app, frontend/src/features; không còn source TS template. Router, Paper, Query, Axios, RHF/Zod, SecureStore đã dùng.
- SQL Server thật: 6 migration trong backend/migrations; migration hash, seed idempotent; PK/FK/index/checks/filtered unique. Migration 001–006 đã áp dụng và integration cuối đạt.
- Auth/RBAC/khóa tài khoản/refresh: auth.js, app.js, repository.js; đã có API integration cho 3 role + Guest và khóa token cũ.
- Tiền/check-in/check-out idempotency: controller action + IdempotencyRecords; concurrency/receipt/refund retries đã test trên SQL.

## Lưu trú

- Phòng/loại/giá/ảnh/ngừng dùng/lịch sử: Rooms.jsx, Admin.jsx, hotel.js; UI/API đã có, ảnh qua URL, không có upload ảnh server.
- Khách và lịch sử: Customers.jsx, customer-history; tạo/sửa/tìm có code, không lưu giấy tờ nhạy cảm.
- Booking/availability/cọc/check-in: Bookings.jsx, Rooms.jsx; race booking + snapshot/cọc/check-in đã test.
- Dịch vụ/sửa số lượng: Stays.jsx + serviceItem; snapshot server. UI đã lint/bundle, chưa test mọi thao tác trên Android.
- Checkout/thu nhiều lần/công nợ/refund/hoàn cọc: hotel.js, Stays/Invoices; integration retry/net finance pass checkpoint.
- PDF/share và CSV: native APIs đã viết; web đã bundle. Chưa chứng minh PDF/share trên Android thật.
- Dashboard/overdue/arrival/departure: reads.js, worker.js; worker dedupe đã test, chưa mô phỏng hết các mốc lịch dài ngày.
- Maintenance/incident: Incidents.jsx, crm.js; maintenance chặn booking và resolve đã integration test.

## Smart Housekeeping

- Guest link random/hash/session/checkout revoke: auth.js, guest.jsx; scope và revoke đã integration test.
- Confirm task/DND/duplicate: TaskForm.jsx + createTask; đã integration test.
- Eligibility/scoring/breakdown/TTL/rounds/future dispatch: housekeeping.js + domain.js; ranking unit, future/no-hold integration. Không là ML.
- Hai Cleaner một task, một Cleaner hai tasks: đã test hai HTTP request đồng thời với SQL Server. Filtered indexes là guard thứ hai.
- Checklist/start/submit/verify/rework/history: integration cuối đạt, gồm start-window guard; UI theo role đã lint/bundle.
- Cycle guard, dọn occupied, towels không clean full room: integration đã xác minh occupied/cycle guard; unit và code bảo vệ fullClean.
- Reschedule/cancel/reassign: API/UI có, offer hết hạn/thu hồi/sửa lịch đã test; không tự reassign khi mất socket.
- Notifications/socket/outbox durable/retry: có code và test worker lặp/dedupe. Chưa fault-injection kill đúng giữa push send/ack hoặc thử multi-process lâu dài.
- Expo Push/FCM: đăng ký token/response routing/server sender đã viết, **chưa cấu hình FCM/chưa test thiết bị thật**.
- Tiền công theo việc: tùy chọn chưa bật; không trả số liệu giả.

## AI và CRM

- AI-03: backend Responses structured schema, validator, xác nhận tách create task. Unit dùng provider mock và test fallback không key. Bộ 40 câu và evaluator có sẵn; **chưa đánh giá provider thật do thiếu key**, không báo accuracy/latency giả.
- AI-01: allowlist read tools dashboard/availability, check quyền trước/sau LLM; chưa test provider thật.
- AI-02: baseline weekday 7/30 ngày, minimum history, time backtest; unit series tổng hợp pass, API thiếu dữ liệu pass. Seed không bịa số forecast.
- Campaign/voucher/tier/attribution/content draft: API/UI có; voucher maxUses cạnh tranh đã integration test. Chỉ draft, không gửi hàng loạt; attributed revenue không gọi incremental lift.

## Build và vận hành

- Expo dependency check pass; Doctor 21/21 lượt cuối; Android Hermes + web export mới nhất pass. Lint/cú pháp cuối pass; chi tiết test-results.md.
- EAS personal từng bị quota; đợt UI v2 đã build **FINISHED** trên team hoangnm17s-team, project431a1384-6506-47bd-9c12-b73faeafceee. [APK thật](https://expo.dev/artifacts/eas/Z67uEeXpefc1kga7t6to-IMK6dYY7etUaW89GAsZ11o.apk), signature v2 verify pass; emulator cài/mở không Metro smoke pass. Chưa full workflow native/Android vật lý.
- UI v2: icon/gradient, header/description, dashboard hero/quick actions/metric, bottom nav, menu Thêm, room cards và trạng thái màu/icon đồng bộ. Web 390×844 kiểm tra trực tiếp không tràn ngang; login/dashboard/rooms/menu hoạt động, console không có lỗi JS.
- LAN Express + SQL demo đang chạy, browser Admin login/dashboard mới nhất và bố cục 390×844 không tràn ngang đã xác minh.
- Dockerfile/Compose một máy + SQL Express/Caddy/least-privilege/bootstrap Admin đã viết. Image build/local health+web smoke đạt; domain/hosting/TLS và bootstrap/runtime production chưa kiểm chứng.
