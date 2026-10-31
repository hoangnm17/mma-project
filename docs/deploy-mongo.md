# Deploy StayFlow Express + MongoDB trên EC2 2 GB

Bản hiện tại dùng Express + MongoDB 8.0, không cần SQL Server. Docker chứa API/web/worker, MongoDB replica set một node và Caddy HTTPS. Không cần cài database hoặc Node trực tiếp trên EC2 nếu dùng các lệnh Docker bên dưới. Không cần RDS/Atlas để demo.

## 1. Chuẩn bị EC2

- Linux x86-64, 2 GB RAM là cấu hình thử nghiệm nhỏ; chưa benchmark số user đồng thời. Mongo cache 256 MiB, container Mongo tối đa 1 GiB, API 512 MiB/Node heap 256 MiB, Caddy 96 MiB. Còn phần RAM cho OS; đây là giới hạn cấu hình, không phải số RAM đo được trên EC2.
- Đã có Docker và Git. Kiểm tra `docker compose version`; cài plugin theo [Docker Docs](https://docs.docker.com/compose/install/linux/) nếu chưa có.
- Security Group: TCP80/443 cho Internet, SSH22 chỉ IP quản trị. Không mở 27017 hay 4000. Compose production không publish các cổng đó.
- Trỏ A record của domain/subdomain về Public IP. Không tạo AAAA trừ khi IPv6 hoạt động đúng. Nếu IP thay đổi, cập nhật DNS; cân nhắc Elastic IP và kiểm tra phí AWS.
- Chuyển source phiên bản mới lên server (Git sau khi bạn đã commit/push, hoặc archive `artifacts/StayFlow-mongo-source.tar.gz`). Không copy file env/secrets/node_modules từ máy phát triển. Source hiện chưa tự commit/push.

Nếu dùng archive, ở thư mục mới trên server:

```sh
mkdir -p ~/stayflow
cd ~/stayflow
tar -xzf /duong-dan/StayFlow-mongo-source.tar.gz
```

## 2. Tạo cấu hình riêng cho môi trường cloud

Thay `api.tenmiencuaban.com` bằng domain thật đã trỏ DNS:

```sh
cd ~/stayflow
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work node:24-alpine \
  node scripts/prepare-cloud-env.cjs api.tenmiencuaban.com demo
```

File `deploy/.env` chứa credentials ngẫu nhiên, quyền 600. Script không in secret, không ghi đè file có sẵn. Không dùng mật khẩu LAN đã chia sẻ trong chat cho Internet. Không public file này hoặc output `docker compose config` đã nội suy secret.

Chọn `demo` tạo DEMO_SEED_PASSWORD ngẫu nhiên. Admin/letan/cleaner1…6 dùng mật khẩu này; chỉ chia sẻ riêng với nhóm test. Admin có thể tạo tài khoản riêng từng người. Nếu chỉ muốn Admin và dữ liệu trống: dùng `production` thay `demo` và bỏ `-f deploy/compose.demo.yaml` trong mọi lệnh bên dưới.

## 3. Build rồi chạy

Trên máy 2 GB nên build trước khi chạy stack lần đầu để không tranh RAM với Mongo. Không build khi vẫn đang chạy stack nếu RAM không đủ; có thể build trên máy x86-64 khác rồi chuyển image qua registry hoặc docker save/load.

```sh
docker compose -p stayflow --env-file deploy/.env \
  -f deploy/compose.yaml -f deploy/compose.demo.yaml build

docker compose -p stayflow --env-file deploy/.env \
  -f deploy/compose.yaml -f deploy/compose.demo.yaml up -d

docker compose -p stayflow --env-file deploy/.env \
  -f deploy/compose.yaml -f deploy/compose.demo.yaml ps -a
```

Lần đầu Mongo tự tạo root, keyfile nội bộ, khởi tạo replica set `rs0`, đợi primary; migrate tạo collections/validators/indexes và runtime user. Demo seed chạy trước bootstrap Admin để không bị bỏ qua. `mongo-init` và `migrate` phải **Exited (0)**; Mongo/API/Caddy tiếp tục chạy. API runtime không nhận root URI/password hoặc mật khẩu seed/bootstrap.

Runtime chỉ dùng account `stayflow_app` readWrite trên database StayFlow; tài khoản này vẫn có một số quyền quản lý collection theo built-in role, không phải SQL DML-only. API kiểm tra phân quyền người dùng phía server. Chỉ migration service nhận root URI. Khi đổi env mật khẩu, cần đổi password tương ứng trong MongoDB; sửa env không tự xoay tài khoản đã tồn tại.

```sh
docker compose -p stayflow --env-file deploy/.env \
  -f deploy/compose.yaml -f deploy/compose.demo.yaml logs --tail=80 mongo-init migrate api caddy

curl --fail --show-error https://api.tenmiencuaban.com/health
```

Mong đợi `{"status":"ok"}` và TLS hợp lệ. Sau đó mở web, đăng nhập, tạo ca Cleaner hiện tại và thử task → nhận việc → checklist → lễ tân xác nhận. Seed ca hết hạn sau 10 giờ, không reset DB để thêm ca.

## 4. Dữ liệu, backup và cập nhật

- MongoDB **phải chạy replica set** để dùng transaction. Một node hỗ trợ transaction nhưng không có dự phòng khi máy hỏng. Không chuyển sang standalone để giảm RAM.
- Dữ liệu và keyfile nằm trong volumes `mongo-data`/`mongo-config`. Không chạy `down -v` nếu cần giữ dữ liệu.
- Script migrate chỉ chạy migration `*_mongo.js`; SQL migration 001–006 là lịch sử, không được thực thi.
- Đây là chuyển code/schema sang MongoDB, **không tự nhập dữ liệu SQL cũ**. Database SQL và volume cũ được giữ. Demo mới seed độc lập; nếu cần dữ liệu cũ thì cần export/import riêng và đối soát tiền/lịch sử trước chuyển đổi.
- Snapshot JSON trong API vẫn dùng trường `*Json` dạng string để APK hiện tại tương thích; dữ liệu chính lưu thật trong collections, không lưu toàn bộ database vào một document.
- Backup dùng `mongodump --oplog` với credentials phù hợp và restore vào database/môi trường riêng để kiểm chứng. Chưa kiểm thử backup/restore trên EC2; volume không thay thế backup. Không đặt mật khẩu trực tiếp trong lệnh chia sẻ/log công khai.

## 5. App Android từ xa

Backend giữ API contract hiện tại. APK LAN cũ vẫn gọi IP LAN: sau khi API HTTPS hoạt động, cần profile EAS team dùng URL public, `DEMO_LAN=false`, cùng signing key/project team và build APK mới. Chưa tạo APK public vì chưa có domain/URL được xác minh. Không cần build APK chỉ để kiểm thử backend bằng web.

AI cần API key backend riêng; thiếu key vẫn dùng form thường. FCM chưa cấu hình, để app Cleaner mở khi test thông báo. Không đưa root/Mongo/AI credentials vào app.

## Nguồn kỹ thuật

[MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/), [partial unique indexes](https://www.mongodb.com/docs/manual/core/index-partial/), [Docker Compose](https://docs.docker.com/compose/install/linux/).
