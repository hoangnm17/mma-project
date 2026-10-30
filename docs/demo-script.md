# Kịch bản demo

## Chuẩn bị

SQL healthy, migration/seed, API và web export đang chạy. Thiết bị cùng Wi-Fi, mở được `/health`. Tài khoản admin/letan/cleaner1/cleaner2 dùng password seed. Admin thêm ca hiện tại nếu ca seed đã hết hạn; hai Cleaner bật nhận việc. Nếu không có APK, dùng hai browser session riêng; không mô tả đây là test native.

## Luồng chính

1. Lễ tân tạo khách ở Khách hàng, chọn phòng sạch ở Phòng, check-in trực tiếp với ngày giờ trả dự kiến. Xem stay và báo giá server.
2. Lễ tân vào Thêm → Lưu trú → Chi tiết, cấp link cho khách; mở link bằng session guest riêng. Không nhập số phòng làm password.
3. Khách thử “Chiều nay 3 giờ dọn phòng và thay ga, xong trước 4 giờ”. Có AI key: xem draft đúng giờ Việt Nam, chỉnh/xác nhận. Không key: app báo AI chưa cấu hình, dùng form FULL và khung giờ cụ thể. Không gọi form thường là AI thật.
4. Chọn giờ trong 15 phút tới để nhìn dispatch; cho phép vào phòng và đồng ý phí hiển thị. Xem lại → xác nhận gửi. Backend lưu task và outbox.
5. Hai Cleaner thấy offer còn hạn. Bấm nhận gần đồng thời: đúng một thành công, bên kia thấy đã hết hạn/thu hồi hoặc task đã có người nhận. Không tắt mạng để giao lại.
6. Đến giờ cho phép, Cleaner nhận việc bấm bắt đầu, tích toàn bộ checklist, nộp. Sau submit Cleaner hết active assignment; task chờ kiểm tra.
7. Lễ tân kiểm tra không đạt với lý do để demo vòng làm lại; assignment cũ còn lịch sử. Nhận/nộp lần mới; lễ tân xác nhận đạt. Dọn khi khách đang ở không làm room trống.
8. Khách đánh giá task hoàn tất. Lễ tân thêm nước/dịch vụ, xem quote, thu tiền mặt/chuyển khoản đúng số dư, checkout.
9. Guest link bị vô hiệu, room DIRTY, có task TURNOVER đúng cycle. Hoàn thành turnover và lễ tân kiểm tra, room mới READY.

## Kiểm tra ngoại lệ

- Bật DND rồi gửi task: bị từ chối; tắt DND mới tạo được.
- Offer quá 60 giây: không nhận dù thông báo còn hiện.
- Tạo task vài giờ sau: không giữ Cleaner bận ngay.
- Mất mạng: không báo thành công giả; tải lại kiểm tra trạng thái trước retry, cùng key khi chưa có kết quả.
- Booking trùng lịch/bảo trì: 409; check-in room DIRTY: bị từ chối.
- Cọc là phiếu thu cũ, checkout không thêm lần thu. Admin hoàn cọc trước hủy; refund sau invoice giảm nghĩa vụ cùng số tiền.
- Khóa Cleaner rồi dùng token cũ: request kế tiếp 401.

Chưa có bằng chứng demo hai Android vật lý/remote push; API race test dùng hai request đồng thời trên SQL Server thật.
