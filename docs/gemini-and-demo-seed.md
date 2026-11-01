# Sửa Gemini và thêm seed demo sau deploy

## Gemini

Adapter cũ gửi `store:false` của OpenAI vào body Google `generateContent`; trường này không có trong request của Gemini và có thể gây HTTP 400. Adapter mới chỉ gửi `systemInstruction`, `contents`, `generationConfig`; OpenAI vẫn giữ `store:false`. Key gửi qua header `x-goog-api-key`. Model được trim và chấp nhận cả `models/<model-id>`.

Đối chiếu [generateContent REST](https://ai.google.dev/api/generate-content) và [structured output](https://ai.google.dev/gemini-api/docs/structured-output). Đây là lỗi xác định từ source và contract, chưa phải xác nhận lỗi đang xảy ra trên server của bạn.

Trong `deploy/.env` (Docker) hoặc `backend/.env` (chạy Node trực tiếp):

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=<key riêng của server>
GEMINI_MODEL=gemini-3.5-flash-lite
AI_DAILY_LIMIT=30
```

Key chỉ ở BE; model phải được tài khoản/project Google của bạn cấp quyền. Docker Compose chỉ chuyển những biến khai báo ở `deploy/compose.yaml` vào container, không tự đọc `backend/.env`. Nếu dùng nền tảng khác, đặt biến vào environment của service BE tương ứng. Không in/copy API key vào log hoặc báo lỗi.

Sau khi đưa source mới lên server, từ gốc repository, cập nhật riêng API (không cần migration mới):

```sh
docker compose -p stayflow --env-file deploy/.env -f deploy/compose.yaml build api
docker compose -p stayflow --env-file deploy/.env -f deploy/compose.yaml up -d --no-deps --force-recreate api
```

Sửa `.env` rồi chỉ `restart` container không nạp lại environment; cần recreate. Với Node trực tiếp, restart tiến trình cùng file env đã cập nhật.

Các method giữ nguyên; cần `Authorization: Bearer <token>`, JSON; không cần `Idempotency-Key`:

- `POST /api/ai/draft`: `{ "stayId":"<UUID lượt ở đang mở>", "text":"Tôi muốn thêm khăn" }`. Guest đúng stay hoặc Admin/Lễ tân; chỉ trả draft, cần xác nhận form.
- `POST /api/ai/manager`: `{ "question":"Có bao nhiêu phòng đang có khách?" }`. Admin/Lễ tân; chỉ đọc dữ liệu theo quyền.
- `POST /api/ai/marketing`: `{ "brief":"Viết lời cảm ơn khách hàng đã lưu trú" }`. Admin; chỉ trả nội dung chờ duyệt.

Lỗi upstream trả HTTP **503**, JSON có `error`, `code`, `providerStatus` (nếu có HTTP response từ provider). Không trả nguyên body Google và không biến key AI lỗi thành HTTP 401 của nhân viên:

- `AI_PROVIDER_REQUEST`, upstream 400: kiểm tra payload/model/config provider, đồng thời chắc chắn đã build bản sửa.
- `AI_PROVIDER_AUTH`, upstream 401/403: kiểm tra key, quyền API, giới hạn key/project/vùng của Google.
- `AI_PROVIDER_MODEL`, upstream 404: model ID hoặc quyền dùng model.
- `AI_PROVIDER_QUOTA`, upstream 429: quota/rate limit phía Google; khác HTTP 429 quota nội bộ của StayFlow.
- `AI_PROVIDER_UNAVAILABLE`: lỗi HTTP khác từ provider.
- `AI_PROVIDER_TIMEOUT`: quá 15 giây/abort; `AI_PROVIDER_FAILURE`: lỗi mạng/parse response.

Thiếu cấu hình hoặc output bị chặn/cắt cụt vẫn có thể trả `{error}` HTTP 503 theo contract cũ. Kiểm tra `/health` chỉ xác minh DB, không xác minh key/model/quota Gemini.

## Seed hiện hành

Từ bản 1.0.2, `npm run seed` tạo demo ban đầu rồi thêm lịch sử 60 ngày. Với DB đã có dữ liệu, dùng riêng `npm run seed:history`; không chạy seed ban đầu. [Hướng dẫn cập nhật/seed 60 ngày](release-1.0.2.md) thay thế phần mô tả chưa có lịch sử dự báo bên dưới.

Chỉ áp dụng DB demo trống hoặc chỉ có một Admin bootstrap đang hoạt động; không dùng seed để nâng cấp DB đang vận hành. Admin cũ giữ nguyên ID, password hash, role, authVersion. Chạy lại seed hoàn tất trả `{"skipped":true}`. Tất cả ghi trong một transaction, thất bại rollback.

Từ `backend/`, đặt `DEMO_SEED_PASSWORD` (10–100 ký tự) trong `.env`, rồi:

```sh
npm run migrate
npm run seed
```

Trên Docker, đặt `DEMO_SEED_PASSWORD` trong `deploy/.env`. Nếu DB demo đã migrate/bootstrap nhưng chưa có dữ liệu nghiệp vụ, chạy từ gốc repository:

```sh
docker compose -p stayflow --env-file deploy/.env -f deploy/compose.yaml build migrate
docker compose -p stayflow --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps migrate node scripts/seed-demo.js
```

Seed từ chối DB đã có phòng/khách/booking/đơn/danh mục thường hoặc nhân viên khác. Không có cờ reset/force; dùng DB demo riêng nếu DB hiện tại đã có dữ liệu. Không chạy `down -v`.

Dữ liệu được tạo: 20 phòng/3 loại, 6 khách, 3 lượt ở mở HOUR/NIGHT và 1 lượt đã checkout; 3 booking (1 cọc), 2 dịch vụ thường, 5 dịch vụ dọn, 3 món FOOD, 2 SPECIAL theo hai purpose; 2 đơn FOOD (1 COMPLETED có phí), 1 yêu cầu SPECIAL; 2 task dọn tại quầy và 1 TURNOVER; 1 hóa đơn đã thu tiền. Thời điểm mẫu tính theo lúc chạy seed, không tạo lịch sử giả cho dự báo 56 ngày.

Tài khoản mới: `admin` nếu DB chưa có Admin, `letan` không có quyền riêng, `letan_special` có quyền riêng. Mật khẩu tài khoản mới lấy từ `DEMO_SEED_PASSWORD`; Admin bootstrap tiếp tục dùng mật khẩu cũ. Không tạo Cleaner/DAY. Script cũ `backend/scripts/seed.js` chỉ còn làm fixture lịch sử cho integration/UI smoke; `npm run seed` và Compose demo dùng script mới.

## BE HANDOFF — Gemini và demo seed

```text
Baseline/nhánh/commit: master, 59a68cc; thay đổi chưa commit.
Hành vi mới/sửa: bỏ store khỏi Gemini; chuẩn hóa provider/model; lỗi upstream có mã an toàn; seed demo hiện hành atomic/idempotent, giữ bootstrap Admin.
Method + path: POST /api/ai/draft, POST /api/ai/manager, POST /api/ai/marketing. Contract thành công/request giữ nguyên; thêm field lỗi tùy chọn.
Quyền: draft Guest đúng stay hoặc Admin/Receptionist; manager Admin/Receptionist; marketing Admin. Seed là CLI, không có endpoint seed public.
Headers: Bearer và Content-Type application/json; AI không cần Idempotency-Key.
Request JSON: xem ba ví dụ ở phần Gemini; payload FE hiện tại tương thích.
Response thành công: HTTP 200; draft giữ requiresConfirmation:true, marketing giữ requiresApproval:true; manager trả dữ liệu theo quyền. Shape đầy đủ xem API reference (template).
Lỗi liên quan: input 400, phiên người dùng 401, quyền 403, quota nội bộ 429; lỗi provider HTTP 503 {error,code?,providerStatus?}. Ví dụ template: {"error":"API key AI không hợp lệ. Vui lòng dùng form thường.","code":"AI_PROVIDER_AUTH","providerStatus":401}.
ID nối tiếp: draft nhận stayId từ checkin/GET stays; các API AI không tạo booking/stay/task/invoice ID mới.
FE cần sửa/tải lại: không bắt buộc đổi payload/method; ErrorMessage tiếp tục dùng error. Có thể dùng code để chẩn đoán; không logout theo providerStatus.
Migration/env mới: không có schema migration/env bắt buộc mới. Dùng AI_PROVIDER, GEMINI_API_KEY, GEMINI_MODEL và DEMO_SEED_PASSWORD hiện có; Docker cần recreate API sau đổi env.
Kiểm tra tĩnh: npm run lint PASS; npm run typecheck PASS (JS checkJs=false, không phải full type safety); Postman JSON hợp lệ 90 request; git diff --check PASS.
Unit/HTTP mock không DB: npm test PASS 35/35.
Integration/runtime DB: npm run test:integration:local PASS 42/42 trên replica set local riêng. Bao gồm ba HTTP AI với provider giả lập, seed mới từ DB trống/DB bootstrap, rollback, idempotency, từ chối DB có dữ liệu.
Chưa xác minh/cần ghép tiếp: không gọi Gemini thật, không deploy/rebuild container cloud, không seed DB đang vận hành. Local Node v22.11.0; repo yêu cầu >=22.13, image Docker dùng Node 24.
Tài liệu/Postman đã cập nhật: docs/api-reference-current.md, docs/stayflow-team.postman_collection.json, docs/gemini-and-demo-seed.md, docs/deploy-mongo.md, README.md, backend/README.md.
```
