# StayFlow frontend mobile và guest web

Phần việc FE: Expo/React Native, màn hình, form, API client, phiên, cache, notification, assets và build app. `src/app/guest.jsx` là route khách dùng chung source.

Đọc [hướng dẫn Agent FE mobile](../docs/agents/FE_MOBILE_AGENT.md), [quy tắc API chung](../docs/agents/SHARED_API_RULES.md), [API hiện hành](../docs/api-reference-current.md). Giữ checkout chung để Agent đọc được `../backend/` và `../docs/`.

Từ thư mục `frontend/`, dùng Node >=22.13:

```powershell
npm ci
# Chỉ khi chưa có .env:
Copy-Item .env.example .env
# EXPO_PUBLIC_API_URL là origin BE, không có /api ở cuối.
npm start
```

Điện thoại dùng IP LAN của máy chạy BE hoặc HTTPS test, không dùng localhost của máy tính.

```powershell
npm run web
npm run lint
npm run typecheck
npm run export:web
npm run export:android
```

- Web build: `frontend/dist/`, được BE phục vụ khi build đã có.
- Android JS bundle kiểm tra: `artifacts/android-bundle/` ở gốc repository; không thay thế APK/thiết bị thật.
- Expo/EAS chạy từ `frontend/`; `app.config.js`, `eas.json`, package, lockfile, assets và public `.env` đều ở đây. Từ gốc vẫn dùng được `npm start`, `npm run web`, `npm run export:web`, `npm run build:apk` qua lệnh chuyển tiếp.
- `npm run build:apk` dùng profile cấu hình hiện có và chạy EAS thật; chỉ thực hiện khi có nhiệm vụ build. Định danh EAS, package Android và API profile không thay đổi khi tách thư mục.
