# Cập nhật requirement ngày 31/10/2026

> Đã có lượt sửa và kiểm thử tiếp theo: [lỗi crash và kết quả xác minh](bugfix-verification.md). Các trạng thái chưa chạy test/bị thiếu bộ nhớ bên dưới ghi lại checkpoint trước đó.

Bộ requirement người dùng cung cấp ngày 31/10 thay các giả định cũ về ca làm, loại thuê DAY và quy trình chỉ Cleaner thực hiện. Chức năng mới được triển khai trong source local; chưa cập nhật server hoặc APK.

## Tài khoản và dọn phòng

Tài khoản mới chỉ có Admin và Receptionist. Không cần đăng ký ca để lễ tân bắt đầu và hoàn tất công việc dọn phòng. Checklist, quyền vào phòng, DND và cycle phòng vẫn được kiểm tra. Tài khoản Cleaner và lịch sử cũ giữ để tương thích dữ liệu; không tạo mới Cleaner. Tiếp nhận việc đã giao cần lý do.

## Khách, đặt phòng, nhận và trả phòng

Chuẩn hóa số điện thoại Việt Nam dạng +84/0084 về 0 để tìm và tái sử dụng hồ sơ. Có thể tạo/cập nhật hồ sơ ngay trong đặt phòng hoặc nhận phòng. Các lần ghi chạy trong transaction nên không tạo trùng khi hai yêu cầu cùng tới.

Giao dịch mới chọn HOUR hoặc NIGHT. Dữ liệu DAY cũ vẫn đọc và tính giá được. Không bắt nhập giờ trả dự kiến: server suy ra một giờ cho HOUR hoặc mốc 12:00 Việt Nam tiếp theo cho NIGHT, dùng cho nhắc việc và kiểm tra lịch. Đây là khoảng giữ phòng mặc định; nhân viên có thể điều chỉnh lịch. Lưu trú chưa trả thực tế vẫn chặn nhận phòng mới, không tự checkout.

Giá NIGHT tính nhiều đêm và phụ thu giờ lẻ sau thời gian ân hạn; phụ thu cho một ngày lẻ không vượt giá thêm một đêm. Bảng giá được snapshot khi check-in. Lễ tân được điều chỉnh số tiền cuối, phải nhập lý do; hóa đơn lưu số tiền gốc, số tiền cuối, chênh lệch, người và thời điểm. Thu phần còn lại có thể thực hiện cùng transaction checkout để tránh sai lệch giá khi thao tác chậm. Hoàn cọc dư và hoàn tiền vẫn cần quyền Admin.

## Ăn uống và hai dịch vụ riêng

Tab Thêm có Ăn uống, Hỗ trợ ăn uống và Gọi hỗ trợ riêng. Hai mục sau chỉ hiện cho Admin hoặc Receptionist có quyền canAccessSpecialServices; API kiểm tra lại quyền từ database. Đây là yêu cầu nội bộ, không gọi điện hay gửi tin ra bên ngoài.

Admin quản lý danh mục riêng theo từng nhóm. Đơn lưu món/dịch vụ, số lượng, ghi chú và giá tại lúc đặt; đi qua Chờ xử lý → Đang chuẩn bị → Hoàn tất hoặc Hủy trước hoàn tất. Chỉ đơn hoàn tất ghi phí một lần; đơn hủy không tính phí. Phải xử lý/hủy các đơn còn chờ trước checkout. Hai mục hỗ trợ có hàng đợi và lịch sử riêng. Danh mục thường không trả dịch vụ riêng; người không được cấp quyền chỉ thấy dòng hóa đơn tổng quát “Dịch vụ riêng”, không nhận tên dịch vụ/ID đơn. Thu hồi quyền cũng chặn thông báo riêng chưa gửi và danh sách thông báo cũ.

## Báo cáo

Admin chọn hôm nay, tháng này hoặc khoảng thời gian và xuất CSV. Doanh thu theo thời điểm chốt hóa đơn; số thu/hoàn theo thời điểm thực thu/hoàn. Công nợ và trạng thái thanh toán phản ánh các hóa đơn trong kỳ tại thời điểm xem. Giảm giá, điều chỉnh và hoàn tiền được phân bổ tỷ lệ theo giá trị dòng hóa đơn, làm tròn VND chính xác. Tỷ lệ sử dụng tính thời gian phòng có khách trên tổng giờ của các phòng đang hoạt động; không phải thống kê lịch sử thay đổi số phòng/bảo trì.

## Migration và xác minh

Chạy migrate trước khi khởi động backend mới. Migration 002 bổ sung Orders, quyền, metadata điều chỉnh và indexes/validators. Snapshot schema theo từng version giữ checksum 001 đã triển khai; không xóa database hay reset seed để nâng cấp.

Unit test, lint/typecheck và export được chạy riêng trong đợt này. Có thêm integration cho hồ sơ khách, thanh toán điều chỉnh, đơn ăn uống, quyền dịch vụ riêng và dọn trực tiếp. Chưa xác nhận các integration mới trên MongoDB vì Docker daemon local chưa chạy; chưa xác nhận Android thật, remote push hoặc cloud.

Kết quả thực tế: 26/26 unit test đạt; lint và typecheck đạt; import API và so khớp schema runtime/snapshot 002 đạt. Export web/Android bị dừng do Node hết bộ nhớ cả khi giới hạn một worker, chưa tạo bundle mới thành công. Các integration mới chưa được chạy, không coi việc có test source là đã xác nhận hành vi trên database.
