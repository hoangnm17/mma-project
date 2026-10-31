# Tiến độ StayFlow — 30/10/2026

## Cập nhật 31/10 — sửa crash và kiểm thử thực tế

Đã sửa thứ tự SessionProvider/PaperProvider để hộp thoại lưu trú và phiếu cọc không mất session, sửa API availability thiếu end, làm gọn Tổng quan/Thêm và tách thao tác thanh toán. MongoDB replica set native test riêng: 40/40 đạt, gồm migrate lặp; unit/HTTP: 27/27; 5 luồng UI 390×844 đạt, không pageerror hoặc tràn ngang Dashboard. Lint/typecheck và export web/Android đã đạt. Chưa tạo APK mới hoặc deploy server. Chi tiết và lệnh chạy lại: [xác minh bugfix](bugfix-verification.md).

## APK dùng API EC2 HTTPS — đã hoàn thành

- User cung cấp API `https://3.26.69.81.sslip.io/health`; curl có kiểm tra TLS trả200/status ok từ máy phát triển. Base URL app là `https://3.26.69.81.sslip.io`, không thêm /health.
- Thêm profile preview-cloud cùng owner/project team, DEMO_LAN=false; npm run build:apk mặc định chọn preview-cloud, giữ preview-team LAN để dùng lại khi cần. Android versionCode2 để cập nhật APK LAN code1.
- Kiểm tra config public đúng team/project/code2/cleartext false, lint và JS syntax/module pass. Team Free trước build Android3/15, còn12. EAS build `69ead6f9-e82c-4483-9dd3-5723a144c718` **FINISHED**, dùng remote keystore9G165Krfjn hiện có. APK thật: https://expo.dev/artifacts/eas/NSmxhawpeEXqTFp8b-gd5jyJwV38KxrkoLHmg1pHtZQ.apk. Local artifacts/StayFlow-cloud.apk. Bundle URL cloud đúng/không LAN, team/project/code2 đúng, manifest HTTP tắt, chữ ký giống APK LAN đều verify pass. Team sau build Android4/15, còn11, overage0. API rooms không auth trả401. Chưa native cloud login/full workflow hoặc Android vật lý. Chi tiết docs/eas-build.md.

## Đợt chuyển Express + MongoDB — yêu cầu hiện hành

- User xác nhận EC2 đã nâng 2 GB và yêu cầu chuyển SQL Server sang Express + MongoDB, sẽ tự deploy. Express đã có, đã chuyển toàn bộ data access sang MongoDB Node driver 6.21, không SQL interpreter; API contract/snapshot JSON giữ để APK tương thích.
- Native Mongo filters/updates/projections/aggregations: mongo-store.js/mongo-views.js, schema definitions, migration 001_mongo.js tạo validators/indexes. Transaction snapshot + majority ghi PropertyMutex đầu tiên và retry conflict, partial unique active task/cleaner + unique idempotency/voucher/task fee. Tham chiếu được kiểm tra server trong transaction; Mongo không có foreign key.
- Local replica set demo mới project stayflow-mongo-demo, localhost27027 (27017 có dịch vụ khác, không đụng). SQL database/volumes cũ giữ nguyên, **chưa export/import dữ liệu SQL sang Mongo**. Migration SQL là lịch sử, không chạy trong migrate mới.
- Production compose: Mongo auth/keyfile + rs-init + migrate/provision/bootstrap + API runtime user + Caddy, không public Mongo/API. Cache256MiB/pool5, memory limits Mongo1GiB/API512MiB/Caddy96MiB. Không cam kết tải 1.000 user; chưa đo trên EC2.
- Unit17/17 pass. Mongo integration 22 kịch bản con pass (TAP24 gồm 2 wrapper): toàn bộ18 workflow cũ + rollback/index guards/validators/read resources. Lần đầu phát hiện refund còn SQL động, đã sửa và chạy lại full integration đạt24/24. Log artifacts/mongo-integration.log.
- Docker image API/web mới build pass. Smoke production-like pass: root auth/keyfile, replica init, migration/seed/bootstrap, API runtime user riêng; health/web200, login3role/read/RBAC pass. API env không có root/bootstrap/demo secret. Backend audit0, lint/compiler JS syntax/module pass. Chưa deploy AWS, chưa TLS/domain và chưa APK public. Xem docs/deploy-mongo.md để deploy sau khi bàn giao.

Các đoạn SQL Server và đề xuất RAM cũ bên dưới là lịch sử trước yêu cầu chuyển đổi, không áp dụng cho cấu hình hiện hành.

## Đang chuẩn bị test từ xa trên AWS

- Cập nhật từ terminal user: đã có EC2, user `ec2-user`, private hostname `ip-172-31-44-211`, x86_64, RAM 913 MiB, không swap, Docker 25.0.14, chưa Compose plugin. Chưa biết public IP/region/instance type/domain/SSH key; chưa có quyền truy cập trực tiếp. Cần nâng máy khoảng 4 GiB để chạy SQL Server + API; 913 MiB thấp hơn mức tối thiểu 2 GB của SQL Server. Hướng dẫn cài Compose plugin thủ công theo Docker Docs, không giả định apt trên Amazon Linux.

- User muốn bạn bè dùng mạng riêng/4G, có tài khoản AWS nhưng **chưa có EC2**, cần hướng dẫn tạo máy tiết kiệm. Máy dev chưa AWS CLI/profile; chưa tạo tài nguyên hay kết nối cloud.
- Đã chuẩn bị `docs/aws-remote-test.md`, script tạo env ngẫu nhiên không ghi đè/in secrets, compose demo override seed trước bootstrap. Đề xuất Lightsail Ubuntu x86-64 4 GB/$24 tháng theo AWS bundles; nếu AWS Academy/Lab không có Lightsail thì EC2 t3a.medium, cần kiểm tra quyền/giá/credits trước launch.
- Chờ máy, SSH access và domain. Chưa API public/chứng chỉ TLS, chưa APK public. APK LAN team cũ vẫn chỉ gọi IP máy dev. Không tốn quota build mới trước khi endpoint HTTPS được kiểm tra.
- Kiểm tra phần chuẩn bị: ESLint và compiler JS syntax/module pass; script env được chạy ở thư mục test riêng, từ chối domain sai/IP, tạo demo env và không ghi đè file cũ; Compose base + demo config validation pass bằng env placeholder. Chưa chạy stack cloud.

## Đợt nâng cấp UI và team EAS đã hoàn thành

- Người dùng yêu cầu UI bắt mắt/dễ nhìn/icon/tiêu đề và kiểm tra EAS team còn lượt. Đã nâng cấp hệ thống UI dùng MaterialCommunityIcons + Expo LinearGradient: login, dashboard hero/thao tác nhanh/metric cards, bottom nav icon, menu Thêm có mô tả, room cards, housekeeping, badge theo màu/biểu tượng, form/loading/empty đồng bộ. Dữ liệu và business actions giữ backend thật.
- Đã kiểm tra team `hoangnm17s-team` Free có Android 2/15, còn 13 trước build; Owner hợp lệ. Transfer project cá nhân yêu cầu sudo nên không chuyển. Tạo project team `431a1384-6506-47bd-9c12-b73faeafceee`, slug stayflow-mma, profile preview-team; giữ ID cá nhân trong config mặc định. `npm run build:apk` tự chọn team.
- Lint/cú pháp, Expo dependency check, Doctor 21/21, Android/web export UI mới pass. Backend unit 17/17 regression pass, không đổi nghiệp vụ backend. Đã nhìn dashboard mới ở viewport 390×844, không tràn ngang; đang làm kiểm tra hình ảnh cuối.
- EAS team build **FINISHED**, ID `24b5d802-5bbe-4464-8887-64d1e247b71b`; APK thật `https://expo.dev/artifacts/eas/Z67uEeXpefc1kga7t6to-IMK6dYY7etUaW89GAsZ11o.apk`, bản local artifacts/StayFlow-preview-team.apk. Verify chữ ký v2 pass, APK có JS bundle/fonts/arm64, version1/minSdk24/targetSdk36.
- Team sau build dùng 3/15 lượt Android, còn 12, estimated/overage 0 cents. Quota cá nhân bên dưới chỉ là lịch sử; không phải blocker team. Default personal project vẫn giữ nguyên.
- Đã cài Success và cold launch Status ok trên emulator Pixel_7 read-only không Metro, process sống, không AndroidRuntime/ReactNativeJS errors sau mở. TCP API LAN từ emulator exit0, APK manifest demo cleartext=true. Chưa end-to-end native login/nghiệp vụ hoặc Android vật lý. Emulator thử nghiệm được dừng/dọn sau kiểm tra.

## Ngữ cảnh và mục tiêu

Đã đọc toàn bộ StayFlow_Coding_Agent_Prompt.md và AGENTS.md. Repo thật: `D:\Ky7\mma-project\mma-project` (thư mục cha không phải app). Ban đầu Expo SDK 57 TypeScript template, chưa backend. Người dùng yêu cầu triển khai trực tiếp, ưu tiên lưu trú/housekeeping/AI, tiếp tục đến khi chỉ còn blocker; sau đó xác nhận chưa có API và ưu tiên backend tối ưu chi phí. Không có yêu cầu mua hosting/nâng EAS.

## Đã triển khai

- App JS/JSX, Expo Router, Paper theme navy/teal, TanStack Query, Axios, RHF/Zod, native SecureStore, role-based UI, loading/error/empty/cache/refetch/pagination.
- Admin/Receptionist: Tổng quan, Phòng, Đặt phòng, Khách hàng, Thêm; Cleaner: Việc mới, Việc của tôi, Lịch sử, Cá nhân. Màn hình lưu trú/dịch vụ/thu tiền/checkout/PDF/CSV, quản trị users/rooms/rates/services/cleaners/shifts, sự cố/bảo trì, notifications, assistant/forecast, CRM/voucher/campaign/tier.
- Express + SQL Server thật, 6 migration có hash, seed 20 phòng/3 loại/6 Cleaner/6 khách/3 stay/3 booking/2 task. Auth/refresh/khóa tài khoản, server RBAC, availability, snapshot giá, cọc/thu nhiều lần/hoàn cọc/checkout/refund/debt/audit/idempotency.
- Housekeeping guest scoped token/hash, xác nhận, DND, dispatch/scoring, offer TTL/round/version, nhận việc transaction + filtered unique task/cleaner, checklist/submit/verify/rework/history, cycle guard, cancellation/reschedule/reassign.
- Socket.IO + durable outbox/lease/backoff/dedupe, in-app notifications và worker nhắc sắp đến/sắp đi/quá giờ. Push sender/device registration/routing đã viết, chưa FCM thật.
- AI-03 provider backend/structured schema/validation/fallback, quota ngày và output cap; AI-01 read-tool allowlist; AI-02 baseline weekday/backtest. Bộ 40 câu/evaluator, không giả AI hoặc forecast.
- Local API+web cùng port, Docker multi-stage và deploy SQL Express/Caddy/runtime DML/bootstrap Admin để giảm số dịch vụ. Không có SMS/email/quảng cáo tự gửi, không thuê dịch vụ.
- README và toàn bộ docs theo đặc tả đã viết.

## Xác minh cuối

- Migration 001–006 đã áp dụng trên demo. Unit **17/17**; integration **18/18 kịch bản** (TAP 19 tính wrapper), SQL Server thật, DB test riêng tự tạo/xóa.
- Test cạnh tranh hai Cleaner/một task, một Cleaner/hai task, booking race, offer hết hạn/thu hồi, rework, guest revoke, occupied/cycle, cọc/receipt/refund retry, voucher maxUses race, maintenance, future dispatch và outbox dedupe đều đạt.
- Lint zero warnings/errors, compiler JS syntax/module pass (`checkJs=false`, không static type safety đầy đủ).
- Expo dependency check up to date, Doctor **21/21**, Android Hermes bundle và web export **mới nhất pass**.
- Docker image `stayflow-demo:local` build pass. Container smoke cùng SQL network trả health/web 200, đã được dừng/xóa.
- Backend npm audit **0** sau override Azure Identity 4.13.0 + uuid 11.1.1; SQL integration đã retest. Mobile còn advisory upstream Expo CLI/config/router, xem test-results.md; không ép downgrade SDK.
- Browser Admin login/dashboard qua LAN mới nhất pass. Bố cục Expo Web 390×844 có scrollWidth=390; screenshot `artifacts/stayflow-mobile.png`. Chưa phải Android device test.

## Đang chạy / cách tiếp tục

- Docker Desktop đã khởi động lại sau khi daemon dừng giữa hai lượt. Compose `stayflow-demo`, SQL port 15433, volume cũ được giữ.
- Backend mới nhất đang chạy tại `http://192.168.66.150:4000` qua Node 24.22.1; frontend static từ dist/. IP có thể đổi khi đổi mạng. Chạy lại bằng README hoặc scripts/start-demo.ps1.
- Demo users admin/letan/cleaner1…6, password môi trường hiện tại `StayFlowDemo!2026`. Secret khác chỉ ở .env gitignored. Ca seed đã có thể hết hạn: Admin thêm ca trước demo hai Cleaner, không reset DB.
- Dùng Node >=22.13 hoặc 24 LTS; host `node` mặc định 22.11 chưa đủ cho Expo. Runtime đã dùng: `C:\Users\84911\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.
- Chưa commit hoặc tạo PR; user không yêu cầu. Không tạo worktree/subagent.

## Blocker và lịch sử build

1. EAS cá nhân từng hết Free quota đến 01/11/2026. Đã giải quyết bằng project/profile team ở đầu tài liệu; **đã có APK/build URL thật**. Tái build dùng `npm run build:apk` (preview-team), không đổi base personal ID. Production cần HTTPS, demo LAN cần máy backend và cùng mạng.
2. AI thật: chưa OPENAI_API_KEY, evaluator 40 câu báo BLOCKED; mock/fallback tests đạt nhưng chưa accuracy/latency provider.
3. FCM/device: thiếu FCM và Android vật lý, chưa chứng minh remote push/native Print/Sharing/SecureStore hay full workflow. Emulator mở APK không Metro đã smoke test đạt.
4. Public hosting/domain/TLS/backup/restore/load: chưa có môi trường đích. Docker/local smoke đã đạt; scaffold production chưa chạy với identity/SQL Express/Caddy thật.

Không báo AI/FCM/full device workflow đã hoạt động khi chưa có bằng chứng. Xem test-results.md, eas-build.md, ui-design.md và demo-script.md. Nếu tiếp tục, ưu tiên hai Android/full workflow và AI evaluator khi có key; không mua dịch vụ nếu chưa có chỉ dẫn.
