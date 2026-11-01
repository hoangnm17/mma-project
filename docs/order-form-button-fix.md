# FE MOBILE HANDOFF — nút xác nhận tạo yêu cầu bị mờ

- Baseline: master/3193cdf cùng các thay đổi đang có trong working tree, chưa commit.
- Triệu chứng được người dùng xác nhận: đã chọn phòng và dịch vụ nhưng nút xác nhận vẫn mờ ở Đút thức ăn/Gọi hỗ trợ riêng.
- Sau đó người dùng báo nút tự hoạt động lại trước khi bản sửa local được triển khai. Không có trace phiên production để kết luận chắc nguyên nhân lần đó; điều kiện giỏ bên dưới là điểm gây nhầm có thể xác minh trực tiếp từ source.
- Nguyên nhân trong source: chọn dịch vụ chỉ cập nhật selectedServiceId, chưa đưa vào orderForm.items. Nút xác nhận kiểm tra items không rỗng, cần thêm thao tác Thêm vào yêu cầu; giao diện không giải thích điều kiện này.
- Sửa `frontend/src/features/orders/Orders.jsx`: chọn dịch vụ là thêm ngay một mục số lượng 1; chọn lại không tạo trùng hoặc tăng số lượng. Sửa số lượng trong mục đã chọn. Bỏ mục cuối khóa nút; có thể chọn lại. Cùng form áp dụng FOOD và cả hai purpose SPECIAL.
- Hiển thị điều kiện còn thiếu trước nút: phòng, dịch vụ, người bón nếu chọn đặt người, số lượng 1..1.000 và tổng tiền tối đa 1 tỷ. Không bỏ validation để bật nút với dữ liệu thiếu.
- Danh sách stay OPEN thêm page/Pager theo API hiện hành, giữ phòng đã chọn khi chuyển trang. Danh mục toàn disabled giải thích cần Admin bật/thêm dịch vụ.
- Luồng mới: Tạo yêu cầu → chọn phòng → chạm dịch vụ → chỉnh số lượng/ghi chú nếu cần → tùy chọn người bón → xác nhận. Không còn bước Thêm vào yêu cầu riêng.
- Method/path và payload giữ nguyên: GET stays?status=OPEN&page, GET special-services?purpose, POST actions/special-request `{purpose,stayId,items:[{serviceId,quantity,notes}],notes,mealAssistantId?}`; FOOD dùng food-items/food-order. Không gửi giá FE làm giá chính thức.
- Quyền giữ nguyên: FOOD Admin/Receptionist; SPECIAL Admin hoặc Receptionist có canAccessSpecialServices. Backend quyết định giá snapshot, trạng thái, reservation và idempotency.
- Response 200 `{id,status,total}`; useAction tải lại query sau mutation; lỗi API giữ form và thông báo chung. ID mới là orderId, không dùng thay stayId.
- BE HANDOFF: không đổi contract/schema/migration/env. Kiểm tra API local trên replica set riêng đạt 52 trường hợp, bao gồm tạo/hoàn thành/hủy cho cả MEAL_ASSISTANCE và PRIVATE_SUPPORT. Không ghi đơn thử vào server đang vận hành.
- Kiểm tra UI bổ sung trong backend/scripts/ui-smoke.js: chọn phòng/dịch vụ đủ bật nút, chọn lại không trùng/tăng số lượng, người bón thiếu vẫn khóa và có lý do; PRIVATE_SUPPORT bỏ/chọn lại mục, số lượng sai, tạo đơn đúng purpose/stayId/tổng; FOOD tạo qua UI rồi xử lý cùng checkout. Kết quả lần chạy cuối được ghi sau xác minh.
- Android/iOS thật chưa kiểm tra; cần build APK mới để nhận thay đổi FE. Không cần đổi API origin hoặc cấp lại chứng chỉ HTTPS.

## Kết quả xác minh

- `npm run lint`, `npm run typecheck`: đạt.
- `npm run test:integration:local`: 52 trường hợp đạt, dùng MongoDB test tách biệt.
- Expo Web export bằng Node 24.22.1: đạt, 4 route.
- Chrome headless với API/MongoDB local thật: tạo thành công cả MEAL_ASSISTANCE (có người bón), PRIVATE_SUPPORT và FOOD sau khi chọn phòng/dịch vụ, không qua nút Thêm riêng. Đã kiểm tra thiếu thông tin, số lượng 0, bỏ/chọn lại, chọn trùng, lưu đúng purpose/stayId/tổng và xử lý checkout. Không có lỗi JavaScript runtime. Lỗi 409 chủ động trong ca giữ người vẫn hiện thông báo và giữ form đúng.
- Không triển khai lên server đang dùng, không tạo đơn thử trên production, không chạy EAS build.
