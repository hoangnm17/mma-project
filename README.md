# StayFlow

## Cấu trúc backend và frontend

```text
mma-project/
├── backend/       # API, MongoDB, nghiệp vụ, tests, package và .env BE
├── frontend/      # Expo mobile/guest web, src, assets, config, package và .env FE
├── docs/          # Contract API, phân công và hướng dẫn Agent dùng chung
├── deploy/        # Triển khai Docker/Caddy
├── scripts/       # Công cụ kiểm tra và đóng gói chung
├── artifacts/     # Kết quả build/test (gitignore)
└── package.json   # Lệnh điều phối, không chứa dependency mobile
```

Hai người mở chung gốc repository; người BE làm trong [backend/](backend/README.md), người mobile làm trong [frontend/](frontend/README.md). [Hướng dẫn khởi động Agent](docs/agents/README.md) dùng đường dẫn mới. Chi tiết: [tách thư mục và xác minh](docs/folder-structure.md).

Từ gốc, dùng Node >=22.13 và cài dependency cho cả hai phần bằng `npm run setup` (hoặc `npm --prefix frontend ci` và `npm --prefix backend ci`). `npm ci` tại gốc chỉ cài package điều phối; dependency thực nằm trong từng phần.

Mở hai terminal từ gốc sau khi đã cấu hình môi trường:

```powershell
# Terminal BE, MongoDB replica set phải đang chạy:
npm run dev:backend
```

```powershell
# Terminal FE:
npm run dev:frontend
```

`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration:local`, `npm run export:web` và `npm run test:ui` vẫn chạy từ gốc. Web export nằm ở `frontend/dist/`. URL, payload, role, DB và định danh app giữ nguyên khi đổi thư mục.

**Dùng với Agent của 2 người:** [cách giao việc và file cần đọc](docs/agents/README.md) · [Agent BE](docs/agents/BE_AGENT.md) · [Agent FE mobile](docs/agents/FE_MOBILE_AGENT.md) · [quy tắc API chung](docs/agents/SHARED_API_RULES.md). Các file AGENTS.md ở gốc, backend, frontend và frontend/src đã trỏ tới hướng dẫn tương ứng.

**Tài liệu chia việc cho 2 người BE và FE mobile:** [tổng quan, phân công và các luồng ghép](docs/team-handoff.md) · [90 API hiện hành](docs/api-reference-current.md) · [Postman collection](docs/stayflow-team.postman_collection.json). Đối chiếu source local ngày 31/10/2026, có phân biệt nghiệp vụ mới và API Cleaner tương thích.

Cập nhật nghiệp vụ ngày 31/10: [requirement mới, luồng hỗ trợ riêng và cách nâng cấp](docs/requirements-update.md). Thông tin lịch sử về ca và Cleaner bên dưới không còn là luồng mặc định của giao diện mới.

Quản lý nhà nghỉ và Smart Housekeeping: khách yêu cầu → nhân viên nhận việc → checklist → lễ tân kiểm tra. React Native/Expo SDK 57, JavaScript; Express/MongoDB lưu dữ liệu thật và kiểm tra quyền trên server.

Theo yêu cầu mới, database đã chuyển từ SQL Server sang MongoDB. Giữ API để app tương thích, transaction cần replica set; không dùng Mongo standalone.

## Chạy demo tiết kiệm chi phí

Backend, MongoDB và web khách chạy trên máy cá nhân; điện thoại dùng cùng Wi-Fi. Không cần mua API quản lý bên ngoài. AI không bắt buộc để dùng form thường. Không có dịch vụ tự gửi SMS/email/quảng cáo.

Cần Node **22.13+ hoặc 24 LTS**, npm, Docker Desktop đang chạy. Node 22.11 trên máy khảo sát không đáp ứng Expo; lượt kiểm tra bundle dùng Node 24.22.1.

```powershell
cd D:\Ky7\mma-project\mma-project
npm --prefix frontend ci
cd backend
npm ci
Copy-Item .env.example .env
# Điền MONGO_URI, JWT_SECRET và DEMO_SEED_PASSWORD; local URI theo example.
cd ..
docker compose -p stayflow-mongo-demo up -d --wait
cd backend
npm run migrate
npm run seed
npm start
```

Database demo riêng `StayFlow`, MongoDB replica set `rs0`, cổng localhost **27027**. Dữ liệu tồn tại trong Docker volume sau restart. Không chạy `down -v` nếu cần giữ dữ liệu.

`.env` local đã được tạo trong phiên triển khai và bị gitignore. Khi clone mới, tự điền secret; `DEMO_SEED_PASSWORD` tối thiểu 10 ký tự. Seed chỉ dùng trong demo, chạy lại không xóa/ghi đè dữ liệu.

Tài khoản: `admin`, `letan`, `cleaner1`…`cleaner6`; mật khẩu từ `DEMO_SEED_PASSWORD`. Môi trường đã seed trong phiên này dùng `StayFlowDemo!2026`. Có 20 phòng, 3 loại, 6 Cleaner, 6 khách, 3 stays, 3 bookings và 2 tasks. Ca demo hết hạn sau 10 giờ; nếu demo ngày khác, Admin thêm ca mới.

## Mobile và form khách

Từ thư mục frontend/:

```powershell
Copy-Item .env.example .env
# EXPO_PUBLIC_API_URL=http://<IPv4-WiFi-của-máy>:4000
npm start
```

`localhost` trên điện thoại là chính điện thoại. LAN trong phiên triển khai là `http://192.168.66.150:4000`; có thể đổi khi đổi mạng. Cập nhật `frontend/.env`, `backend/.env` (`CORS_ORIGINS`, `GUEST_WEB_URL`) và `frontend/eas.json` trước khi build lại.

`npm run web` mở Expo Web. `npm run export:web` tạo `frontend/dist/` được backend phục vụ tại port 4000. Lễ tân vào **Thêm → Lưu trú → Chi tiết → Cấp link mới**, gửi link cho khách. Khách mở `/guest#token=...`, bấm Tiếp tục, không cần tài khoản. Link mới thu hồi link cũ; checkout vô hiệu quyền khách. Route Expo Web dùng chung source ở `frontend/src/app/guest.jsx`.

Nếu điện thoại chưa truy cập được `/health`, kiểm tra cùng Wi-Fi, backend và firewall mạng riêng. Health từ máy tính không chứng minh điện thoại đã kết nối; chưa kiểm thử thiết bị thật.

## Kiểm tra

```powershell
npm test
npm run test:integration
npm run lint
npm run typecheck
npm --prefix frontend exec -- expo install --check
npm --prefix frontend exec -- expo-doctor@latest
npm run export:android
npm run export:web
```

Integration tự tạo `StayFlow_<timestamp>Test`, migrate/seed, test HTTP + MongoDB rồi chỉ xóa database do chính lượt chạy đó tạo. Tài khoản test cần quyền tạo/xóa DB test; không dùng runtime production. `typecheck` kiểm tra cú pháp/module JS/JSX với `checkJs=false`, **không phải kiểm chứng kiểu đầy đủ**. Không có mã app TypeScript.

## AI, push và APK

- AI key chỉ đặt trong `backend/.env`. Mặc định 30 lượt/ngày/actor, timeout 15 giây, tối đa 900 output token. Thiếu key trả 503 và dùng form thường. Trong backend, `node --env-file=.env scripts/evaluate-ai.js` chạy bộ 40 câu khi có key; có thể phát sinh phí provider.
- Push cần FCM, biến file `GOOGLE_SERVICES_JSON`, native build, device token, `PUSH_ENABLED=true`. Socket/polling/in-app chạy độc lập. Chưa xác minh remote push thật.
- EAS preview tạo APK release không cần Metro, development dùng expo-dev-client. `npm run build:apk` hiện chọn **preview-cloud**, API `https://3.26.69.81.sslip.io`, HTTP tắt, Android versionCode2 trên project `@hoangnm17s-team/stayflow-mma`; không đổi project cá nhân mặc định. `preview-team` giữ API LAN cũ. Xem [EAS](docs/eas-build.md).
- **APK cloud mới nhất, dùng mạng riêng/4G:** [Tải APK HTTPS](https://expo.dev/artifacts/eas/NSmxhawpeEXqTFp8b-gd5jyJwV38KxrkoLHmg1pHtZQ.apk), versionCode2, cùng chữ ký bản LAN. Team còn11/15 lượt sau build. Xem [EAS](docs/eas-build.md).
- **APK LAN cũ code1 — lịch sử:** [tải APK release](https://expo.dev/artifacts/eas/Z67uEeXpefc1kga7t6to-IMK6dYY7etUaW89GAsZ11o.apk). Team còn **12/15 lượt Android** sau build; không mua/nâng gói. Xem chữ ký, SHA-256 và [build EAS](https://expo.dev/accounts/hoangnm17s-team/projects/stayflow-mma/builds/24b5d802-5bbe-4464-8887-64d1e247b71b) trong docs/eas-build.md. APK demo cần cùng Wi-Fi với backend LAN; EAS không host backend.

## Khi cần truy cập từ xa

`Dockerfile` và `deploy/compose.yaml` chạy web/API/worker/MongoDB replica set một node và Caddy HTTPS trên EC2 2 GB. Mongo không mở cổng ra Internet; API dùng account riêng. Xem [hướng dẫn deploy MongoDB](docs/deploy-mongo.md). Chưa triển khai cloud thật. Dữ liệu SQL cũ không tự import và không bị xóa.

## Tài liệu

- [Giả định](docs/assumptions.md), [nghiệp vụ](docs/business-rules.md), [kiến trúc](docs/architecture.md), [API](docs/api-contract.md).
- [Đối chiếu yêu cầu](docs/requirements-traceability.md), [tiến độ](docs/progress.md), [kết quả test](docs/test-results.md), [demo](docs/demo-script.md).
- Tham chiếu: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [EAS APK](https://docs.expo.dev/build-reference/apk/), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
