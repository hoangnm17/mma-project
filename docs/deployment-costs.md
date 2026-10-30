# Triển khai ưu tiên chi phí

## Demo hiện tại: máy cá nhân + LAN

Không thuê hosting/database/realtime/SMS. API và guest web dùng một Express process, worker cùng codebase, SQL Server Developer trong container riêng. Điện thoại cùng Wi-Fi; máy tính phải mở và backend phải chạy. Đây là phương án demo, không có cam kết uptime hay Internet public.

AI mặc định tắt khi thiếu key; form chọn loại/khung giờ vẫn chạy. Khi bật: 30 calls/ngày/actor qua AiUsage, rate limit, timeout 15 giây, 900 output token. Quota theo actor không phải trần tiền tuyệt đối của toàn cơ sở; cần đặt spending limit ở tài khoản provider nếu dùng thật. Không tự mua credits. Forecast chạy thống kê local, không phát sinh LLM call. In-app/socket không cần FCM; remote push cần cấu hình riêng.

## Một máy có HTTPS khi cần

Scaffold `deploy/compose.yaml`: SQL Server Express, migration job, API+static web+worker, Caddy. Không Kubernetes/Redis/RabbitMQ/microservices. Chi phí server/domain phụ thuộc nhà cung cấp, chưa mua hoặc cam kết mức giá.

SQL Express là bản miễn phí, giới hạn SQL Server 2022 gồm DB 10 GB và buffer pool 1.410 MB; Developer chỉ được dùng dev/test. Nguồn: [Microsoft editions](https://learn.microsoft.com/en-us/sql/sql-server/editions-and-components-of-sql-server-2022?view=sql-server-ver16). Ước lượng triển khai ban đầu một máy Linux x64 có khoảng 4 GB RAM để còn chỗ cho OS, SQL và Node; đây là ước lượng kỹ thuật, chưa load-test.

Trên máy Linux đã có Docker và domain DNS trỏ đúng IP:

```sh
cp deploy/.env.example deploy/.env
# Điền DOMAIN, SQL_PASSWORD, APP_SQL_PASSWORD, JWT_SECRET; không dùng secret demo.
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

Không mở 1433 ra ngoài. Caddy dùng 80/443; API/database không publish port riêng. Migration dùng SQL admin và tạo runtime `stayflow_app` chỉ reader/writer; runtime không dùng sa. `provision-runtime.js` không tự đổi password login đã tồn tại: khi xoay APP_SQL_PASSWORD phải xoay login tương ứng qua quy trình quản trị.

Migration job gọi `bootstrap-admin.js` tạo Admin đầu tiên từ BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD (tối thiểu 12 ký tự), không tạo dữ liệu demo. Khi Admin đã tồn tại, script không đổi mật khẩu/quyền. Sau bootstrap, xóa BOOTSTRAP_ADMIN_PASSWORD khỏi env. Không dùng tài khoản demo ở production. Chưa xác minh backup/restore, domain/TLS và upgrade trên VPS; cần môi trường đích.

Sao lưu định kỳ SQL database và kiểm thử restore trên database riêng trước khi dùng dữ liệu thật; Docker volume không thay thế backup. Không tự xóa volume khi cập nhật image.
