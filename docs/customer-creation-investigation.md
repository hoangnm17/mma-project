# BE HANDOFF — lỗi 500 với khách mới

Ngày kiểm tra: 01/11/2026. Baseline commit `59a68cc`, working tree có thay đổi chưa commit từ trước.

## Kết luận hiện tại

Chưa tái hiện lỗi trên source hiện tại. Chưa xác định nguyên nhân trên server/APK người dùng đang chạy và chưa có bản sửa nghiệp vụ được chứng minh. Không deploy hoặc thay đổi database đang vận hành.

- `POST /api/actions/booking` và `/api/actions/checkin` gọi chung `resolveCustomer` trong `backend/src/services/hotel.js`.
- Với số mới, service tạo `Customers` trong cùng transaction với booking/stay. `mongo-store.js` bổ sung `notes=""` và `tier="STANDARD"` trước khi insert.
- Với số đã có, service dùng lại hồ sơ theo số chuẩn hóa, cập nhật tên/ghi chú và giữ hạng thành viên.
- Tạo khách riêng dùng `POST /api/actions/customer`. Contract, quyền Admin/Receptionist, Bearer và Idempotency-Key giữ nguyên. Không cần đổi FE, env hay migration từ kết quả kiểm tra hiện tại.
- Lỗi 500 hiện chỉ ghi `error.message` vào console; cần log của request thực tế để phân biệt lỗi runtime, quyền DB và khác biệt bản triển khai. Không suy ra lỗi schema chỉ từ thông báo chung trên ứng dụng.

## Kiểm tra

- `npm run test:integration:local`: **45/45 đạt**, dùng MongoDB replica set local riêng, không dùng DB cloud/demo. Log: `artifacts/customer-regression-test.log`.
- Bổ sung ba nhóm kiểm thử trong `backend/test/integration/hotel-requirements.test.js`: khách mới với cả hai action, hai vai trò và HOUR/NIGHT; retry cùng key không tạo trùng; tạo khách riêng rồi nhận phòng giữ GOLD; nhận phòng sai sức chứa rollback khách mới và có thể gửi lại sau khi sửa form.
- Bộ test sẵn có tiếp tục kiểm tra hai booking đồng thời dùng chung số điện thoại chuẩn hóa, rollback khi booking không hợp lệ và nhận phòng từ booking.
- `npm test`: **35/35 đạt**.
- `npm run typecheck`: đạt; `checkJs=false` nên không thay thế kiểm tra HTTP thực.
- ESLint `backend/src backend/test --max-warnings 0`: đạt.
- `npm run lint` toàn repo: không đạt do cảnh báo có sẵn `no-unused-vars` trong `.agents/skills/design-system/scripts/generate-tokens.cjs:148`; không sửa file ngoài phạm vi.
- Chưa kiểm tra trên server đang lỗi, APK/Android thật hoặc giao diện web; các kiểm thử mới gọi HTTP qua Supertest với DB thật local.

## Dữ liệu cần để tiếp tục xử lý

Cần xác định APK/web, URL backend và log API đúng thời điểm thao tác lỗi. Với stack Docker tên project `stayflow` như hướng dẫn deploy hiện tại, chạy trên EC2 sau khi tái hiện lỗi:

```sh
docker ps --filter label=com.docker.compose.project=stayflow --filter label=com.docker.compose.service=api --format '{{.Names}}'
```

Dùng tên container API vừa nhận để đọc log:

```sh
docker logs --since 10m --tail 100 TEN_CONTAINER_API
```

Chỉ cần gửi dòng lỗi tương ứng; không gửi `.env`, token, mật khẩu hoặc khóa riêng. Nếu không có dòng lỗi, cần đối chiếu chính response 500 và request URL để xác định request tới đúng backend.

Không chạy seed/reset, xóa index hoặc sửa migration đã áp dụng để thử khắc phục khi chưa có bằng chứng.
