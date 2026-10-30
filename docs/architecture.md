# Kiến trúc

Mobile/guest web → Express API → services → SQL Server. Socket.IO và worker cùng process/codebase. Backend phục vụ dist/ để demo một port. Production Caddy HTTPS; SQL chỉ trong Docker network.

## Mobile

- `src/app/`: Router layout, staff entry, guest route, JSX.
- `src/features/`: auth, rooms, customers, bookings, stays/invoices, housekeeping, cleaner, reports/assistant, admin/marketing, notifications.
- `core/api.js`: Axios, auth header, idempotency và lỗi tiếng Việt.
- `core/session.jsx`: native SecureStore, cache tách phiên, foreground/reconnect refetch.
- `core/ui.jsx`: Paper, DateTimeField giờ Việt Nam, query/mutation, loading/error/empty.
- `core/NotificationsBridge.jsx`: refetch và mở đúng màn theo role từ push.
- `shared/policy.js`: default editor, không tính giá chính thức.

## Backend

- `app.js`: middleware, auth public, authenticated reads, action controller, validation/error, static hosting.
- `auth.js`: bcrypt, JWT issuer/audience, rotating refresh, database check mỗi request.
- `services/hotel.js`, `housekeeping.js`, `crm.js`: nghiệp vụ tách domain.
- `domain.js`: pricing/ranking/draft validation kiểm thử độc lập.
- `services/ai.js`, `ai-tools.js`: provider, schema, allowlisted read tools, quota.
- `forecast.js`: weekday mean, backtest walk-forward 14 ngày; không LLM.
- `db.js`, `repository.js`: query tham số hóa, serializable/application lock, audit/notification/availability.
- `worker.js`: offers, khách sắp đến/sắp đi/quá giờ, outbox lease/retry.

Không PATCH status tùy ý, không SQL trong UI. Constraints bảo vệ cả khi service có lỗi. Migration kiểm tra version/hash; migration mới sửa nullable unique của SQL Server thay vì sửa file đã áp dụng.

## Giới hạn vận hành

Timer 5 giây/process, application lock bảo vệ nhiều process, lease lấy lại sau restart. Thông báo phát không bảo đảm điện thoại nhận; DB là nguồn trạng thái. Chưa kiểm thử tải cao/multi-instance dài hạn, backup/restore production. Không disk cache dữ liệu khách trên mobile.
