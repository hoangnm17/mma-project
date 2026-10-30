# Kết quả kiểm thử — cập nhật 30/10/2026

## Đợt UI v2 và EAS team

UI v2 dùng Expo icons/gradient, dashboard/thao tác nhanh, bottom navigation, menu mô tả, card phòng và các thành phần dùng chung. Lint zero warnings, compiler JS syntax/module pass, Expo dependency check up to date, Doctor 21/21, Android Hermes và web export pass. Regression backend unit 17/17 pass; không thay business service/schema trong đợt UI này.

Đăng nhập Admin qua API LAN và xem dashboard, danh sách phòng, menu Thêm đã kiểm tra trực tiếp ở 390×844. `clientWidth=scrollWidth=390`. Screenshot mới: artifacts/stayflow-login-v2.png, stayflow-rooms-v2.png và stayflow-dashboard-v2.png (file cuối lưu sau bước QA). Chưa phải bằng chứng Android device.

Đã kiểm tra EAS team Free, Android dùng 2/15 trước build. Build team thật ID `24b5d802-5bbe-4464-8887-64d1e247b71b`, owner `hoangnm17s-team`, project `431a1384-6506-47bd-9c12-b73faeafceee`, profile preview-team đã **FINISHED**. [APK release thật](https://expo.dev/artifacts/eas/Z67uEeXpefc1kga7t6to-IMK6dYY7etUaW89GAsZ11o.apk). Sau build: Android 3/15, còn 12 lượt; estimated/overage 0 cents. Lỗi quota cá nhân chỉ là lịch sử.

APK tải về 99.912.162 bytes, apksigner verify pass v2, package vn.stayflow.mobile, minSdk24/targetSdk36, JS bundle assets/index.android.bundle, font và ABI arm64 đều có. Đã cài Success lên emulator Pixel_7 read-only, cold launch MainActivity trả Status ok, process còn chạy; không có AndroidRuntime/ReactNativeJS error trong cửa sổ log sau mở. Release có bundle sẵn, không cần Metro. Emulator TCP tới 192.168.66.150:4000 exit0; manifest demo cho phép cleartext. Đây là startup/network smoke, **chưa test toàn bộ luồng nghiệp vụ/đăng nhập native hoặc thiết bị Android vật lý**. Không dùng các thử nghiệm netcat HTTP không trả dữ liệu để tuyên bố đã đọc HTTP/JSON thành công trong app.

Emulator headless/read-only riêng cho lượt test được dừng sau kiểm tra. Không reset AVD, không thay firewall hay cấu hình mạng. Logs: artifacts/apk-signature.log, apk-badging.log, apk-launch.log, apk-runtime-errors.log, apk-manifest.log.

## Kết quả cuối đã xác nhận

- Unit: **17/17 pass**. Biên giá giờ/ngày/đêm/grace, snapshot, ranking, schema/clarify, AI thiếu key/timeout/JSON sai, provider adapter mock, forecast backtest không nhìn tương lai.
- Integration SQL Server 2022: **18/18 kịch bản pass** (Node TAP tính thêm suite wrapper thành 19 tests). Database test riêng được tạo/xóa mỗi run; không reset dữ liệu demo.
- Bao gồm RBAC/guest scope/locked account; booking race; cọc/check-in/idempotency; DND/duplicate; hai Cleaner một task; một Cleaner hai task; checklist/submit/rework/verify; expired/rescheduled offers; receipt/checkout/refund retries; guest revoke; turnover cycle; task tương lai; hoàn cọc; voucher một lượt với checkout race; maintenance; outbox dedupe.
- Lint không warnings/errors và JS syntax/module check pass ở lượt cuối. `checkJs=false`, không tuyên bố static type safety đầy đủ.
- Expo dependencies up to date; Expo Doctor **21/21**.
- Android Hermes bundle và web static export mới nhất thành công; không phải native APK. Browser Admin login/dashboard qua API LAN đã xác minh; viewport 390×844 có scrollWidth=390, không tràn ngang. Screenshot local `artifacts/stayflow-mobile.png` là Expo Web, không phải Android thiết bị.
- Backend audit sau pin Azure Identity 4.13.0 + uuid 11.1.1: **0 vulnerabilities**. Toàn bộ integration đã chạy lại sau thay lockfile và đạt.

## Phần hoàn thiện đã kiểm tra lại

Navigation 5 mục/Thêm, phân trang, sửa số lượng dịch vụ, CSV file sharing, start-window guard, retry SQL pool sau startup error, audit tất cả action và migration 006 đã có trong source được lint/bundle cuối. Migration 001–006 đã áp dụng lên demo và DB test. Unit 17/17 và integration 18/18 kịch bản đạt sau khi khôi phục Docker; lỗi kết nối tạm thời trước đó không còn là blocker.

Docker image `stayflow-demo:local` build thành công từ Dockerfile multi-stage. Container tạm chạy cùng network SQL demo, dùng database thật, trả `/health` 200 `{"status":"ok"}` và root web 200. Container test đã dừng/tự xóa, giữ SQL và backend chính. Đây là smoke test local, không xác minh production TLS/bootstrap/DML identity trên VPS.

## Chưa xác minh / bị chặn

- Lần EAS cá nhân bị quota; team native APK đã thành công như phần đầu. Không còn blocker build Android.
- Emulator cài/mở release smoke đã đạt. Android vật lý, full native workflow, offline thực tế, Print/Sharing/SecureStore và remote FCM chưa được kiểm thử đầy đủ.
- Provider AI thật: thiếu OPENAI_API_KEY; evaluator báo BLOCKED, 40 câu chưa có accuracy/latency thật.
- FCM: thiếu credential và thiết bị. Socket/in-app không thay bằng bằng chứng push.
- VPS/domain/TLS/backup/restore/load test và bootstrap/runtime identity production: chưa xác minh trên môi trường đích. Docker image/local smoke đã đạt như trên.
- Mobile npm audit checkpoint còn 11 advisory (3 high/3 moderate/5 low), chủ yếu Expo CLI/config và transitive router. App/backend dùng Zod 4.6.7 đã vá; Expo CLI còn Zod 3. Không ép downgrade Expo về SDK 51 theo đề xuất audit vì phá SDK 57. Cần theo dõi bản vá upstream; không tuyên bố toàn bộ dependency sạch.

Log local (gitignored): artifacts/unit.log, integration.log, lint.log, android-export.log, web-export.log, expo-doctor.log, eas-build.log, mobile-audit.json, backend-audit.json, docker-build.log. Chạy lại theo README, kiểm tra exit code từng lệnh. Các log có thể được ghi đè bởi lượt chạy sau.
