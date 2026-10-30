# EAS và Android APK

## Build trong team — cập nhật 30/10/2026

Đã kiểm tra trực tiếp `eas account:usage hoangnm17s-team --json`: plan Free, Android **2/15** đã dùng, còn **13 lượt** trước lần build này, không có overage/add-on trả phí. User hiện có quyền Owner trên team.

Chuyển project cá nhân yêu cầu Expo sudo reauthentication, nên không thực hiện được bằng phiên CLI hiện tại. Giữ nguyên project cá nhân và tạo project build riêng [@hoangnm17s-team/stayflow-mma](https://expo.dev/accounts/hoangnm17s-team/projects/stayflow-mma), ID thật **431a1384-6506-47bd-9c12-b73faeafceee**. `config/app-base.json` vẫn giữ ID cá nhân; `preview-team` truyền EAS_OWNER/EAS_PROJECT_ID riêng qua app.config.js. Không overwrite hoặc relink project khác của team.

Lệnh khuyến nghị:

```sh
npm run build:apk
```

Script `scripts/build-apk.cjs` tự truyền owner/projectId từ profile team và chạy EAS. Khi gọi CLI trực tiếp, cần cùng biến môi trường ở lúc CLI đọc config:

```powershell
$env:EAS_OWNER='hoangnm17s-team'
$env:EAS_PROJECT_ID='431a1384-6506-47bd-9c12-b73faeafceee'
npx eas-cli@latest build --platform android --profile preview-team
```

Profile team vẫn là internal release APK, dùng API LAN và không cần Metro. Keystore team được EAS tạo riêng. Không đổi giữa project/keystore để cập nhật cùng APK đã phân phối nếu chưa kiểm tra chữ ký. Chưa có APK cũ được phát hành trong dự án này.

Giao diện mới đã qua lint/cú pháp, dependency check, Doctor 21/21 và Android/web export. Native build team đã **FINISHED** ngày 30/10/2026.

### APK thành công

- [Build EAS team](https://expo.dev/accounts/hoangnm17s-team/projects/stayflow-mma/builds/24b5d802-5bbe-4464-8887-64d1e247b71b).
- [Tải APK release](https://expo.dev/artifacts/eas/Z67uEeXpefc1kga7t6to-IMK6dYY7etUaW89GAsZ11o.apk).
- Bản local: `artifacts/StayFlow-preview-team.apk`, 99.912.162 bytes.
- SHA-256: `DA60A4839A8AC7556F599FC300FB9FA36FC06A046D547C9A38CE1226B447FC75`.
- Android apksigner **verify pass**, APK Signature Scheme v2, một signer. Package `vn.stayflow.mobile`, versionName 1.0.0/versionCode 1, minSdk 24, targetSdk 36.
- Sau build, EAS team Free dùng **3/15 Android**, còn **12 lượt**; estimated overage/total 0 cents. Không nâng gói/mua lượt.

APK là release có JS bundle, dùng backend LAN `http://192.168.66.150:4000`; máy tính phải chạy backend, điện thoại cùng mạng và truy cập được API. EAS không deploy backend/SQL. Kết quả emulator smoke test được ghi trong docs/test-results.md; không coi chữ ký/bundle hoặc screenshot web là bằng chứng đã test trên điện thoại thật.

## Cấu hình thực

- Expo SDK 57, JavaScript, Android package `vn.stayflow.mobile`.
- Dynamic `app.config.js` đọc `config/app-base.json`; đã giữ ID được EAS trả thật: `56a8c5e0-f3a8-4fdb-8562-647374f87979`.
- Project [@hoangnm17/stayflow-mma](https://expo.dev/accounts/hoangnm17/projects/stayflow-mma). Đây là project URL, **không phải build/APK URL**.
- development: dev-client, internal APK. preview: internal release APK, không cần Metro. production: AAB và chỉ API HTTPS.
- Icon/splash StayFlow từ `assets/stayflow.svg`, PNG trong assets/images/.
- Không tạo/sửa android/ hoặc ios/ thủ công; dùng CNG/config plugins.

Preview hiện cấu hình API LAN thật `http://192.168.66.150:4000`, `DEMO_LAN=true`; chỉ chấp nhận HTTP IPv4 mạng riêng. Plugin usesCleartextTraffic chỉ bật cho demo; production phải HTTPS. Đổi Wi-Fi/IP phải cập nhật eas.json rồi build lại. Không dùng dữ liệu/credential thật qua demo HTTP.

## Kiểm tra trước build

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npx expo install --check
npx expo-doctor@latest
npm run export:android
npx eas-cli@latest build --platform android --profile preview
```

`.easignore` loại backend, .env, deploy, artifacts và docs khỏi upload. API URL public trong profile không là secret. DB/JWT/AI key không có trong app.

## Lịch sử lần thử tài khoản cá nhân

Đã xác minh phiên Expo hợp lệ, tạo project và remote Android keystore, upload gói mobile khoảng 1,5 MB, tính fingerprint. EAS từ chối tạo build do tài khoản hết Android Free quota tháng; EAS báo reset ngày **01/11/2026**. Không nâng gói hoặc mua lượt. Log local `artifacts/eas-build.log`.

Lần thử cá nhân không tạo APK. Build thành công của team ở phần đầu tài liệu thay thế blocker quota này cho việc demo hiện tại; project cá nhân vẫn được giữ nguyên.

## Push

Đặt file FCM qua GOOGLE_SERVICES_JSON vào EAS environment, cấu hình FCM v1 credentials của cùng Android package/project, cài development/preview build trên Android thật, bật thông báo trong app, rồi bật PUSH_ENABLED phía backend. Nếu dùng Expo push access token, đặt EXPO_ACCESS_TOKEN ở backend. Chưa có FCM/Android vật lý để chứng minh remote push. Không coi Expo Go, emulator startup hoặc outbox SENT là bằng chứng push thành công.
