# StayFlow — quy tắc chung cho Agent BE và FE mobile

Các đường dẫn trong tài liệu tính từ gốc repository chứa `package.json`, `frontend/`, `backend/` và `docs/`. Snapshot được đối chiếu ngày 31/10/2026. Agent phải kiểm tra source hiện tại trước khi sửa; không coi snapshot là bằng chứng về bản đang deploy.

## Nguồn thông tin và cách bắt đầu

1. Source frontend nằm trong frontend/; package/config/.env của Expo cũng nằm tại đó. Root package chỉ chuyển tiếp lệnh. Đọc AGENTS.md áp dụng cho file sẽ sửa, file vai trò và ticket của người dùng.
2. Đọc [phân công/luồng nghiệp vụ](../team-handoff.md), phần liên quan trong [API hiện hành](../api-reference-current.md), rồi source cả điểm gọi và điểm xử lý API.
3. Requirement hiện hành là [requirements-update.md](../requirements-update.md), có checkpoint sau tại [bugfix-verification.md](../bugfix-verification.md). `api-contract.md` và phần Cleaner/DAY trong tài liệu cũ là lịch sử.
4. Chỉ làm ticket được giao. Kiểm tra `git status`, giữ thay đổi có sẵn; không reset/ghi đè công việc của người khác hoặc tự chia Agent/triển khai.
5. Nếu requirement, tài liệu và source khác nhau, ghi rõ khác biệt và tác động. Không tự biến một hành vi nghi lỗi trong source thành yêu cầu đúng. Tiến hành phần đã rõ; chỉ hỏi khi thiếu quyết định ảnh hưởng kết quả.

## Bối cảnh nghiệp vụ tối thiểu

- StayFlow quản lý phòng, khách, booking, lưu trú, dịch vụ/đơn, dọn phòng, tiền và báo cáo; có guest web dùng chung source.
- Hai vai trò nhân viên mới: **Admin** và **Receptionist**. Guest là phiên từ link. Cleaner chỉ giữ để tương thích tài khoản/dữ liệu cũ; không tạo mới Cleaner hoặc bắt buộc ca trong dọn trực tiếp.
- Giao dịch mới dùng HOUR/NIGHT; DAY chỉ đọc/tính dữ liệu lịch sử. BE suy ra giờ dự kiến khi bỏ trống, không tự checkout khi quá giờ.
- Lễ tân được điều chỉnh tổng checkout có lý do; cho nợ, hoàn cọc và hoàn sau chốt cần Admin.
- FOOD và SPECIAL là order có workflow. SPECIAL tách `purpose=MEAL_ASSISTANCE|PRIVATE_SUPPORT`; Admin hoặc Lễ tân được cấp `canAccessSpecialServices` mới truy cập được.
- Dọn trực tiếp dùng task-desk-start/task-desk-complete, vẫn kiểm tra DND, consent, checklist, khung giờ và cycle. TURNOVER được BE tạo khi checkout.

## Contract HTTP bất biến khi chưa có thay đổi được giao

- Origin public, ví dụ `http://<IP-LAN>:4000`, không có `/api`; Axios nối `/api`, Socket.IO nối origin. Điện thoại không dùng localhost của máy chạy BE.
- Auth: `Authorization: Bearer <JWT>`. Login/refresh/exchange và `/health` là public; guest link token phải exchange trước khi làm Bearer.
- GET danh sách trả mảng trực tiếp. Resource có pagination dùng `page` từ 1, 30 dòng; không có envelope `data/total/hasNext` chung. Chỉ dùng filter được resource hỗ trợ.
- Ghi nghiệp vụ: `POST /api/actions/<name>`, JSON, header `Idempotency-Key` 8–100 ký tự; thành công hiện trả 200. Giữ nguyên tên camelCase như roomTypes/roomType/serviceItem.
- Một ý định ghi = một key. Retry cùng actor/action/body giữ nguyên key và thứ tự trường JSON; đổi payload/ý định cần key mới. Scope key theo actor, không theo endpoint.
- UUID truyền string; tiền là JSON number nguyên VND, không chuỗi có dấu phân cách. Giờ là ISO có offset hoặc Z; hiển thị giờ Việt Nam.
- Không nhầm bookingId → stayId từ checkin → invoiceId từ checkout. Trước chốt hoàn theo receiptId bằng receipt-return; sau chốt hoàn theo invoiceId bằng refund.
- serviceId là mục danh mục; taskId là công việc; assignmentId/offerId thuộc Cleaner cũ; order.id là đơn. Không dùng ID thay thế nhau.
- Các trường rateJson/checklistJson/roomJson và skills của profile Cleaner cũ là JSON string tại các response liên quan. Orders có `items` parse sẵn ngoài itemsJson. Kiểm tra shape cụ thể trước khi parse/render.
- BE quyết định giá, quyền, assignment, eligibility và chuyển trạng thái trong transaction. FE không tự tính giá chính thức hoặc cập nhật trạng thái chỉ từ socket.
- Lỗi thường `{error,fields?:[{path,message}]}`; rate limiter có thể trả text. 400 input, 401 phiên, 403 quyền, 404 resource, 409 conflict, 429 limit, 5xx server/provider. Giữ form và đối chiếu trạng thái khi timeout ghi.

## Các ràng buộc phải bảo toàn

- Booking/nhận phòng kiểm tra lại phòng khả dụng trong transaction; dùng lại hồ sơ qua số điện thoại chuẩn hóa; snapshot bảng giá ở checkin.
- Quote là nguồn tiền; checkout có thể `payRemaining:true` để BE tính và thu cùng transaction. Không đồng thời dùng payRemaining và paymentAmount>0; finalTotal không đồng thời discount/surcharge>0. Điều chỉnh cần lý do ít nhất 5 ký tự.
- Đơn PENDING/PREPARING chặn checkout; chỉ COMPLETED ghi phí đúng một lần; CANCELLED không ghi phí. Không tạo phí FOOD/SPECIAL qua serviceItem.
- Task dọn trực tiếp hoàn tất checklist/verify cùng transaction. Task/assignment của cycle cũ không được làm sạch cycle mới. Không tự tạo TURNOVER từ form khách.
- Quyền riêng kiểm tra từ DB; không lộ tên/ID đơn SPECIAL qua quote/notification cho người không được phép. Admin xem báo cáo tài chính/CSV; Lễ tân xem dashboard vận hành.
- Socket.IO event `changed` yêu cầu GET lại. Polling/foreground/reconnect vẫn cần hoạt động khi không có push. DB là nguồn trạng thái.
- AI key ở BE. AI chỉ draft/read; cần người xác nhận trước ghi nghiệp vụ. Form thường hoạt động khi provider không khả dụng. Không gọi provider thật chỉ để hoàn thành kiểm tra tĩnh.

## Tồn đọng và giới hạn snapshot

- `task-review` trong housekeeping.js hiện lấy last.cleanerId từ assignment SUBMITTED mà không bảo vệ trường hợp không có assignment. Guest UI hiện nút cho mọi COMPLETED: dọn trực tiếp có nguy cơ 500. Đây là kết luận đọc source, chưa tái hiện runtime; xử lý nếu ticket liên quan, không tự sửa trong mọi task.
- FE hiện refresh khi restore SecureStore; request nhận 401 thì đăng xuất, chưa có automatic refresh/replay. useAction giữ key trong hook, chưa lưu bền qua unmount/restart. Không mô tả tính năng chưa có như đã hoàn thành.
- Mongo cần replica set. Migration Mongo 001/002 và snapshots là nền hiện tại; SQL migrations là lịch sử. Không sửa checksum migration đã áp dụng; thêm migration mới nếu ticket cần đổi schema sau khi kiểm tra baseline hiện tại.
- [handoff-verification.md](../handoff-verification.md) ghi kết quả lượt tổng hợp, không phải chứng nhận production. Android thật, remote push, tải cao và server/APK cùng version cần kiểm tra riêng.

## Definition of done chung

- Thay đổi đúng ticket, đúng quyền/enum/DTO và không làm mất tương thích mà không được nêu rõ trong nhiệm vụ.
- Cập nhật API reference/Postman nếu contract thay đổi; ghi action/body/output/error, migration và FE/BE bị ảnh hưởng.
- Lint/typecheck phải chạy theo AGENTS.md; test thêm đúng phạm vi. Báo chính xác lệnh, kết quả và phần chưa chạy; không suy ra runtime thành công từ kiểm tra tĩnh.
- Bàn giao một luồng thành công, lỗi liên quan và những điểm đầu bên kia phải xử lý. Không tự gửi tin cho người khác; người dùng chuyển ghi chú hoặc dùng cơ chế phối hợp đã được họ yêu cầu.
