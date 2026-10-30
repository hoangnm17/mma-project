# Giao diện StayFlow v2 — 30/10/2026

## Hướng thiết kế

Mobile trước, nền sáng xám xanh, navy/teal làm màu nhận diện, mint/blue/amber/rose phân nhóm tác vụ. Icon vector MaterialCommunityIcons đi cùng nhãn tiếng Việt, không dùng emoji làm icon điều hướng. LinearGradient từ Expo tạo điểm nhấn cho login và dashboard.

- Dashboard: lời chào/ngày Việt Nam, thông báo có dữ liệu unread thật, hero vận hành, 4 thao tác nhanh, 4 thẻ chỉ số, lượt sắp trả hôm nay, doanh thu/thực thu/công nợ tách rõ.
- Điều hướng: icon + nhãn, nền mint cho mục đang chọn; 5 mục staff, 4 mục Cleaner. Menu Thêm có icon, mô tả chức năng và chevron.
- Header mỗi feature: tên rõ cấp bậc, mô tả ngắn, icon đặc trưng. Panels có icon tiêu đề, khoảng cách và bo góc thống nhất.
- Room cards: số phòng lớn, loại phòng, trạng thái có màu + chữ + icon, sức chứa/tầng có biểu tượng, giá và nút nhận phòng.
- Housekeeping: phần giải thích luồng, nút tạo yêu cầu có icon, thời gian và badge trạng thái dễ phân biệt.
- Form: viền/chip/focus đồng bộ, đăng nhập có icon tài khoản/mật khẩu, bật/tắt hiện mật khẩu. Loading/empty có biểu tượng và lời dẫn rõ.

## Dữ liệu và giới hạn

Không hard-code số phòng/doanh thu/task vào UI. Số liệu đều từ API; thẻ và badge không quyết định quyền hay chuyển trạng thái nghiệp vụ. Các cập nhật UI không thay transaction, pricing hoặc RBAC backend.

Dependencies mới: `@expo/vector-icons` và `expo-linear-gradient`, cài bằng Expo install theo SDK 57. Source vẫn `.js/.jsx`, không thêm native project thủ công.

## Xác minh

Lint/cú pháp, Doctor 21/21, dependency check và Android/web export đạt. Đã đăng nhập qua API LAN, kiểm tra dashboard/rooms/menu ở 390×844, clientWidth/scrollWidth đều 390, không console JS errors. Screenshot ở artifacts/ (gitignored).

EAS team đã build APK FINISHED; chữ ký v2 verify pass, cài và cold launch thành công trên emulator Pixel_7 read-only, không cần Metro, không lỗi AndroidRuntime/ReactNativeJS sau mở. Đây là startup smoke, chưa full native workflow hoặc thiết bị vật lý. Không dùng screenshot web để tuyên bố đã nhìn/kiểm thử đầy đủ UI Android.
