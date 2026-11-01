# StayFlow 1.0.2 — lịch sử 60 ngày, giao diện và dự báo

**Gói mới tự seed:** [Hướng dẫn `StayFlow-1.0.2-autoseed-deploy.zip`](deploy-autoseed.md). Gói mới chạy migrate/seed khi `docker compose up -d --build`; các bước seed Docker thủ công bên dưới là hướng dẫn gói cũ.

Ngày phát hành: 01/11/2026. Android versionCode **4**, package `vn.stayflow.mobile`. API cloud vẫn là `https://3.26.69.81.sslip.io`; profile EAS `preview-cloud`, project/team và keystore giữ nguyên. Đưa backend mới lên trước khi cài APK mới.

## Những gì thay đổi

- Giao diện giữ hệ thống navy–teal và danh sách phòng đã hoàn thiện trong working tree. Tổng quan có thao tác nhanh co giãn, doanh thu theo nguồn, bộ lọc 7/30 ngày và lối vào dự báo. Chữ/chạm/navigation được cải thiện theo skill `ui-ux-pro-max`; không thêm font tải từ mạng hoặc thư viện UI mới.
- Trợ lý có câu hỏi gợi ý về tuần/tháng tới, tình hình phòng và tài chính theo vai trò. Chọn gợi ý chỉ điền form; người dùng bấm Hỏi trợ lý để gửi. Đổi câu hỏi xóa câu trả lời cũ để tránh nhầm ngữ cảnh.
- Dự báo 7/30 ngày dùng `weekday-trend-v2`: hồi quy theo từng thứ trên tối đa 56 ngày gần nhất, giới hạn tốc độ ngoại suy; backtest 14 ngày chỉ sử dụng dữ liệu trước ngày cần dự đoán. Hiển thị tổng doanh thu/lượt nhận phòng, ngày cao điểm, so sánh kỳ trước và khoảng tham khảo theo sai số. Không cam kết độ chính xác tương lai và không coi khoảng này là xác suất bảo đảm.
- AI manager thêm tool read-only `forecast`. LLM chỉ chọn báo cáo/thời hạn; số liệu và câu trả lời được dựng từ kết quả forecast của BE. Dự báo thống kê vẫn dùng được khi provider AI thiếu cấu hình hoặc không khả dụng. Không gọi AI thật trong kiểm thử.

## Seed lịch sử trên DB đã có dữ liệu

Lệnh riêng **`npm run seed:history`** (từ `backend/`) thêm lịch sử cho 60 ngày đã hoàn tất theo giờ Việt Nam, kết thúc vào hôm qua của lần khởi tạo đợt seed. Không cần mật khẩu seed vì không tạo tài khoản.

- Giữ nguyên Users, Rooms, RoomTypes, giá và toàn bộ bản ghi nghiệp vụ có sẵn. Không đổi trạng thái phòng, cycle hiện tại, phiên hoặc password.
- Dùng tối đa 20 phòng đang bật. Mỗi ngày chọn khoảng trống không xung đột stays, booking CONFIRMED và lịch bảo trì. Số lượt thay đổi theo thứ/cuối tuần, thường khoảng 400–500 lượt với 20 phòng, không hứa con số cố định nếu DB đã kín lịch.
- Thêm 40 khách synthetic với ghi chú `Demo 60 ngày`, tránh số điện thoại đã có theo chuẩn hóa. Ba dịch vụ demo ở trạng thái disabled để không xuất hiện trong danh mục bán đang hoạt động.
- Tạo stays CLOSED HOUR/NIGHT, booking CHECKED_IN, đơn FOOD/SPECIAL COMPLETED và phí tương ứng, invoice lines theo nguồn, receipts CASH/TRANSFER và PaymentAllocations. Một phần nhỏ hóa đơn mẫu chưa thanh toán hoặc thanh toán một phần để trải nghiệm công nợ; tổng tiền dùng hàm tính giá của BE.
- Audit `demo.history.60d.v1.started` lưu mốc ngày/định danh; mỗi ngày commit cùng audit checkpoint. Nếu gián đoạn, chạy lại để tiếp tục cùng đợt; ngày hoàn tất không tạo lại. Hoàn tất trả `skipped:false` và summary; chạy lại trả `skipped:true`.
- Không xóa hoặc reset dữ liệu. Nếu một ngày không có bất kỳ phòng nào đủ khoảng trống, script báo lỗi và giữ tiến độ các ngày đã hoàn tất. Không tự ghi đè lịch thật.
- Dữ liệu synthetic được tính vào báo cáo của database được seed. Tổng quan và dự báo có nhãn demo; dự báo trả `simulated:true`. Dùng lệnh này khi chủ động muốn thêm dữ liệu demo, không đưa vào đường nâng cấp tự động cho DB vận hành thật.

Với DB demo hoàn toàn mới, đặt `DEMO_SEED_PASSWORD` trong env rồi `npm run migrate` và `npm run seed`: tạo demo ban đầu + lịch sử. `deploy/compose.demo.yaml` cũng tạo cả hai khi khởi tạo demo mới. Với DB đang có nghiệp vụ, chỉ chạy lệnh lịch sử riêng; không chạy `seed-demo.js` vì script ban đầu sẽ từ chối trộn dữ liệu.

## Cập nhật EC2 hiện có

Gói ZIP chỉ có source/config mẫu; không chứa `.env`, secret, khóa, database hoặc `node_modules`. Server được người dùng xác nhận đang ở `~/stay`, Docker project **`deploy`**, mạng **`deploy_default`**, với `deploy-api-1`, `deploy-mongo-1`, `deploy-caddy-1`. Giữ đúng project và volumes đang dùng. Sao lưu DB trước cập nhật theo [hướng dẫn server](update-server-20261031.md); các ví dụ project `stayflow` trong tài liệu cũ không phải tên project thực tế của server này. Không dùng `down -v` để sửa lỗi DNS.

Upload `StayFlow-1.0.2-deploy.zip` lên EC2, rồi giải nén vào đúng thư mục hiện tại:

```sh
cd ~/stay
unzip -o ~/StayFlow-1.0.2-deploy.zip -d ~/stay
```

Kiểm tra file env cũ vẫn còn. Khai báo helper Compose (tự dùng file Gemini bổ sung nếu đang có):

```sh
dc() {
  if [ -f deploy/.env.gemini ]; then
    docker compose -p deploy --env-file deploy/.env --env-file deploy/.env.gemini -f deploy/compose.yaml "$@"
  else
    docker compose -p deploy --env-file deploy/.env -f deploy/compose.yaml "$@"
  fi
}
dc ps
dc build api migrate
dc run --rm --no-deps migrate node scripts/migrate.js
dc up -d --no-deps --force-recreate api
dc logs --tail=50 api
```

Database người dùng chọn là **`StayFlowDemoV3`**. Trước seed, kiểm tra namespace API đang dùng (không in secret):

```sh
docker exec deploy-api-1 node -p 'process.env.MONGO_DATABASE'
```

Phải hiện `StayFlowDemoV3`. Trong `deploy/.env`, `MONGO_DATABASE` và `authSource` của `MONGO_URI` phải cùng là `StayFlowDemoV3`; `MONGO_ADMIN_URI` vẫn xác thực tại `admin`. Nếu sửa env, cần recreate API để nạp lại cấu hình; restart đơn thuần không nạp env mới.

Lỗi `MongoServerSelectionError: getaddrinfo ENOTFOUND mongo` đã gặp khi chạy seed với `-p stayflow` trong khi Mongo nằm ở project `deploy`. Lệnh seed phải dùng `-p deploy` để vào cùng mạng `deploy_default`; lỗi này chưa chứng minh dữ liệu hay replica set bị hỏng.

Migration 001/002 và checksum giữ nguyên; không thêm migration cho bản này. Nếu migration báo checksum khác, dừng và đối chiếu source, không xóa SchemaMigrations.

### Nếu trống cả phòng và khách

Lệnh cập nhật ở trên không tự tạo dữ liệu mẫu. Với DB đang trống hoặc chỉ có Admin bootstrap, chạy seed ban đầu rồi seed lịch sử:

```sh
MONGO_DATABASE=StayFlowDemoV3 dc run --rm --no-deps --build migrate sh -ec 'export DEMO_SEED_PASSWORD="${DEMO_SEED_PASSWORD:-$BOOTSTRAP_ADMIN_PASSWORD}"; node scripts/migrate.js && node scripts/seed-demo.js && node scripts/seed-history.js'
```

Admin hiện có giữ nguyên tài khoản/mật khẩu. Tài khoản mẫu mới `letan` và `letan_special` dùng `DEMO_SEED_PASSWORD` trong env; nếu chưa đặt, dùng giá trị `BOOTSTRAP_ADMIN_PASSWORD` đang có. Lệnh từ chối DB có dữ liệu không phù hợp, không xóa hoặc reset DB. Sau khi hoàn tất sẽ có 20 phòng, danh mục/khách/giao dịch demo và lịch sử 60 ngày. Tải lại ứng dụng.

### Nếu đã có phòng và khách, chỉ thiếu lịch sử

Để thêm lịch sử demo theo yêu cầu, chạy **sau khi API đã cập nhật**:

```sh
dc exec -T api node scripts/seed-history.js
```

Lệnh không chạy seed ban đầu hoặc thay tài khoản. Đợi báo hoàn tất 60/60, sau đó tải lại ứng dụng. Kiểm tra `/health`, Tổng quan và Trợ lý & dự báo: xem được 7/30 ngày và nhãn demo. Gemini tiếp tục dùng env BE hiện có; không đưa key vào APK.

## BE HANDOFF

- Baseline `59a68cc`, chưa commit; giữ cả các thay đổi source/UI có sẵn được người dùng yêu cầu đóng gói.
- `GET /api/dashboard`: thêm `containsDemoData:boolean` cho hóa đơn trong khoảng chọn.
- `GET /api/forecast?days=7|30`: giữ trường cũ; model mới, thêm `summary`, `lastObservedDate`, `intervalMethod`, `revenueRange`/`demandRange` mỗi ngày. `simulated` đổi thành boolean phản ánh có seed thực tế. Thiếu 56 ngày vẫn `available:false`.
- `POST /api/ai/manager {question}`: response tool thêm `forecast`; data là forecast. Quyền, Bearer và quota giữ nguyên; không có action ghi hay Idempotency-Key mới. Lỗi provider 503 và quota 429 giữ nguyên.
- Không đổi secret, tài khoản, đường ghi nghiệp vụ hoặc migration. Không thực hiện deploy/seed trên cloud từ máy phát triển.

## FE MOBILE HANDOFF

- File chính: `core/theme.js`, `core/visuals.jsx`, `app/index.jsx`, `features/reports/Dashboard.jsx`, `features/reports/Assistant.jsx`; đóng gói luôn theme/Rooms/UI có sẵn.
- API client, phiên, polling/socket và invalidation sau mutation giữ nguyên. Gợi ý không gửi tự động, lỗi giữ câu hỏi. Response AI cũ được xóa khi sửa câu hỏi.
- Khoảng dự báo hiển thị tham khảo; nhãn demo lấy từ BE. Font lớn chuyển thẻ số liệu về một cột và bỏ biểu đồ hẹp, vẫn có số liệu từng ngày.
- Web/Android export và kiểm thử ghi trong kết quả phát hành; không suy ra native screen reader hoặc thiết bị vật lý đã được kiểm tra từ screenshot web.

## Kiểm chứng trước phát hành

- Root `npm run lint`, `npm run typecheck`: đạt. ESLint bỏ qua thư mục kỹ năng `.agents/` ngoài source ứng dụng; không sửa các script skill.
- `npm test`: 36/36 đạt; `test:integration:local` với Node 24.22.1: 46/46 đạt. DB replica set cô lập; không gọi provider AI thật hoặc dùng DB cloud.
- `scripts/verify-ui.cjs`: Expo Web export đạt; Chrome + API/Mongo local đạt sáu nhóm kiểm tra: booking, thu/hoàn cọc, lưu trú/dịch vụ/checkout, nhận phòng mới, thanh toán và giao diện/dự báo/câu hỏi AI. Provider AI được mock ở phía BE; HTTP/quota/báo cáo và DB là thật local.
- Không tràn ngang tại 320×740, 390×844, 768×1024, 844×390 và 1280×900. Đã xem ảnh trang tổng quan, câu hỏi và thẻ dự báo; gợi ý chỉ gọi API sau khi bấm gửi, nút gợi ý tối thiểu 48 px. Không có lỗi JavaScript runtime.
- Lần seed UI tạo 488 stays/invoices, 154 bookings, 223 orders, 463 receipts và 40 khách mới trong 60 ngày (02/09–31/10/2026). Con số thay đổi nếu lịch phòng hiện có khác.
- ZIP được kiểm tra CRC, manifest SHA256, checksum migration và quét secret local. File env/khóa/node_modules không nằm trong ZIP; một tài liệu tiến độ cũ có mật khẩu demo được che trong bản ZIP, không ghi đè tài liệu gốc.
- Chưa chạy nghiệp vụ trên Android vật lý, screen reader native hoặc DB cloud. Cấu hình Gemini thật trên server vẫn cần hoạt động để dùng câu hỏi AI; dự báo thống kê không phụ thuộc key.
