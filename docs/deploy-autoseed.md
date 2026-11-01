# StayFlow — ZIP tự migrate và seed 60 ngày

Gói `StayFlow-1.0.2-autoseed-deploy.zip` dùng cho server `~/stay`, project Docker **deploy**, database **StayFlowDemoV3**. Không cần chạy seed bằng tay. Không chứa file env thật hoặc khóa riêng, không build APK.

## Cập nhật server đã có deploy/.env

Upload ZIP lên EC2, sau đó:

```sh
cd ~/stay
unzip -o ~/StayFlow-1.0.2-autoseed-deploy.zip -d ~/stay
docker compose up -d --build
docker compose logs -f migrate
```

Sau dòng `Initialization completed; API can start.`, thoát theo dõi log bằng Ctrl+C rồi mở/tải lại ứng dụng. Ctrl+C ở `logs -f` không dừng các container.

`compose.yaml` ở gốc ZIP tự include `deploy/compose.yaml` và tự đọc `deploy/.env`; tên project được cố định là `deploy`, nên vẫn dùng `deploy_default` và các volumes `deploy_*` hiện có. Yêu cầu Docker Compose >=2.20. Không chạy `down -v` để cập nhật hoặc để sửa lỗi DNS.

Đây là file Compose dành cho bản deploy. Compose Mongo local cũ được giữ trong ZIP dưới tên `compose.local.yaml`; repository phát triển vẫn giữ `compose.yaml` local như trước.

## Cấu hình một lần

Giữ nguyên `deploy/.env` của server; ZIP không ghi đè file này. Kiểm tra:

```dotenv
MONGO_DATABASE=StayFlowDemoV3
DEMO_AUTO_SEED=true
```

Các biến DOMAIN, MONGO_ROOT_PASSWORD, MONGO_ADMIN_URI, MONGO_URI, MONGO_APP_PASSWORD, JWT_SECRET và BOOTSTRAP_ADMIN_PASSWORD vẫn lấy từ cấu hình hiện tại. Không gửi các giá trị secret vào chat/Git.

- `MONGO_URI` dùng hostname `mongo`, tài khoản runtime `stayflow_app`; API tự chọn auth database theo `MONGO_DATABASE` qua `MONGO_AUTH_DATABASE`, nên không giữ nhầm authSource của DB cũ. Username/password không bị thay đổi.
- `MONGO_ADMIN_URI` tiếp tục xác thực root tại `admin`; biến `MONGO_AUTH_DATABASE` chỉ cấp cho API, không cấp cho migrate.
- Admin khởi tạo dùng `BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD` hiện có. Admin đã tồn tại được giữ nguyên.
- Hai Lễ tân mẫu dùng `DEMO_SEED_PASSWORD`; nếu bỏ trống, dùng `BOOTSTRAP_ADMIN_PASSWORD`. Nếu tên Admin trùng `letan` hoặc `letan_special`, tài khoản lễ tân tương ứng được thêm hậu tố `_demo`, không sửa Admin.
- Lệnh `docker compose up` ở gốc dùng biến AI trong **deploy/.env**. Nếu trước đây lưu Gemini ở `deploy/.env.gemini`, đặt các biến AI tương ứng vào `deploy/.env` một lần để lệnh đơn này nạp đủ cấu hình. Không thay key hoặc đưa key vào ZIP/APK.

Với cài đặt mới hoàn toàn, tạo `deploy/.env` từ `deploy/.env.example`, điền domain/secret thực rồi chạy cùng lệnh. Không dùng các giá trị `replace-*` mẫu.

## Thứ tự tự động

1. Mongo khởi động với volume cũ hoặc volume mới, healthcheck đạt.
2. mongo-init xác nhận/khởi tạo replica set và đợi primary.
3. migrate chạy `scripts/initialize.js`: migration 001/002 → provision user runtime đúng DB → bootstrap/giữ Admin → kiểm tra điều kiện seed → seed cơ bản → seed 60 ngày.
4. API chỉ khởi động sau khi migrate kết thúc thành công; Caddy phục vụ cùng API.

DB trống hoặc chỉ có Admin bootstrap được seed 20 phòng, 3 loại phòng, 6 khách ban đầu, danh mục FOOD/SPECIAL/dọn phòng, các booking/stays/đơn/hóa đơn mẫu, rồi thêm 40 khách và lịch sử 60 ngày. Lịch sử dùng HOUR/NIGHT, invoice lines, receipts và payment allocations; hiển thị nhãn demo trong báo cáo/dự báo.

Chạy `up -d --build` lần nữa không tạo trùng: seed cơ bản có audit marker, seed lịch sử có checkpoint từng ngày và marker hoàn tất. Seed bị ngắt giữa chừng tiếp tục từ checkpoint. Không reset database hoặc thay dữ liệu/phòng/tài khoản có sẵn.

Nếu DB đã có nghiệp vụ nhưng không có marker demo, initializer giữ dữ liệu, báo `bỏ qua seed demo`, rồi cho API khởi động. Muốn chủ động thêm lịch sử vào DB như vậy, dùng lệnh `docker compose exec -T api node scripts/seed-history.js` riêng. Đặt `DEMO_AUTO_SEED=false` để chỉ migrate/provision/bootstrap cho lần khởi động sau.

## Kiểm tra sau khi chạy

```sh
docker compose ps -a
docker compose logs --tail=100 migrate api
docker compose exec -T api node -p 'process.env.MONGO_DATABASE'
```

Namespace phải là `StayFlowDemoV3` theo env đã chọn. migrate phải `Exited (0)`; Mongo/API/Caddy tiếp tục chạy. Seed mới có `Demo history 60/60`; chạy lại có `skipped:true`. Nếu initializer lỗi, log ghi giai đoạn và nguyên nhân đã che secret; không có dòng hoàn tất giả.

## BE HANDOFF

Contract HTTP và schema/migration giữ nguyên. Thêm orchestration `backend/scripts/initialize.js`, `DEMO_AUTO_SEED` ở migrate và `MONGO_AUTH_DATABASE` ở API. Hai biến mặc định tương ứng true và namespace được chọn. Root Compose cloud chỉ nằm trong ZIP; Compose local trong repository không bị đổi. Không thực hiện thao tác trên EC2 hoặc DB cloud từ máy phát triển.

Kiểm tra: `npm run lint` và `npm run typecheck` đạt; unit/HTTP 36/36 và integration trên replica set local 47/47 đạt. Integration mới kiểm tra bootstrap → seed → 60 ngày → chạy lại không trùng → bảo toàn DB nghiệp vụ và xác thực runtime khi authSource cũ sai. `docker compose config` từ ZIP với env mẫu đã xác minh đúng project/network/volume, đường dẫn build và depends_on. ZIP được kiểm tra CRC/SHA256, không chứa env/khóa thật. Chưa chạy đầy đủ `docker compose up` trên máy local vì Docker daemon không hoạt động; chưa thao tác lên EC2. Không suy ra kết quả server thực từ các kiểm tra local.

Nguồn cấu hình Compose: [include và env_file](https://docs.docker.com/reference/compose-file/include/), [startup order](https://docs.docker.com/compose/how-tos/startup-order/).
