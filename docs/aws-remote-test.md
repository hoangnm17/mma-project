# AWS cho bạn bè test từ xa

Người dùng đã có EC2 x86-64 và nâng lên 2 GB RAM; đã cài Docker/Git. Trước đó `docker compose` chưa có plugin. Chưa cung cấp public IP/domain/SSH key nên chưa kết nối hay deploy trực tiếp lên EC2.

Theo yêu cầu mới, backend dùng Express + MongoDB, không cần SQL Server. Giữ EC2 2 GB hiện tại để kiểm thử nhỏ trước; không tạo thêm Lightsail hoặc nâng máy theo các gợi ý SQL Server trước đây. Xem [hướng dẫn deploy MongoDB](deploy-mongo.md) cho lệnh đầy đủ, cấu hình HTTPS và cách chạy demo.

APK LAN hiện tại vẫn cần rebuild với API HTTPS sau khi deploy. Không báo khả năng chịu 1.000 user khi chưa đo số user đồng thời/query mix/latency/RAM. Chưa có bản APK public hoặc xác nhận TLS cloud.
