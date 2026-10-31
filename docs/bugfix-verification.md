# Sửa lỗi thao tác và kiểm thử ngày 31/10/2026

Kết quả: 40/40 integration trên MongoDB 8.2.6 replica set native, 27/27 unit/HTTP test, lint và typecheck đạt. 5 luồng UI chạy qua trên Chrome headless 390×844 không có pageerror: tải phòng trống, phiếu cọc + thu/hoàn cọc, chi tiết lưu trú + thêm dịch vụ, nhận phòng trực tiếp, thu tiền + checkout. Dashboard tải đủ dữ liệu và không tràn ngang. Đây là kiểm thử Expo Web dùng chung source; chưa chạy APK mới trên Android thật. MongoDB production Docker 8.0 chưa được chạy trong phiên này.

## Lỗi thoát khi mở hộp thoại

Chi tiết lưu trú (StayDetail) và phiếu cọc/hoàn cọc (DepositDetail) gọi useSession. PaperProvider trước đây ở ngoài SessionProvider; PortalManager của Paper dựng nội dung hộp thoại ở ngoài context phiên đăng nhập. Component nhận null và lỗi khi mở. SessionProvider hiện bao cả PaperProvider, nên Portal giữ được session; QueryClientProvider vẫn nằm ngoài cả hai.

## Các lỗi đi kèm

- Form đặt phòng gửi start và mode, không còn gửi end. API availability trước đây bắt buộc end và trả 400; nay suy ra khoảng giữ phòng theo hình thức thuê nếu thiếu end. Có regression HTTP bằng đúng payload của app.
- Đổi lượt lưu trú trên form dọn phòng trước đây có thể giữ stayId trong state của form cũ. Form được remount theo stayId.
- Pager từng nằm trong Dataset, biến mất khi trang rỗng và không thể quay lại. Pager hiện nằm ngoài danh sách ở Phòng, Đặt phòng và Khách hàng.
- Tìm khách được debounce và chỉ áp dụng kết quả của số đang nhập, tránh ghi đè từ kết quả cũ.
- Chọn cho nợ giờ chuyển sang nhập khoản thu thực tế, thay vì đồng thời tự thu đủ phần còn lại. Điều chỉnh giá chỉ dùng một tổng cuối và lý do, tránh nhập giảm/phụ thu cùng tổng cuối gây xung đột.
- Backend chỉ cấp hash cho inline script từ HTML export của Expo; script khởi tạo không còn bị CSP chặn. Test HTTP xác nhận không mở quyền unsafe-inline.
- Metro từng tái sử dụng URL API đã inline khi đổi môi trường. Runner UI luôn export --clear với API localhost dành riêng cho test.

## Giao diện

Tổng quan dùng số phòng theo trạng thái và bốn thao tác chính, bỏ hero/slogan. Báo cáo chi tiết mở khi cần. Lưu trú tách Trả phòng / Dịch vụ / Thu tiền / Link khách. Bỏ mô tả lặp ở tab Thêm và header mặc định; ô nhập có accessibilityLabel. Không thay cơ chế xác nhận phí và quyền vào phòng.

## Chạy lại

Dùng Node >=22.13 (đợt xác minh dùng Node 24.22.1).

```powershell
npm test
npm run lint
npm run typecheck
npm run test:integration:local
npm run test:ui
```

Runner local dùng mongod native, mặc định Windows MongoDB 8.2 ở Program Files; có thể đặt MONGOD_BINARY tới executable khác. Nó khởi tạo replica set một node localhost:27037, dùng database StayFlow_<timestamp>Test và chỉ xóa database của chính lượt chạy; không kết nối URI cloud/demo. Dữ liệu server test đặt trong artifacts/integration-mongo. Playwright lấy từ bundled runtime hoặc CODEX_NODE_MODULES, Chrome phải được cài. UI test build ở artifacts/ui-web, API và web test ở localhost:4011. Không dùng bundle UI test này để deploy.

Ảnh và kết quả UI lưu ở artifacts/ui-regression. Bundle Android export là bước kiểm tra đóng gói JavaScript/Hermes, không thay thế thử APK trên Android thật. Chưa deploy server hoặc tạo APK EAS mới trong đợt sửa này.
