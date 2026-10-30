# StayFlow

Quản lý nhà nghỉ và Smart Housekeeping: khách yêu cầu → nhân viên nhận việc → checklist → lễ tân kiểm tra. React Native/Expo SDK 57, JavaScript; Express/SQL Server lưu dữ liệu thật và kiểm tra quyền trên server.

## Chạy demo tiết kiệm chi phí

Backend, SQL Server và web khách chạy trên máy cá nhân; điện thoại dùng cùng Wi-Fi. Không cần mua API quản lý bên ngoài. AI không bắt buộc để dùng form thường. Không có dịch vụ tự gửi SMS/email/quảng cáo.

Cần Node **22.13+ hoặc 24 LTS**, npm, Docker Desktop đang chạy. Node 22.11 trên máy khảo sát không đáp ứng Expo; lượt kiểm tra bundle dùng Node 24.22.1.

```powershell
cd D:\Ky7\mma-project\mma-project
npm ci
cd backend
npm ci
Copy-Item .env.example .env
# Điền SQL_PASSWORD, JWT_SECRET và DEMO_SEED_PASSWORD.
cd ..
docker compose -p stayflow-demo --env-file backend/.env up -d --wait
cd backend
npm run migrate
npm run seed
npm start
```

Database demo riêng `StayFlow`, cổng SQL **15433**, không chiếm SQL khác ở cổng 1433. Dữ liệu tồn tại trong Docker volume sau restart. Không chạy `down -v` nếu cần giữ dữ liệu.

`.env` local đã được tạo trong phiên triển khai và bị gitignore. Khi clone mới, tự điền secret; `DEMO_SEED_PASSWORD` tối thiểu 10 ký tự. Seed chỉ dùng trong demo, chạy lại không xóa/ghi đè dữ liệu.

Tài khoản: `admin`, `letan`, `cleaner1`…`cleaner6`; mật khẩu từ `DEMO_SEED_PASSWORD`. Môi trường đã seed trong phiên này dùng `StayFlowDemo!2026`. Có 20 phòng, 3 loại, 6 Cleaner, 6 khách, 3 stays, 3 bookings và 2 tasks. Ca demo hết hạn sau 10 giờ; nếu demo ngày khác, Admin thêm ca mới.

## Mobile và form khách

Từ thư mục app:

```powershell
Copy-Item .env.example .env
# EXPO_PUBLIC_API_URL=http://<IPv4-WiFi-của-máy>:4000
npm start
```

`localhost` trên điện thoại là chính điện thoại. LAN trong phiên triển khai là `http://192.168.66.150:4000`; có thể đổi khi đổi mạng. Cập nhật `.env`, `backend/.env` (`CORS_ORIGINS`, `GUEST_WEB_URL`) và `eas.json` trước khi build lại.

`npm run web` mở Expo Web. `npm run export:web` tạo `dist/` được backend phục vụ tại port 4000. Lễ tân vào **Thêm → Lưu trú → Chi tiết → Cấp link mới**, gửi link cho khách. Khách mở `/guest#token=...`, bấm Tiếp tục, không cần tài khoản. Link mới thu hồi link cũ; checkout vô hiệu quyền khách. Route Expo Web dùng chung source ở `src/app/guest.jsx`.

Nếu điện thoại chưa truy cập được `/health`, kiểm tra cùng Wi-Fi, backend và firewall mạng riêng. Health từ máy tính không chứng minh điện thoại đã kết nối; chưa kiểm thử thiết bị thật.

## Kiểm tra

```powershell
npm test
npm run test:integration
npm run lint
npm run typecheck
npx expo install --check
npx expo-doctor@latest
npm run export:android
npm run export:web
```

Integration tự tạo `StayFlow_<timestamp>Test`, migrate/seed, test HTTP + SQL rồi chỉ xóa database do chính lượt chạy đó tạo. Tài khoản test cần quyền tạo DB; không dùng runtime production. `typecheck` kiểm tra cú pháp/module JS/JSX với `checkJs=false`, **không phải kiểm chứng kiểu đầy đủ**. Không có mã app TypeScript.

## AI, push và APK

- AI key chỉ đặt trong `backend/.env`. Mặc định 30 lượt/ngày/actor, timeout 15 giây, tối đa 900 output token. Thiếu key trả 503 và dùng form thường. Trong backend, `node --env-file=.env scripts/evaluate-ai.js` chạy bộ 40 câu khi có key; có thể phát sinh phí provider.
- Push cần FCM, biến file `GOOGLE_SERVICES_JSON`, native build, device token, `PUSH_ENABLED=true`. Socket/polling/in-app chạy độc lập. Chưa xác minh remote push thật.
- EAS preview tạo APK release không cần Metro, development dùng expo-dev-client. `npm run build:apk` hiện chọn **preview-team**, project `@hoangnm17s-team/stayflow-mma`; không đổi project cá nhân mặc định. Xem [EAS](docs/eas-build.md).
- **APK UI mới đã build thành công qua team:** [tải APK release](https://expo.dev/artifacts/eas/Z67uEeXpefc1kga7t6to-IMK6dYY7etUaW89GAsZ11o.apk). Team còn **12/15 lượt Android** sau build; không mua/nâng gói. Xem chữ ký, SHA-256 và [build EAS](https://expo.dev/accounts/hoangnm17s-team/projects/stayflow-mma/builds/24b5d802-5bbe-4464-8887-64d1e247b71b) trong docs/eas-build.md. APK demo cần cùng Wi-Fi với backend LAN; EAS không host backend.

## Khi cần truy cập từ xa

`Dockerfile` và `deploy/compose.yaml` gộp web/API/worker/SQL Server Express trên một máy, Caddy HTTPS với domain thật. Không mở cổng SQL ra Internet. Runtime chỉ có DML, migration dùng danh tính riêng. Xem [triển khai và chi phí](docs/deployment-costs.md); chưa triển khai hosting thật.

## Tài liệu

- [Giả định](docs/assumptions.md), [nghiệp vụ](docs/business-rules.md), [kiến trúc](docs/architecture.md), [API](docs/api-contract.md).
- [Đối chiếu yêu cầu](docs/requirements-traceability.md), [tiến độ](docs/progress.md), [kết quả test](docs/test-results.md), [demo](docs/demo-script.md).
- Tham chiếu: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [EAS APK](https://docs.expo.dev/build-reference/apk/), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
