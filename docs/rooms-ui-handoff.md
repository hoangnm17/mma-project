# FE MOBILE HANDOFF — thống nhất theme và danh sách phòng

Ngày: 01/11/2026. Baseline: `master`, `59a68cc`; thay đổi chưa commit. Giữ nguyên các thay đổi BE/docs có sẵn trong working tree.

## Giao diện và phạm vi

- `frontend/src/core/theme.js`: nguồn token chung cho Paper và component tùy chỉnh. Navy `#142D43`, teal `#08777C`, nền `#F5F8FA`, thẻ trắng; màu trạng thái có cặp nền/chữ riêng. Đã đo tương phản chữ thường trên các nền tương ứng, tối thiểu 4.5:1.
- Font hệ thống theo cấu hình sẵn có của Paper, hỗ trợ tiếng Việt, không tải font hoặc thêm dependency. Chữ nội dung 16/24, chữ phụ 14/22, nhãn 14/20, tiêu đề phòng 28/36.
- Khoảng cách 4/8/12/16/24/32; bo góc 8/12/20; vùng chạm bộ lọc và thao tác phòng tối thiểu 48. Nhãn bộ lọc/thao tác phòng được xuống dòng.
- `_layout.jsx` dùng theme chung; `visuals.jsx` tái xuất palette để giữ tương thích các màn hình hiện có. `ui.jsx` đồng bộ Screen, Panel, Field, Select, Badge, Dialog và ActionButton. Badge thụ động có chữ/icon, không còn mang hình thức nút bấm.
- `features/rooms/Rooms.jsx`: tìm kiếm luôn hiển thị; bộ lọc mở/thu gọn, hiện trạng thái và loại đang chọn. Thẻ có số phòng, trạng thái, loại, sức chứa/khu vực, giá giờ/đêm và giờ trả dự kiến. Một cột trên điện thoại, hai cột từ 768 px; quay về một cột khi fontScale > 1.3. Số phòng hiển thị là số dòng của trang hiện tại, không giả lập tổng toàn khách sạn.

## API và nghiệp vụ giữ nguyên

Method + path: `GET /api/rooms`, `/api/roomTypes`, `/api/room-history`, `/api/room-cleaning-history`; `POST /api/actions/checkin`.

Query phòng giữ `search`, `page`, `status`, `typeId`; đổi tìm kiếm/bộ lọc vẫn về trang 1. Pager vẫn dùng mốc 30 dòng. Không sửa BE, DTO, định giá, quyền hay API/Postman.

Payload nhận trực tiếp giữ `roomId`, `customerId` hoặc `customer: {name, phone, notes}`, `guests`, `mode: HOUR|NIGHT`, thông qua `customerBody(form)` hiện có. Response giữ `{id: stayId}`. ID lịch sử vẫn là `room.id`; không chuyển sang bookingId/stayId.

Query refetch/cache/session: tiếp tục `useResource`/`useAction`, giữ Idempotency-Key cho retry cùng ý định, invalidation sau mutation, polling/socket/phiên như cũ. Kéo xuống tải lại có chỉ báo refreshing. Form giữ input khi lỗi; loading/error/empty và retry của Dataset được bảo toàn. Check-in chỉ hiện khi trạng thái do BE trả là READY; BE vẫn xác minh trong transaction.

Chỗ BE cần bổ sung: không có.

## Kiểm tra

- Frontend `npm run lint`: đạt; root `npm run typecheck`: đạt.
- Root `npm run lint`: bị chặn bởi cảnh báo có sẵn `no-unused-vars` ở `.agents/skills/design-system/scripts/generate-tokens.cjs:148`; không sửa script ngoài phạm vi.
- `npm run test:ui`: đạt 5 bước với API/Mongo local cô lập và tài khoản Admin kiểm thử: đặt phòng, thu/hoàn cọc, chi tiết/dịch vụ/checkout, nhận phòng trực tiếp, ghi nhận thanh toán/hóa đơn. Không dùng DB demo/cloud hoặc gọi AI thật.
- Bản cuối export Expo Web đạt bằng Node v24.22.1. Kịch bản UI chạy lại với API/Mongo local và Chrome đạt toàn bộ 5 luồng trên, thêm tìm kiếm rỗng, lọc trạng thái/loại phòng và mở lịch sử. Trạng thái chọn của bộ lọc được kiểm tra qua `aria-pressed`; vùng chạm được đo >= 48 px.
- Bố cục tại 320×740, 390×844, 768×1024, 844×390 và 1280×900 không tràn ngang. Đã xem ảnh điện thoại/desktop, bộ lọc mở, tên phòng dài và trạng thái lỗi. Loading, HTTP 503, tên dài, giá lớn, MAINTENANCE/DISABLED dùng fixture chỉ cho phần hình ảnh; các luồng nhận phòng/checkout dùng API thật local. Không có lỗi JavaScript runtime; hai response 503 trong console là fixture có chủ đích.
- Ảnh kiểm tra lưu trong `artifacts/rooms-refresh/`, gồm `rooms-390.png`, `rooms-1280.png`, `filters-expanded.png`, `rooms-empty.png`, `rooms-loading.png`, `rooms-error.png`, `rooms-long-labels.png`. Script kiểm tra tạm đã được xóa, không thêm test/dependency vào app.
- Chưa xác minh Android/iOS thật, Dynamic Type native và screen reader native. App tiếp tục dùng light theme; không bổ sung dark mode trong phạm vi này.
