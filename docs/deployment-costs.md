# Chi phí và cấu hình triển khai

Người dùng đã nâng EC2 lên 2 GB và yêu cầu Express + MongoDB thay SQL Server. Cấu hình triển khai hiện tại ở `deploy/compose.yaml`; hướng dẫn đầy đủ ở [deploy-mongo.md](deploy-mongo.md).

Một EC2 chạy MongoDB 8.0 replica set một node + Express/web/worker + Caddy. Không thêm RDS, Atlas, Redis, Load Balancer hoặc NAT Gateway cho bản demo này. Database dùng Docker volume thật; replica set một node hỗ trợ transaction nhưng không có HA. Runtime pool 5, cache Mongo 256 MiB; Mongo container 1 GiB, API 512 MiB, Caddy 96 MiB. 2 GB là cấu hình mục tiêu cho test nhỏ, chưa load-test hoặc đo RAM thực trên EC2.

Chi phí EC2/EBS/public IPv4/network/snapshot phụ thuộc region, instance type và credits của tài khoản. Chưa có dữ liệu tài khoản để xác nhận tổng giá/Free Tier. Không tự tạo tài nguyên hay mua dịch vụ.

AI thiếu key mặc định báo fallback, form thường vẫn dùng được. Khi bật: 30 calls/ngày/actor, timeout 15 giây, 900 output token; quota này không phải trần tiền toàn cơ sở. Forecast thống kê không gọi LLM. In-app/socket không cần FCM; push khi đóng app cần cấu hình riêng.

SQL Server cũ là lịch sử trước yêu cầu chuyển đổi; dữ liệu SQL không tự chuyển sang MongoDB và chưa bị xóa.
