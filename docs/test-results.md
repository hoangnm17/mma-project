# Kết quả kiểm thử — cập nhật 30/10/2026

## APK cloud HTTPS — kết quả mới nhất

- API https://3.26.69.81.sslip.io/health trả200/status ok qua TLS; rooms chưa auth trả401.
- EAS team build69ead6f9-e82c-4483-9dd3-5723a144c718 FINISHED; [APK cloud](https://expo.dev/artifacts/eas/NSmxhawpeEXqTFp8b-gd5jyJwV38KxrkoLHmg1pHtZQ.apk), versionCode2, HTTP tắt. Remote Doctor21/21, lint và JS syntax/module pass.
- APK đã tải99.910.738bytes và verify chữ ký giống APK LAN. JS bundle có đúng URL HTTPS cloud, không URL LAN cũ; embedded config đúng project/team/code2, manifest cleartext false. SHA256 ở eas-build.md.
- Team sau build dùng4/15 Android, còn11; overage0. Chưa cài/chạy đăng nhập native cloud hoặc test Android vật lý trong lượt đổi endpoint này. Emulator smoke của APK LAN bên dưới không phải bằng chứng native cloud.

## Chuyển MongoDB (kết quả hiện hành)

- Backend Express + MongoDB driver6.21, MongoDB8.0 replica set thật trên Docker localhost27027; không dùng SQL Server trong lượt kiểm tra này.
- Unit17/17 pass; integration **22 kịch bản con pass**, TAP24/24 tính hai wrapper: 18 workflow và bốn Mongo checks (rollback, partial unique active task/cleaner, database validator, mọi read resource Admin không lộ passwordHash).
- Chạy mỗi lần trên database StayFlow_<timestamp>Test riêng, migrate/seed rồi chỉ xóa database do chính lượt chạy tạo. SQL database cũ giữ nguyên, không import hoặc reset.
- Lần đầu thất bại nhánh refund do SQL template động chưa chuyển; đã sửa sang native insert và full run sau đạt24/24. Không chỉ chạy lại ca lỗi.
- Docker multi-stage API/web image mới build thành công, log artifacts/mongo-cloud-build.log. Production-like auth/runtime smoke đã đạt: keyfile/root auth/rs-init/migrate/seed/bootstrap; health/web200, login3role + read/RBAC, API chỉ dùng stayflow_app và không nhận root/bootstrap/demo secrets. Backend audit0. ESLint zero warning và compiler JS syntax/module pass. AWS2GB/load/TLS/backup chưa kiểm thử. Không tạo APK mới trong đợt backend này.

Các kết quả SQL Server/EAS/UI bên dưới là lịch sử trước chuyển MongoDB.

## Đợt UI v2 và EAS team

UI v2 dùng Expo icons/gradient, dashboard/thao tác nhanh, bottom navigation, menu mô tả, card phòng và các thành phần dùng chung. Lint zero warnings, compiler JS syntax/module pass, Expo dependency check up to date, Doctor 21/21, Android Hermes và web export pass. Regression backend unit 17/17 pass; không thay business service/schema trong đợt UI này.

Đăng nhập Admin qua API LAN và xem dashboard, danh sách phòng, menu Thêm đã kiểm tra trực tiếp ở 390×844. `clientWidth=scrollWidth=390`. Screenshot mới: artifacts/stayflow-login-v2.png, stayflow-rooms-v2.png và stayflow-dashboard-v2.png (file cuối lưu sau bước QA). Chưa phải bằng chứng Android device.

Đã kiểm tra EAS team Free, Android dùng 2/15 trước build. Build team thật ID `24b5d802-5bbe-4464-8887-64d1e247b71b`, owner `hoangnm17s-team`, project `431a1384-6506-47bd-9c12-b73faeafceee`, profile preview-team đã **FINISHED**. [APK release thật](https://expo.dev/artifacts/eas/Z67uEeXpefc1kga7t6to-IMK6dYY7etUaW89GAsZ11o.apk). Sau build: Android 3/15, còn 12 lượt; estimated/overage 0 cents. Lỗi quota cá nhân chỉ là lịch sử.

APK tải về 99.912.162 bytes, apksigner verify pass v2, package vn.stayflow.mobile, minSdk24/targetSdk36, JS bundle frontend/assets/index.android.bundle, font và ABI arm64 đều có. Đã cài Success lên emulator Pixel_7 read-only, cold launch MainActivity trả Status ok, process còn chạy; không có AndroidRuntime/ReactNativeJS error trong cửa sổ log sau mở. Release có bundle sẵn, không cần Metro. Emulator TCP tới 192.168.66.150:4000 exit0; manifest demo cho phép cleartext. Đây là startup/network smoke, **chưa test toàn bộ luồng nghiệp vụ/đăng nhập native hoặc thiết bị Android vật lý**. Không dùng các thử nghiệm netcat HTTP không trả dữ liệu để tuyên bố đã đọc HTTP/JSON thành công trong app.

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
# Lượt xác minh 31/10/2026 — lỗi thao tác và giao diện

- MongoDB 8.2.6 replica set native localhost:27037: 40/40 integration đạt, database riêng được dọn sau test. Migration được chạy lại trước các test để kiểm tra tính lặp.
- 27/27 unit/HTTP test đạt, gồm CSP cho script khởi tạo Expo.
- 5 luồng UI trên Chrome headless 390×844 đạt: phòng trống không cần giờ trả; phiếu thu/hoàn cọc; chi tiết lưu trú/thêm dịch vụ; nhận phòng; thanh toán trả phòng. Không pageerror; Dashboard không tràn ngang.
- Lint/typecheck và export web/Android đạt. Chưa xác nhận APK Android thật hay cloud. [Chi tiết](bugfix-verification.md).
