# Xác minh bộ tài liệu bàn giao BE–FE

> Kết quả dưới đây là lượt tổng hợp tài liệu trước khi tách thư mục. Kiểm tra cấu trúc `backend/` và `frontend/` mới được ghi tại [folder-structure.md](folder-structure.md).

Ngày: 31/10/2026. Phạm vi: tài liệu đối chiếu source local và Postman templates; không phải lượt kiểm thử API trên server đang triển khai.

- Bộ API gồm 90 tổ hợp method/path: 35 resource GET, 47 action POST, 3 auth/exchange POST, 3 AI POST, 1 CSV và 1 health. Socket.IO là giao thức riêng, không nằm trong số 90.
- Kiểm tra tên route/resource/action với các nhánh điều phối trong source; không có route thiếu hoặc dư trong bộ tra cứu/collection.
- Kiểm tra JSON collection, tính duy nhất request, biến Postman đã khai báo, JSON body mẫu và header Idempotency-Key cho tất cả action.
- Kiểm tra cú pháp JavaScript của script lưu token trong login/refresh/exchange; không thực thi request qua Postman.
- Kiểm tra 109 liên kết file trong hai tài liệu bàn giao và API hiện hành: đạt.
- Lint và typecheck hiện tại: đạt. Typecheck dùng checkJs=false như cấu hình dự án, không phải kiểm chứng kiểu đầy đủ.
- `npm test` hiện tại: **32/32 test đạt**, 0 fail/skip; có unit và HTTP tests, adapter AI mock không gọi provider thật.

Kiểm tra tài liệu: **90/90 route khớp source**, **90/90 request Postman khớp**, 3 script Postman parse được, không có biến template chưa khai báo; các giá trị tài khoản/token/key để trống. Kết quả máy đọc được của lượt kiểm tra nằm ở `artifacts/team-handoff-check.json` (artifacts được gitignore).

Không chạy lại Mongo integration, UI test, build APK, remote push hoặc AI provider trong phạm vi tổng hợp này; các checkpoint cũ được dẫn riêng trong team-handoff.md.

Môi trường shell đang dùng Node v22.11.0; dự án khai báo Node >=22.13. Việc các kiểm tra tài liệu/lint/typecheck chạy được không xác nhận Node này đáp ứng Expo build. Hai người nên dùng Node đáp ứng package.json để phát triển/build.

Điểm cần BE/FE xử lý tiếp đã ghi ở team-handoff.md: task-review vẫn phụ thuộc assignment Cleaner cũ trong khi UI khách hiện nút đánh giá cho cả task dọn trực tiếp. Nhận xét dựa trên source, chưa tái hiện runtime trong lượt này.
