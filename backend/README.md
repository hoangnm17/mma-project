# StayFlow backend

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

Database demo mới có thể seed theo README gốc. Nâng cấp DB đã có dữ liệu không seed/reset. Khởi động Mongo từ gốc repository bằng compose trước khi migrate/run.

Từ `backend/`: `npm test`. Từ gốc: `npm run dev:backend`, `npm run test:integration:local`, `npm run lint`. Backend phục vụ web build ở `../frontend/dist/` theo mặc định; `WEB_DIST` có thể override, Docker vẫn dùng `/app/web`.
