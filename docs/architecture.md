# Kiến trúc

Source chia `frontend/` (Expo mobile/guest web) và `backend/` (Express/services/MongoDB), contract dùng chung trong `docs/`. Mobile/guest web → Express API → services → MongoDB replica set. Socket.IO và worker cùng process/codebase BE. Backend phục vụ `frontend/dist/` để demo một port; Docker override WEB_DIST tới `/app/web`. Production Caddy HTTPS; Mongo chỉ trong Docker network.

## Mobile

- `frontend/src/app/`: Router layout, staff entry, guest route, JSX.
- `frontend/src/features/`: auth, rooms, customers, bookings, stays/invoices, housekeeping, cleaner, reports/assistant, admin/marketing, notifications.
- `core/api.js`: Axios, auth header, idempotency và lỗi tiếng Việt.
- `core/session.jsx`: native SecureStore, cache tách phiên, foreground/reconnect refetch.
- `core/ui.jsx`: Paper, DateTimeField giờ Việt Nam, query/mutation, loading/error/empty.
- `core/NotificationsBridge.jsx`: refetch và mở đúng màn theo role từ push.
- `frontend/shared/policy.js`: default editor, không tính giá chính thức.

## Backend

- `app.js`: middleware, auth public, authenticated reads, action controller, validation/error, static hosting.
- `auth.js`: bcrypt, JWT issuer/audience, rotating refresh, database check mỗi request.
- `services/hotel.js`, `housekeeping.js`, `crm.js`: nghiệp vụ tách domain.
- `domain.js`: pricing/ranking/draft validation kiểm thử độc lập.
- `services/ai.js`, `ai-tools.js`: provider, schema, allowlisted read tools, quota.
- `forecast.js`: weekday mean, backtest walk-forward 14 ngày; không LLM.
- `db.js`: MongoClient, snapshot transaction + majority commit + property mutex document được ghi đầu tiên, retry write conflicts.
- `mongo-store.js`, `mongo-views.js`: native Mongo filters/updates/aggregations, projection, defaults/reference checks; không có SQL interpreter. `repository.js` giữ audit/notification/availability.
- `mongo-schema.js`, migration `001_mongo.js`: validators/unique/partial indexes, schema hash.
- `worker.js`: offers, khách sắp đến/sắp đi/quá giờ, outbox lease/retry.

Không PATCH status tùy ý, không SQL trong UI. Database validators và partial unique indexes bảo vệ trạng thái/tiền/assignment; quan hệ tham chiếu được service kiểm tra trong transaction, Mongo không có foreign key. Migration Mongo kiểm tra version/hash; SQL migrations là lịch sử, không được chạy.

## Giới hạn vận hành

Timer 5 giây/process, ghi mutex đầu transaction bảo vệ nhiều process, lease lấy lại sau restart. Thông báo phát không bảo đảm điện thoại nhận; DB là nguồn trạng thái. Chưa kiểm thử tải cao/multi-instance dài hạn, backup/restore production. Không disk cache dữ liệu khách trên mobile.
