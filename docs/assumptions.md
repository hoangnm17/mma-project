# Giả định và quyết định

- Một cơ sở, VND nguyên, UTC và hiển thị Asia/Ho_Chi_Minh; không OTA/đa chi nhánh/ví.
- Ban đầu chỉ có Expo SDK 57 template. Source đổi sang JS/JSX, giữ Expo Router theo AGENTS.md, React Navigation bên dưới. Feature navigation dùng Router params.
- App giữ ngay repository hiện có, backend ở backend/. frontend/guest-web/ hướng dẫn route Expo Web dùng chung, không dựng website booking.
- Bảng giá nằm trong RoomTypes JSON được validate, thay RatePlans độc lập. Snapshot trong Stays; không giá theo mùa.
- Booking xác nhận ngay khi tạo. Có cọc phải Admin hoàn trước hủy. Có thể đặt sau expectedEnd của stay chưa quá giờ; stay quá giờ chặn availability cho đến khi lễ tân xử lý.
- Sự cố không tự chặn phòng. Lễ tân xác minh rồi tạo lịch bảo trì; không xóa stay/booking đang trùng.
- Một active assignment/Cleaner; ca do Admin cấp. Mời <=3 người/vòng, <=3 vòng, TTL 60 giây. Dispatch từ 15 phút trước giờ; chỉ bắt đầu sau windowStart.
- FULL có thay ga. Dọn mẫu miễn phí, vẫn có snapshot và ghi phí một lần nếu dịch vụ có phí. Danh mục dọn hệ thống thay bằng migration, không cho CRUD checklist tùy ý.
- Chưa bật tiền công theo việc, không hiển thị thu nhập giả; Cleaner có lịch sử việc.
- Khách đánh giá sau verification khi quyền stay còn hiệu lực. Checkout thu hồi quyền. Web session ở bộ nhớ; reload mở lại link gốc. Native credential trong SecureStore.
- Mọi action cần Idempotency-Key; UI giữ key cho retry chưa thành công, không tự retry mutation khi mất mạng. Cache không lưu xuống đĩa và xóa khi đổi user/logout/401.
- Yêu cầu mới 30/10: Express + MongoDB trên EC2 2 GB thay SQL Server. Một property mutex được ghi đầu transaction và partial unique indexes bảo vệ cạnh tranh. Mở rộng phải đo lại mức tuần tự hóa.
- Theo yêu cầu tiết kiệm: local/LAN trước; không thuê hosting/nâng EAS/mua credits/tự gửi tin. Production scaffold mới dùng MongoDB replica set một node; không có HA. Dữ liệu SQL cũ không tự import.
- Forecast cần 56 ngày thực; seed không bịa doanh thu quá khứ. Marketing chỉ campaign/voucher/tier/bản nháp; không causal uplift/tự gửi.
