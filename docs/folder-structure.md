# Tách source backend và frontend

Ngày 31/10/2026: giữ một repository, hai thư mục phát triển `backend/` và `frontend/`, dùng chung `docs/`, deploy và công cụ kiểm tra ở gốc.

## Thay đổi đường dẫn

- `src/`, `assets/`, `config/`, `shared/`, `guest-web/` cũ chuyển nguyên trạng vào `frontend/`.
- Package/lockfile của Expo, app.config.js, eas.json, jsconfig.json, public `.env` và `.env.example` chuyển vào `frontend/`. `.env` giữ nội dung và vẫn gitignore.
- Dependency và output local của Expo chuyển cùng app (`frontend/node_modules`, `.expo`, `dist`); máy clone mới cài bằng `npm --prefix frontend ci`.
- `scripts/build-apk.cjs` và script reset template cũ chuyển vào `frontend/scripts/`; công cụ integration/UI/đóng gói chung giữ ở gốc.
- `backend/` giữ API/schema/migration/data config và dependency riêng. Mặc định static web của BE trỏ `frontend/dist/` từ vị trí module, không phụ thuộc thư mục terminal. WEB_DIST production override giữ nguyên.
- Root package chỉ điều phối lệnh. Không dùng npm workspaces/hoist; hai package có lockfile và dependency riêng, giữ cách cài Expo hiện có.
- Docker web stage đọc frontend/package/lockfile/source; runtime BE, dữ liệu Mongo và volume không đổi. UI runner build từ frontend rồi chạy integration từ backend.
- EAS chạy tại frontend, giữ eas.json và định danh app/project. Ignore rules loại secret/dependency/artifact. Chưa chạy EAS build/upload vì đổi thư mục không yêu cầu phát hành.
- AGENTS.md gốc chứa quy tắc chung; backend/AGENTS.md cho BE; frontend/AGENTS.md và frontend/src/AGENTS.md cho mobile. Tài liệu API/Agent và Postman được cập nhật đường dẫn source.

## Dùng sau khi tách

Từ gốc repository, Node >=22.13:

```powershell
npm run setup
# Hai terminal riêng, sau khi Mongo và env đã cấu hình:
npm run dev:backend
npm run dev:frontend
```

Có thể mở terminal ở backend hoặc frontend để dùng npm scripts riêng. Để Agent có đầy đủ bối cảnh hợp đồng hai phía, vẫn mở gốc repository rồi giao vai trò cụ thể. Không giải nén gói hướng dẫn cũ chứa đường dẫn src ở gốc lên cấu trúc mới.

## Xác minh

Đã đối chiếu hash 58 file source/asset/config/default ban đầu sau khi move: nội dung giữ nguyên, trước khi cập nhật riêng hướng dẫn AGENTS.md. Không reset hoặc xóa thay đổi của working tree.

Xác minh bằng Node 24.22.1:

- Root `npm run lint`, `npm run typecheck` và lint riêng frontend đạt. Root ESLint lấy version React từ dependency frontend để không dò nhầm package điều phối.
- `npm test`: 32/32 unit/HTTP test đạt. Lượt thử trong sandbox bị chặn localhost; chạy lại ngoài sandbox đạt, không sửa nghiệp vụ để né lỗi môi trường.
- `npm run test:integration:local`: 40/40 integration đạt trên MongoDB native replica set do runner tạo riêng, migrate 001/002 và DB test riêng.
- `npm run export:web`: đạt, 4 static routes gồm `/` và `/guest`, output `frontend/dist/`.
- `npm run export:android`: đạt, bundle Hermes + assets trong `artifacts/android-bundle/`. Đây là kiểm tra JavaScript bundling, không phải APK/Android thật.
- HTTP smoke: mặc định BE phục vụ `/` và `/guest` từ frontend/dist khi cwd ở cả gốc và backend, có CSP hash; `/api/rooms` chưa đăng nhập vẫn 401.
- 90 route/35 resource/47 action vẫn khớp tài liệu/Postman; 161 liên kết file của README/Agent/contract đã kiểm tra trước khi thêm ghi chú xác minh.
- Package/lockfile của root, backend, frontend khớp dependencies; Docker COPY đều có input; EAS ignore giữ source và loại secret/dependency/output.
- Chạy thử script đóng gói source theo layout mới vào archive kiểm tra riêng: 172 file, có frontend source/lockfile và migration, không có env/keys. Không thay archive phát hành trước đó.

`npm run test:ui` chạy từ gốc đã đạt **5/5 luồng** trên Expo Web/Chrome headless: tải phòng trống cho booking, dialog cọc/hoàn cọc, chi tiết lưu trú/dịch vụ/thu tiền, nhận phòng trực tiếp, checkout ghi phiếu thu/hóa đơn. Runner export từ frontend, phục vụ bundle test riêng tại localhost:4011 và dùng MongoDB test riêng.

Gói `artifacts/StayFlow-Agent-Handoff-20261031.zip` được cập nhật theo layout mới, gồm các file AGENTS.md và hướng dẫn backend/frontend. Không dùng gói cũ có src ở gốc. Chưa build Docker image, EAS/APK, deploy hoặc thử Android thật trong lượt chia thư mục này.

Tài liệu tham chiếu cho việc giữ EAS/config tại gốc app: [Expo build với nhiều app trong một repository](https://docs.expo.dev/build-reference/build-with-monorepos/). App hiện tại vẫn dùng [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
