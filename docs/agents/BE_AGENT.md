# Hướng dẫn giao việc cho Agent BE — StayFlow

Bạn là Agent hỗ trợ **người phụ trách backend**. Hoàn thành ticket người dùng giao trong codebase hiện có, giữ contract để FE mobile kết nối được. Đọc file này cùng [SHARED_API_RULES.md](SHARED_API_RULES.md); không tự chạy toàn bộ backlog của dự án.

## Đọc trước khi làm

- `AGENTS.md` gốc và `backend/AGENTS.md`.
- [Quy tắc API chung](SHARED_API_RULES.md), [phân công M0–M7](../team-handoff.md), phần endpoint liên quan trong [API hiện hành](../api-reference-current.md).
- `backend/package.json`, `backend/src/app.js`, `auth.js`, `reads.js`, service/view/schema liên quan và điểm gọi tương ứng ở `frontend/src/` để hiểu payload FE đang gửi.

## Bối cảnh và stack

StayFlow là quản lý nhà nghỉ. Luồng chính: khách/phòng → booking/cọc → checkin tạo stay → dịch vụ/dọn/order → thu tiền/checkout tạo invoice → báo cáo. BE là nguồn quyết định quyền, giá và trạng thái.

Runtime khai báo Node >=22.13, Express 5, JavaScript ES modules, Zod, JWT, MongoDB driver, Socket.IO. Database hiện là **MongoDB replica set**, không phải SQL Server. HTTP base `/api`, action ghi `/api/actions/<name>`, GET đọc `/api/<resource>`, health `/health`. Snapshot API có 90 tổ hợp method/path, không coi con số này bất biến sau khi có task mới.

Nghiệp vụ mới dùng Admin/Receptionist, HOUR/NIGHT, dọn trực tiếp không cần ca, checkout có điều chỉnh và thu cùng transaction, order FOOD/SPECIAL. Cleaner và DAY là tương thích. Chi tiết enum, quyền, body, output và hạn chế nằm ở API reference; kiểm tra source trước khi dùng.

## Phạm vi sở hữu

- Chính: `backend/src/**`, `backend/migrations/**`, `backend/test/**`, `backend/scripts/**`, `backend/package.json` và lockfile tương ứng.
- Bàn giao contract: `docs/api-reference-current.md`, `docs/stayflow-team.postman_collection.json`, tài liệu môi trường/test/migration liên quan.
- Đọc frontend/ để kiểm chứng tích hợp. Mặc định để người FE sửa `frontend/src/**`; nếu ticket người dùng giao rõ thay đổi xuyên suốt thì làm phần đã được giao và nêu file ngoài BE đã sửa.
- Deploy/Docker/cấu hình dùng chung chỉ sửa theo nhu cầu ticket; phân biệt chuẩn bị thay đổi với thực hiện deploy. Không tự cập nhật production hoặc secret khi chỉ được giao viết/sửa code.

## Bản đồ source

- `app.js`: middleware, auth, rate limit, route, idempotency, transaction điều phối và error handler.
- `auth.js`: bcrypt, JWT, refresh quay vòng, authVersion, guest exchange và xác thực DB.
- `reads.js`: phân quyền/filter GET. `mongo-views.js`: projection/join/aggregate và shape response.
- `services/hotel.js`: customer, room, booking, checkin, quote, receipt, checkout, invoice/refund, quản trị.
- `services/housekeeping.js`: task, dọn trực tiếp, checklist, verify, cycle, Cleaner offer/assignment cũ.
- `services/orders.js`, `order-schema.js`: catalogue/đơn FOOD và hai purpose SPECIAL, status, snapshot và ghi phí.
- `services/crm.js`: incidents/campaigns/vouchers/membership. `reporting.js`: range, doanh thu, thực thu, nợ, nguồn doanh thu. `forecast.js`: thống kê dự báo, không LLM.
- `services/ai*.js`: provider, draft, quota/read tools. `worker.js`, `server.js`: tick/outbox/notification/Socket.IO.
- `db.js`, `mongo-store.js`, `repository.js`: DB transaction, truy vấn, audit, quyền/notification. `mongo-schema.js` và migration snapshots: validator/index/schema version.

## Cách thực hiện một ticket

1. Xác nhận tình trạng code/test/branch; nhận diện phần đã có và thay đổi chưa commit. Xác định endpoint, actor, ID và collection bị ảnh hưởng.
2. Đọc payload thực trong FE và contract. Mô tả ngắn hành vi trước/sau, các invariant và trường cần bổ sung; giữ API hiện có khi có thể.
3. Thay validation/service/view/schema ở nơi phù hợp. Tái dùng transaction/idempotency và quyền từ DB; không thêm đường ghi bypass service chỉ để FE gọi dễ hơn.
4. Với schema mới: xác minh migration đã áp dụng, tạo version mới/index/validator phù hợp; không sửa checksum migration cũ đã chạy hoặc reset DB để migration qua.
5. Với tiền/trạng thái/quyền: kiểm tra retry, cạnh tranh, scope guest, SPECIAL redaction và snapshot khi có liên quan. Không log secret/PII không cần thiết.
6. Cập nhật docs và request Postman liên quan. Ghi rõ field optional/default, nullable, enum, response là object/mảng, mã lỗi và filter thật sự hỗ trợ.
7. Chạy kiểm tra theo phạm vi; ghi handoff cho FE. Không báo FE đã tích hợp nếu mới kiểm tra Postman/unit riêng lẻ.

## Những luồng cần giữ khi sửa

- booking trả bookingId; checkin trả stayId; checkout trả invoiceId. Cọc chuyển từ booking sang stay, không tạo lần thu trùng.
- availability là preview; booking/checkin kiểm tra lại trong transaction, kể cả hai request tranh cùng phòng.
- Quote/công thức VND từ BE. Checkout finalTotal và lý do, payRemaining/paymentAmount, công nợ Admin, receipt-return trước invoice và refund sau invoice theo đúng contract.
- FOOD/SPECIAL chỉ tính phí khi COMPLETED và đúng một lần. PENDING/PREPARING chặn checkout. SPECIAL phải kiểm tra quyền DB và purpose, kể cả khi UI đã ẩn mục.
- task-desk-start/complete không cần Cleaner shift nhưng không bỏ consent/DND/checklist/cycle/khung giờ. TURNOVER thuộc checkout và đúng cycle.
- Staff/guest không lẫn phạm vi. Khóa/sửa quyền tăng authVersion và chấm dứt phiên liên quan. AI provider 401 không được biến thành staff hết phiên.

## Kiểm tra

Lệnh từ gốc repository:

```powershell
npm run lint
npm run typecheck
npm test
```

Chạy integration khi sửa HTTP/service/transaction/schema/permission cần DB:

```powershell
npm run test:integration:local
```

Đọc runner và cấu hình trước khi chạy, dùng DB test riêng. Không trỏ integration vào DB đang vận hành. Nếu không có Mongo/runtime, nêu rõ lệnh bị thiếu điều kiện và hành vi chưa kiểm chứng; không dùng test source làm bằng chứng đã pass. Không thêm test chỉ lặp implementation cho thay đổi tài liệu nhỏ.

`npm --prefix backend run dev` khởi động backend theo cấu hình môi trường; migrate/seed chỉ theo hướng dẫn của môi trường phù hợp. Nâng cấp DB có dữ liệu không chạy seed/reset. Build Expo không phải điều kiện cho mọi ticket BE.

## Mẫu kết quả cuối để người FE đưa cho Agent mobile

```text
BE HANDOFF — [ticket]
Baseline/nhánh/commit: [giá trị thật; nếu chưa commit thì ghi rõ]
Hành vi mới/sửa: [...]
Method + path: [...]
Quyền: [actor/role/flag/scope]
Headers: [Bearer; Idempotency-Key nếu action]
Request JSON: [payload cụ thể, không secret]
Response thành công: [status + JSON thực tế hoặc ghi rõ template]
Lỗi liên quan: [400/401/403/409/... và tình huống]
ID nối tiếp: [response nào cấp ID cho request tiếp theo]
FE cần sửa/tải lại: [màn hình, field, query]
Migration/env mới: [nếu có; không đưa secret]
Kiểm tra: [lệnh + kết quả; phân biệt unit/integration/runtime]
Chưa xác minh/cần ghép tiếp: [...]
Tài liệu/Postman đã cập nhật: [...]
```

Nếu API không thay đổi, ghi “contract giữ nguyên” và mô tả hành vi được sửa. Không ghi trạng thái deploy, tích hợp mobile hoặc production là hoàn tất khi chưa thực hiện/xác minh.
