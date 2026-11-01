# StayFlow backend

Deploy tự động migrate/bootstrap/seed demo 60 ngày: xem [hướng dẫn gói auto-seed](../docs/deploy-autoseed.md). `scripts/initialize.js` dùng khi Compose khởi động; không cần seed thủ công trên DB demo mới.

Phần việc BE: Express API, MongoDB replica set, nghiệp vụ, phân quyền, worker và tests.

Đọc [hướng dẫn Agent BE](../docs/agents/BE_AGENT.md), [quy tắc API chung](../docs/agents/SHARED_API_RULES.md), [API hiện hành](../docs/api-reference-current.md). Giữ checkout chung để Agent cũng đọc được `../frontend/` và `../docs/`.

Từ thư mục `backend/`, dùng Node >=22.13:

```powershell
npm ci
# Chỉ khi chưa có .env:
Copy-Item .env.example .env
# Điền cấu hình Mongo replica set và secret của môi trường phát triển.
npm run migrate
npm run dev
```

Database demo mới: đặt `DEMO_SEED_PASSWORD` (10–100 ký tự) trong `.env`, chạy `npm run migrate` rồi `npm run seed`. Seed hiện hành (`scripts/seed-demo.js`) tạo HOUR/NIGHT, 2 Lễ tân có/không có quyền riêng, FOOD/SPECIAL, booking, dọn trực tiếp, hóa đơn/phiếu thu. Cho phép DB trống hoặc chỉ có một Admin bootstrap và giữ nguyên Admin đó; từ chối trộn DB có dữ liệu nghiệp vụ. Chạy lại không nhân đôi dữ liệu. `scripts/seed.js` là fixture Cleaner/DAY lịch sử dành cho test. Nâng cấp DB đã có dữ liệu không seed/reset. Khởi động Mongo từ gốc repository bằng compose trước khi migrate/run.

Để thêm lịch sử demo vào DB đã có phòng/nhân viên: `npm run seed:history`. Script chỉ thêm dữ liệu được đánh dấu demo, checkpoint từng ngày và chạy lại không nhân đôi; không chạy `seed-demo.js` lên DB đã có nghiệp vụ. `npm run seed` cho DB demo mới chạy cả seed ban đầu và lịch sử 60 ngày. [Hướng dẫn bản 1.0.2](../docs/release-1.0.2.md).

Lỗi Gemini và lệnh cập nhật container/seed demo trên server: [hướng dẫn Gemini](../docs/gemini-and-demo-seed.md).

Từ `backend/`: `npm test`. Từ gốc: `npm run dev:backend`, `npm run test:integration:local`, `npm run lint`. Backend phục vụ web build ở `../frontend/dist/` theo mặc định; `WEB_DIST` có thể override, Docker vẫn dùng `/app/web`.
