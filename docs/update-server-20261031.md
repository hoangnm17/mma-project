# Cập nhật server StayFlow đang chạy trong ~/stayflow

Áp dụng cho EC2 hiện có Docker Compose + MongoDB replica set, không phải cài mới. APK 1.0.1/code3 dùng API https://3.26.69.81.sslip.io. Không chạy seed, không tạo lại file .env, không chạy docker compose down -v.

## 1. Chuyển gói source từ Windows lên EC2

Trong PowerShell trên máy Windows, thay đường dẫn key bằng file .pem bạn dùng SSH:

```powershell
scp -i "C:\duong-dan\key.pem" "D:\Ky7\mma-project\mma-project\artifacts\StayFlow-update-20261031.tar.gz" ec2-user@3.26.69.81:/home/ec2-user/
Get-Content -Raw "D:\Ky7\mma-project\mma-project\backend\.env.gemini" | ssh -i "C:\duong-dan\key.pem" ec2-user@3.26.69.81 'umask 077; cat > ~/stayflow/deploy/.env.gemini && chmod 600 ~/stayflow/deploy/.env.gemini'
ssh -i "C:\duong-dan\key.pem" ec2-user@3.26.69.81
```

Gói source được tạo từ working tree hiện tại, gồm cả các file mới chưa commit. Git pull chưa lấy được các sửa đổi chưa push. Gói không chứa .env thật, node_modules, .git hoặc khóa riêng.

Lệnh thứ hai chuyển riêng cấu hình Gemini đã tạo sẵn vào deploy/.env.gemini qua SSH, quyền 600. Key không nằm trong archive hoặc APK. File này chọn AI_PROVIDER=gemini, GEMINI_MODEL=gemini-3.5-flash-lite và giới hạn 30 lượt/ngày/người dùng. Nếu nhận gói source trên máy khác, tạo file này trực tiếp bằng nano trên server với key riêng; không gửi key lên Git/EAS.

Nếu đang dùng terminal EC2 trên AWS thay vì SSH bằng key, có thể upload file bằng công cụ truyền file của bạn rồi tiếp tục bước 2. Không gửi file key hoặc API key vào chat.

## 2. Kiểm tra đúng thư mục và project

Các lệnh tiếp theo chạy trên terminal Linux EC2:

```sh
cd ~/stayflow
pwd
test -f deploy/.env && echo "Da co deploy/.env"
test -f deploy/.env.gemini && echo "Da co cau hinh Gemini"
docker ps --format 'table {{.Names}}\t{{.Label "com.docker.compose.project"}}'
```

Cột project của container API/Mongo phải là stayflow cho các lệnh bên dưới. Nếu đang dùng tên khác, thay `-p stayflow` trong hàm dc bằng tên đó trước khi tiếp tục, tránh tạo stack/volume khác.

```sh
dc() { docker compose -p stayflow --env-file deploy/.env --env-file deploy/.env.gemini -f deploy/compose.yaml "$@"; }
dc ps
```

## 3. Sao lưu database

```sh
umask 077
backup_file="$HOME/stayflow-db-$(date +%Y%m%d-%H%M%S).archive.gz"
dc exec -T mongo sh -c 'exec mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --oplog --archive --gzip' > "$backup_file"
```

Chỉ tiếp tục nếu mongodump kết thúc không lỗi. Kiểm tra file backup:

```sh
test -s "$backup_file" && gzip -t "$backup_file" && echo "Backup OK: $backup_file"
```

Nếu container không có mongodump hoặc không xác thực được, dừng tại đây và kiểm tra cấu hình backup trước khi nâng cấp. Backup chứa dữ liệu và tài khoản; giữ quyền file riêng như umask ở trên.

## 4. Giải nén bản mới, giữ cấu hình server

```sh
cd ~/stayflow
umask 022
tar -tzf ~/StayFlow-update-20261031.tar.gz | head -20
tar -xzf ~/StayFlow-update-20261031.tar.gz -C ~/stayflow
dc config --quiet
```

`dc config --quiet` không in mật khẩu. File deploy/.env cũ và deploy/.env.gemini được giữ vì archive không chứa hai file này. DOMAIN trong deploy/.env phải là 3.26.69.81.sslip.io để web/API khớp APK này. Không chạy script tạo env mới để tránh đổi JWT/DB credentials.

Umask 022 ở bước giải nén dành cho source không chứa secret, để runtime user trong image đọc được mã nguồn. File .env thật không bị giải nén/chmod; backup ở bước 3 vẫn giữ quyền riêng.

## 5. Dừng API và build tuần tự

EC2 2 GB: dừng API để dành RAM; Mongo và volume vẫn giữ nguyên. Web/API tạm ngừng trong quá trình build.

```sh
dc stop api
dc build api
```

Nếu build API thành công mới tiếp tục:

```sh
dc build migrate
```

Không chạy hai build song song. Image migrate dùng chung Dockerfile và tận dụng cache từ build API. Nếu build báo thiếu RAM, giữ nguyên Mongo/data và xử lý lỗi build; không xóa volume.

## 6. Chạy migration bằng image mới

```sh
dc run --rm --no-deps migrate node scripts/migrate.js
```

Đây là override command: chỉ chạy migrate, không seed/provision/reset tài khoản. Migration 001 đã có sẽ được kiểm tra hash và bỏ qua; 002 thêm schema/indexes mới nếu chưa chạy. Lệnh phải kết thúc với exit code 0. Nếu có lỗi "Migration đã đổi", dừng và gửi đúng thông báo lỗi, không xóa SchemaMigrations để ép chạy.

## 7. Khởi động API mới

```sh
dc up -d --no-deps --no-build --force-recreate api
dc restart caddy
dc ps
dc logs --tail=60 api caddy
```

Recreate API nạp cả code mới lẫn biến môi trường hiện tại. Restart Caddy làm mới kết nối tới container API mới; Mongo không bị restart.

## 8. Kiểm tra rồi cài APK mới

```sh
curl --fail --show-error https://3.26.69.81.sslip.io/health
curl -s -o /dev/null -w '%{http_code}\n' https://3.26.69.81.sslip.io/api/rooms
```

Health phải trả {"status":"ok"}; /api/rooms khi chưa đăng nhập phải trả 401. Sau đó mở web/API domain, đăng nhập và cài APK 1.0.1/code3 từ EAS. Thử nhận phòng → chi tiết lưu trú → thêm dịch vụ → thu tiền/trả phòng, rồi phiếu cọc/hoàn cọc. Nếu giao diện tài khoản cũ không hiện quyền mới, đăng xuất và đăng nhập lại. Không cần xóa ứng dụng/data để cập nhật nếu chữ ký APK trùng bản cũ.

Kiểm tra container đã nhận cấu hình Gemini (không in key):

```sh
dc exec -T api node -e 'console.log({provider:process.env.AI_PROVIDER,model:process.env.GEMINI_MODEL,keyConfigured:!!process.env.GEMINI_API_KEY})'
```

Mong đợi provider gemini, model gemini-3.5-flash-lite, keyConfigured true. Trong app mở Trợ lý và thử một câu hỏi; cấu hình tồn tại chưa chứng minh provider còn quota. Backend giữ timeout 15 giây và tối đa 900 token đầu ra. Thiếu key, provider hết quota hoặc lỗi thì trả thông báo AI, không làm hết phiên đăng nhập.
