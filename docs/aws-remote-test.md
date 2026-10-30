# AWS cho bạn bè test từ xa

## Trạng thái

Chưa có EC2/Lightsail, chưa có AWS identity/SSH được cấu hình trên máy phát triển. Chưa tạo tài nguyên, chưa triển khai Internet và chưa build APK với API public. APK LAN cũ không tự đổi endpoint.

## Máy đề xuất

Amazon Lightsail là dịch vụ trong tài khoản AWS, phù hợp một máy demo với giá gói dễ dự tính. Chọn Linux/Unix, OS Only Ubuntu 22.04 LTS, x86-64, Singapore, dual-stack/public IPv4, 2 vCPU/4 GB RAM/80 GB SSD, gói niêm yết $24/tháng. Kiểm tra giá tại màn hình tạo máy trước khi xác nhận. Đây là ngân sách máy, không phải tổng hóa đơn: thuế, snapshot, domain và lưu lượng vượt gói có thể cộng thêm; credits/Free Tier tùy tài khoản, không mặc định miễn phí.

Nếu tài khoản AWS Academy/Learner Lab không hỗ trợ Lightsail, dùng EC2 Ubuntu 22.04 x86-64 t3a.medium (4 GiB), EBS gp3 30 GB; kiểm tra dự toán theo region trước khi launch. SQL Server container cần x86-64, không chọn Graviton/ARM. 4 GB là mức khởi đầu ước lượng, chưa load test. Khi build image trên máy 4 GB, ưu tiên build trước khi SQL chạy hoặc build image trên máy phát triển để tránh hết RAM.

Nguồn: [Lightsail bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html), [SQL Server supported container hosts](https://learn.microsoft.com/en-us/sql/linux/containers/deploy?view=sql-server-linux-ver16).

## Tạo máy trên AWS Console

1. Vào Lightsail → Create instance → Singapore → Linux/Unix → OS Only → Ubuntu 22.04 LTS.
2. Chọn gói public IPv4 4 GB/$24 (xác nhận lại giá trên console), đặt tên `stayflow-demo`. Tải SSH key nếu muốn kết nối từ máy phát triển, giữ file riêng.
3. Networking → Create static IP → gắn vào máy vừa tạo, cùng region. IP động thay đổi sau stop/start; [AWS static IP guide](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-create-static-ip.html).
4. Firewall IPv4/IPv6: mở TCP 80/443 cho web; TCP 22 chỉ IP quản trị hoặc browser SSH theo console. Không mở 1433/4000.
5. DNS: trỏ A record subdomain như `api.tenmiencuaban.com` về static IPv4. Chỉ thêm AAAA nếu IPv6 đã được cấu hình đúng. Chưa có domain thì báo lại để chọn phương án tên miền test, chưa cần mua ngay.
6. Gửi region, static IP, user SSH (`ubuntu` với Ubuntu), đường dẫn `.pem` trên máy phát triển và domain. Không gửi nội dung key/password/access key trong chat.

Nếu dùng EC2: SSH user `ubuntu`, Security Group TCP22 từ IP quản trị, 80/443 Internet; không mở SQL. EC2 public IPv4/EBS tính riêng. Không dùng Spot cho demo cần online ổn định. Không tạo RDS SQL Server, NAT Gateway hoặc Load Balancer cho cấu hình một máy này.

## Triển khai khi đã có máy/domain

Sau khi Docker Engine + Compose plugin được cài theo [Docker Ubuntu guide](https://docs.docker.com/engine/install/ubuntu/), đưa source không kèm `.env`, keys, node_modules, artifacts lên thư mục riêng của app. Không đưa secret lên Git hoặc dùng mật khẩu demo LAN trên Internet.

Tại root source trên máy đích, dùng Node 24 tạo env một lần:

```sh
node scripts/prepare-cloud-env.cjs api.tenmiencuaban.com demo
docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.demo.yaml build
docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.demo.yaml up -d
```

Script tạo mật khẩu SQL/JWT/demo ngẫu nhiên, không in secret, không ghi đè file cũ. Demo override seed dữ liệu trước bootstrap, chỉ dùng database demo mới. Admin/letan/cleaner1…6 cùng mật khẩu `DEMO_SEED_PASSWORD` trong file env, chia sẻ riêng với người test. Không seed vào database đã dùng thật. Ca Cleaner seed có thời hạn, Admin thêm ca hiện tại trước mỗi buổi test.

Không dùng override demo khi triển khai dữ liệu thật: tạo env với `production` và chỉ dùng compose.yaml. Runtime dùng SQL login DML riêng; migration dùng SQL admin. Không chạy `docker compose down -v` khi cần giữ dữ liệu. Sau bootstrap thành công, bỏ giá trị BOOTSTRAP_ADMIN_PASSWORD khỏi env và recreate API để gỡ secret này khỏi runtime.

Kiểm tra container/migration logs tại máy đích (không công khai file env hoặc toàn bộ compose config đã nội suy). Kiểm tra từ Internet:

```sh
curl --fail --show-error https://api.tenmiencuaban.com/health
```

Chỉ báo thành công sau HTTPS chứng chỉ hợp lệ, health status ok, đăng nhập web và test housekeeping qua backend/database thật. Chưa thực hiện các bước này trên AWS.

## APK cho mạng riêng/4G

Khi API HTTPS đã đạt kiểm tra, tạo profile EAS team riêng cho public demo, APP_ENV=preview, DEMO_LAN=false, EXPO_PUBLIC_API_URL=https://domain-thật. Giữ owner/projectId team và signing key của bản đã phát hành. Build EAS rồi xác minh APK dùng HTTPS; gửi link mới khi build FINISHED. Không chạy build trước khi có URL đã xác minh để tránh tốn quota.

Bạn bè cài bản APK mới, tắt Wi-Fi dùng 4G, đăng nhập tài khoản test riêng, chạy luồng check-in → task → accept → checklist → verify → checkout. AI vẫn cần key backend; FCM chưa cấu hình, để app Cleaner mở khi thử thông báo.

## Kết thúc buổi test

Lightsail vẫn tính phí khi stop instance; nếu kết thúc hẳn, sao lưu dữ liệu cần giữ rồi xóa tài nguyên và snapshot/IP không dùng theo console. Không tự xóa dữ liệu. Kiểm tra [AWS billing FAQ](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html), đặt Budget alert (cảnh báo không tự chặn chi tiêu).
