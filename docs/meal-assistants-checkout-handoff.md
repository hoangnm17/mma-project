# BE HANDOFF — người bón thức ăn và trả phòng

- Baseline: nhánh `master`, commit `3193cdf`; thay đổi chưa commit. Working tree ban đầu sạch. Đã bỏ qua việc đọc `node_modules`.
- Hành vi: lưu hồ sơ và ảnh người bón trong MongoDB; giữ người AVAILABLE ngay khi tạo đơn, chuyển SERVING; hoàn thành/hủy trả AVAILABLE trong cùng transaction. Unique index ngăn một người có hai đơn đang mở. Sửa/xóa hồ sơ không làm thay đổi snapshot tên của đơn cũ.
- Method/path mới: `GET /api/meal-assistants`, `POST /api/actions/meal-assistant`, `POST /api/actions/meal-assistant-delete`. `special-request` thêm `mealAssistantId?`; `quote` thêm `orders` mọi trạng thái và `pendingOrderCount`.
- Quyền: quản lý hồ sơ chỉ Admin; xem/đặt người cần Admin hoặc Receptionist có `canAccessSpecialServices`. GET quote của người thiếu quyền không lộ ID/tên/người bón/ghi chú đơn SPECIAL; chỉ nhận trạng thái/tổng tiền và cảnh báo cần người có quyền xử lý.
- Headers: Bearer; Idempotency-Key 8–100 ký tự cho action. Retry cùng ý định giữ nguyên key; quyền riêng vẫn được kiểm tra trước khi trả kết quả idempotent.
- Request tạo/sửa hồ sơ (template): `{id?,name,birthYear,height,bust,waist,hips,weight,status,photo?}`. Các kích thước là số nguyên cm, cân nặng kg; status `AVAILABLE|SERVING`. Ảnh JPEG/PNG data URI <=500.000 byte sau giải mã, null để gỡ, bỏ field để giữ ảnh cũ. JSON 1 MB chỉ cho action hồ sơ; các action khác giữ 32 KB.
- Request đặt (template): `{purpose:"MEAL_ASSISTANCE",stayId,mealAssistantId,items:[{serviceId,quantity:1}],notes?}`. Bỏ mealAssistantId nếu chỉ đặt dịch vụ.
- Response thành công (shape): quản lý `{id}`; đặt `{id,status:"PENDING",total}`; danh sách là mảng 30 dòng/trang; quote thêm mảng orders không phân trang, pendingOrderCount là số đơn PENDING/PREPARING.
- Lỗi: 400 input/ảnh sai, ID người bón dùng cho FOOD/PRIVATE_SUPPORT; 403 quyền; 404 hồ sơ không có; 409 người chưa sẵn sàng, sửa AVAILABLE/xóa khi đang có đơn, checkout còn đơn mở; 413 body quá lớn. Ghi phí chỉ một lần khi COMPLETED; hủy không tính phí. Lỗi tạo đơn rollback cả thao tác giữ người.
- ID nối tiếp: hồ sơ cấp mealAssistantId; checkin cấp stayId; catalogue cấp serviceId; đặt cấp orderId cho status; checkout cấp invoiceId.
- AI/báo cáo: public dashboard/forecast và câu trả lời AI dùng dữ liệu đang lưu trong DB, bỏ nhãn `containsDemoData`/`simulated`. Giữ dấu nguồn nội bộ và dữ liệu hiện hữu. Dự báo vẫn là ước tính với sai số; không tạo số thay khi provider lỗi/thiếu lịch sử.
- Migration/env: thêm `003_mongo.js` và snapshot, không sửa migration cũ. Chạy `npm --prefix backend run migrate` khi cập nhật backend đang dùng; không seed/reset DB để nâng cấp. Không có biến môi trường/secret mới. CSP cho phép ảnh `self`, `data:`, `blob:` để chọn/nén ảnh cục bộ trên web.
- Tài liệu/Postman: đã cập nhật `api-reference-current.md` và `stayflow-team.postman_collection.json` (93 endpoint templates).

# FE MOBILE HANDOFF — giao diện đã nối API

- Baseline/nhánh/commit: như BE phía trên; chưa commit.
- Màn hình: `Rooms.jsx` có nút **Dịch vụ & trả phòng** tại phòng đang ở, tái sử dụng `StayDetail`. Checkout hiển thị phí đã ghi nhận và mọi đơn ăn uống/hỗ trợ, có bắt đầu/hoàn thành/hủy ngay tại đó, chặn chốt khi còn đơn mở.
- Quản lý: **Thêm → Quản lý người bón**, thêm/sửa/xóa, đầy đủ tên, năm sinh, chiều cao, ba vòng, cân nặng, ảnh và trạng thái. Xóa cần xác nhận, người đang phục vụ bị chặn xóa.
- Đặt: **Thêm → Đút thức ăn → Tạo yêu cầu hỗ trợ → Chọn người bón**; danh sách chỉ lấy AVAILABLE, có phân trang và tải lại. Giá chính thức/snapshot/quyền/trạng thái do backend quyết định.
- Payload/response/IDs: theo BE trên. Ảnh được chọn bằng expo-image-picker và thu nhỏ cạnh dài tối đa 640 px, chuyển JPEG bằng expo-image-manipulator trước khi lưu. Không cần dịch vụ lưu ảnh ngoài.
- Thông báo: `FeedbackProvider` theo dõi kết quả HTTP của thao tác ghi/AI, hiện thông báo thành công hoặc lỗi; không mất khi đóng form. Thông báo chọn ảnh nói rõ cần bấm Lưu. Lỗi giữ form để sửa/thử lại; background refresh phiên không hiện toast.
- Query/session: dùng useResource/useAction hiện có; mutation invalidate query để tải lại quote, phòng, đơn và người bón. Socket/polling vẫn dùng DB làm nguồn trạng thái. Context phiên của Portal giữ nguyên.
- Chỗ BE cần bổ sung: đã thực hiện trong cùng thay đổi; phải cập nhật BE/migrate cùng FE mới.
- Native: thêm hai module Expo tương thích SDK 57 và config quyền ảnh. APK cũ cần build lại để có native module; chưa chạy EAS build/deploy hoặc thử điện thoại thật.

# Kiểm tra

- `npm run lint`: đạt.
- `npm run typecheck`: đạt (checkJs=false như cấu hình dự án).
- `npm test`: 36 bài đạt; đã bổ sung kiểm tra CSP cho ảnh cục bộ.
- `npm run test:integration:local`: 52 trường hợp đạt ở lượt cuối, gồm public AI không gắn nhãn demo, đặt cạnh tranh, rollback giữ người khi tạo đơn lỗi và retry hủy cũ không giải phóng người của đơn mới.
- Export Expo Web: đạt bằng Node 24.22.1, 4 route. Kiểm tra UI dùng Chrome headless + API/Mongo thật ở localhost; AI provider được mock, không gọi AI mất phí.
- UI đã đạt: các luồng booking/checkin/checkout hiện có; bố cục báo cáo ở 320/390/768/844/1280 px; thêm/sửa/xóa người bón, chọn/nén/lưu ảnh từ thiết bị; đặt người AVAILABLE; lỗi 409 hiện thông báo và giữ form; bắt đầu/hoàn thành/hủy dịch vụ ngay trong checkout của phòng; giữ lịch sử sau khi xóa. Lệnh UI chạy tách bước export và `node backend/scripts/test-local-mongo.js --ui` bằng Node 24.22.1. Kết quả/screenshot ở `artifacts/ui-regression/`.
- Chưa xác minh: Android/iOS thật, remote AI/push, production. Không migrate, seed hay deploy lên DB/server đang vận hành.
