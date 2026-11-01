# StayFlow — API hiện hành để ghép BE và mobile

Đối chiếu source local ngày **01/11/2026**; **93 tổ hợp method/path**: 36 resource GET, 49 action POST, 3 auth/exchange POST, 3 AI POST, CSV và health. Socket.IO được mô tả riêng bên dưới, không tính là REST endpoint.

Nguồn: `backend/src/app.js`, `auth.js`, `reads.js`, `mongo-views.js`, `services/{hotel,housekeeping,orders,crm,reporting,forecast,ai,ai-tools}.js`, `mongo-schema.js`. Các route dynamic đã được khai triển thành tên resource/action cụ thể. Không xác nhận server từ xa đã chạy cùng bản source.

Đọc [bàn giao và phân công 2 người](team-handoff.md) trước. Import [Postman collection](stayflow-team.postman_collection.json) để thử từng request trên DB test.

## Quy ước contract

- Origin `baseUrl` không có `/api` ở cuối. Tất cả request được bảo vệ dùng `Authorization: Bearer <token>`; /health và 3 auth/exchange không cần Bearer. AI cũng cần Bearer.
- Mọi POST /api/actions/* cần `Idempotency-Key` 8–100 ký tự và JSON body. Thành công trả HTTP **200**, kể cả create; response thường chỉ `{id}` hoặc `{ok:true}`, không có envelope data.
- Cùng actor/key/action/body trả kết quả cũ; key cũ/action hoặc body khác →409. Key scope theo actor; giữ key khi retry cùng ý định, đổi key khi ý định hoặc payload đổi.
- `UUID` là string UUID hợp lệ; `VND` là JSON number nguyên 0..1.000.000.000 trừ nơi ghi >0; không gửi chuỗi số có dấu chấm/phẩy. `ISO` là string ISO-8601 có offset/Z.
- Dấu `?` là optional; không có dấu ? là bắt buộc trừ điều kiện được ghi rõ. Nullable chỉ dùng ở trường cho phép; bỏ param optional thay vì gửi chuỗi rỗng.
- Response dưới đây là **shape/tập trường cần dùng**, không phải JSON Schema đầy đủ hay response vừa đo trên server. Dữ liệu mẫu Postman là template: thay mọi ID, token và mốc giờ bằng giá trị từ môi trường test. Các record còn có metadata được định nghĩa ở mongo-schema.js.
- GET danh sách trả mảng trực tiếp. page từ 1..10000, 30 dòng với resource có phân trang; không có total/hasNext. search<=120 và chỉ có tác dụng tại view được ghi.
- Trường `rateJson`, `checklistJson`, `roomJson`, `skills` (profile Cleaner cũ lưu string) có thể là JSON string; đừng giả định là object/array. Orders đã có `items` parse sẵn ngoài `itemsJson`.
- Lỗi domain/validation: `{error:string,fields?:[{path,message}]}`. 400 input, 401 phiên, 403 quyền, 404 không có, 409 conflict, 429 rate limit, 500 lỗi server; 503 do AI hoặc health DB. Lỗi DB bất ngờ trên API nghiệp vụ có thể thành 500, không cam kết mọi DB outage trả 503. Rate limiter chung/AI có thể trả text.
- Rate limit đang cấu hình: /api 240 request/phút; auth/exchange 30/15 phút; ai/draft 10/phút; quota AI 30/ngày/actor trong service. Thời gian quota tính UTC theo code.

## Tra cứu theo nhóm

- [00. Kết nối và phiên](#00)
- [01. Khách và phòng](#01)
- [02. Booking và nhận phòng](#02)
- [03. Lưu trú và tài chính](#03)
- [04. Dọn phòng và khách](#04)
- [05. Ăn uống và hỗ trợ riêng](#05)
- [06. Quản trị và sự cố](#06)
- [07. CRM, báo cáo và AI](#07)
- [08. Thông báo](#08)
- [09. Cleaner — tương thích](#09)

<a id="00"></a>

## 00. Kết nối và phiên

### GET `/health`

- **Quyền:** Public.
- **Input:** Không có.
- **Output 200:** {status:"ok"}; 503: {status:"database-unavailable"}.
- **FE sử dụng:** Kiểm tra kết nối.
- **Quy tắc:** Ngoài /api; health máy tính không chứng minh điện thoại truy cập được.

### POST `/api/auth/login`

- **Quyền:** Public.
- **Input:** username:string <=80; password:string <=100.
- **Output 200:** {user:{id,name,role,canAccessSpecialServices},token,refreshToken}.
- **FE sử dụng:** [frontend/src/features/auth/Login.jsx](../frontend/src/features/auth/Login.jsx).
- **Quy tắc:** JWT staff 8 giờ; refresh token 7 ngày.

```json
{
  "username": "{{username}}",
  "password": "{{password}}"
}
```

### POST `/api/auth/refresh`

- **Quyền:** Public.
- **Input:** refreshToken:string 30..100.
- **Output 200:** Cùng shape login; refresh token cũ bị revoke.
- **FE sử dụng:** [frontend/src/core/session.jsx](../frontend/src/core/session.jsx).
- **Quy tắc:** Được FE gọi lúc restore session; không có interceptor tự refresh/replay hiện tại.

```json
{
  "refreshToken": "{{refreshToken}}"
}
```

### POST `/api/guest-access/exchange`

- **Quyền:** Public.
- **Input:** token:string 30..100, token ngẫu nhiên từ fragment link.
- **Output 200:** {token:guestJWT,stayId,room:số phòng}.
- **FE sử dụng:** [frontend/src/app/guest.jsx](../frontend/src/app/guest.jsx).
- **Quy tắc:** Guest JWT 2 giờ; không dùng link token làm Bearer.

```json
{
  "token": "{{guestLinkToken}}"
}
```

### GET `/api/me`

- **Quyền:** Staff / Guest (phạm vi theo token).
- **Input:** Không có.
- **Output 200:** Staff: {id,name,role,canAccessSpecialServices}; Guest: {kind:"guest",stayId}.
- **FE sử dụng:** [frontend/src/core/session.jsx](../frontend/src/core/session.jsx).
- **Quy tắc:** GET me trả cờ quyền được lưu; với Admin FE cần kiểm tra role Admin hoặc cờ, không chỉ cờ.

### POST `/api/actions/password`

- **Quyền:** Staff.
- **Input:** current:string <=100; password:string 10..100.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/auth/Profile.jsx](../frontend/src/features/auth/Profile.jsx).
- **Quy tắc:** Đổi mật khẩu thu hồi phiên; đăng nhập lại sau thành công.

```json
{
  "current": "{{password}}",
  "password": "{{newPassword}}"
}
```

### POST `/api/actions/logout`

- **Quyền:** Staff.
- **Input:** {}
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/auth/Profile.jsx](../frontend/src/features/auth/Profile.jsx).
- **Quy tắc:** FE xóa token và cache sau logout.

```json
{}
```

<a id="01"></a>

## 01. Khách và phòng

### GET `/api/rooms`

- **Quyền:** Admin / Receptionist.
- **Input:** page?, search?:số phòng, typeId?:UUID, status?:READY|OCCUPIED|DIRTY|MAINTENANCE|DISABLED|ALL.
- **Output 200:** Room[]; có id,number,typeId,zone,enabled,cleanState,cycle,typeName,capacity,rateJson,stayId,expectedEnd,status.
- **FE sử dụng:** [frontend/src/features/rooms/Rooms.jsx](../frontend/src/features/rooms/Rooms.jsx).
- **Quy tắc:** 30 dòng. status là trạng thái vận hành suy ra; cleanState khác status.

### GET `/api/roomTypes`

- **Quyền:** Admin / Receptionist.
- **Input:** Không có.
- **Output 200:** RoomType[] gồm id,name,capacity,rateJson.
- **FE sử dụng:** [frontend/src/features/rooms/Rooms.jsx](../frontend/src/features/rooms/Rooms.jsx); [frontend/src/features/admin/Admin.jsx](../frontend/src/features/admin/Admin.jsx).
- **Quy tắc:** Không phân trang. rateJson là JSON string.

### GET `/api/availability`

- **Quyền:** Admin / Receptionist.
- **Input:** start:ISO bắt buộc; end?:ISO; mode?:HOUR|NIGHT (mặc định HOUR); excludeBooking?:UUID.
- **Output 200:** Room[] khả dụng cho khoảng yêu cầu.
- **FE sử dụng:** [frontend/src/features/bookings/Bookings.jsx](../frontend/src/features/bookings/Bookings.jsx).
- **Quy tắc:** Thiếu end: BE suy ra theo mode. POST booking/checkin kiểm tra lại trong transaction.

### GET `/api/customers`

- **Quyền:** Admin / Receptionist.
- **Input:** page?, search?:tên hoặc điện thoại.
- **Output 200:** Customer[] gồm id,name,phone,notes,tier,...
- **FE sử dụng:** [frontend/src/features/customers/Customers.jsx](../frontend/src/features/customers/Customers.jsx).
- **Quy tắc:** 30 dòng.

### GET `/api/customer-lookup`

- **Quyền:** Admin / Receptionist.
- **Input:** phone:string <=30 bắt buộc.
- **Output 200:** Customer hoặc null.
- **FE sử dụng:** [frontend/src/features/customers/CustomerPicker.jsx](../frontend/src/features/customers/CustomerPicker.jsx).
- **Quy tắc:** Chuẩn hóa +84/0084 về 0; không tìm thấy không phải 404.

### GET `/api/customer-history`

- **Quyền:** Admin / Receptionist.
- **Input:** customerId:UUID.
- **Output 200:** Stay[] có roomNumber,customerName,invoiceId,total.
- **FE sử dụng:** [frontend/src/features/customers/Customers.jsx](../frontend/src/features/customers/Customers.jsx).
- **Quy tắc:** Không phân trang; invoiceId/total có thể null.

### GET `/api/room-history`

- **Quyền:** Admin / Receptionist.
- **Input:** roomId:UUID.
- **Output 200:** Stay[] có roomNumber,customerName.
- **FE sử dụng:** [frontend/src/features/rooms/Rooms.jsx](../frontend/src/features/rooms/Rooms.jsx).
- **Quy tắc:** Không phân trang.

### GET `/api/room-cleaning-history`

- **Quyền:** Admin / Receptionist.
- **Input:** roomId:UUID; page?.
- **Output 200:** Task[] có code,serviceName,roomNumber,checklistJson,...
- **FE sử dụng:** [frontend/src/features/rooms/Rooms.jsx](../frontend/src/features/rooms/Rooms.jsx).
- **Quy tắc:** 30 dòng. Không nhầm taskId với stayId.

### POST `/api/actions/customer`

- **Quyền:** Admin / Receptionist.
- **Input:** id?:UUID; name:trim 1..120; phone:string <=30; notes?:string <=500.
- **Output 200:** {id:customerId}.
- **FE sử dụng:** [frontend/src/features/customers/Customers.jsx](../frontend/src/features/customers/Customers.jsx).
- **Quy tắc:** Tạo trùng số đã chuẩn hóa bị từ chối; booking/checkin có cơ chế dùng lại khách inline.

```json
{
  "name": "Khách thử API",
  "phone": "{{customerPhone}}",
  "notes": "Dữ liệu test"
}
```

<a id="02"></a>

## 02. Booking và nhận phòng

### GET `/api/bookings`

- **Quyền:** Admin / Receptionist.
- **Input:** page?.
- **Output 200:** Booking[] có roomNumber,customerName,deposit:số cọc ròng.
- **FE sử dụng:** [frontend/src/features/bookings/Bookings.jsx](../frontend/src/features/bookings/Bookings.jsx).
- **Quy tắc:** 30 dòng; không có filter status/search ở view hiện tại.

### GET `/api/booking-receipts`

- **Quyền:** Admin / Receptionist.
- **Input:** bookingId:UUID.
- **Output 200:** Receipt[] có returned:số đã hoàn trước chốt.
- **FE sử dụng:** [frontend/src/features/bookings/Bookings.jsx](../frontend/src/features/bookings/Bookings.jsx).
- **Quy tắc:** Không phân trang. Sau checkin cọc gắn sang stay; đọc receipts theo stay.

### GET `/api/campaign-options`

- **Quyền:** Admin / Receptionist.
- **Input:** Không có.
- **Output 200:** {id,name}[] chiến dịch đang hiệu lực.
- **FE sử dụng:** [frontend/src/features/bookings/Bookings.jsx](../frontend/src/features/bookings/Bookings.jsx).
- **Quy tắc:** Không trả toàn bộ ngân sách/nội dung chiến dịch cho Lễ tân.

### POST `/api/actions/booking`

- **Quyền:** Admin / Receptionist.
- **Input:** roomId:UUID; customerId?:UUID hoặc customer:{name,phone,notes?}; guests:int 1..20; mode:HOUR|NIGHT; id?,startsAt?,endsAt?,deposit?,method?,source?,campaignId?.
- **Output 200:** {id:bookingId}.
- **FE sử dụng:** [frontend/src/features/bookings/Bookings.jsx](../frontend/src/features/bookings/Bookings.jsx).
- **Quy tắc:** startsAt mặc định hiện tại; endsAt suy ra. method=CASH, deposit=0, source=Trực tiếp, campaignId=null mặc định. Sửa booking: deposit phải 0; thu thêm qua receipt.

```json
{
  "roomId": "{{roomId}}",
  "customer": {
    "name": "Khách thử API",
    "phone": "{{customerPhone}}"
  },
  "startsAt": "{{startAt}}",
  "mode": "HOUR",
  "guests": 2,
  "deposit": 0,
  "method": "CASH"
}
```

### POST `/api/actions/booking-cancel`

- **Quyền:** Admin / Receptionist.
- **Input:** id:bookingId UUID.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/bookings/Bookings.jsx](../frontend/src/features/bookings/Bookings.jsx).
- **Quy tắc:** Chỉ CONFIRMED, còn cọc chưa hoàn thì 409.

```json
{
  "id": "{{bookingId}}"
}
```

### POST `/api/actions/checkin`

- **Quyền:** Admin / Receptionist.
- **Input:** bookingId?:UUID; hoặc roomId, customerId/customer, guests, mode; expectedEnd?:ISO.
- **Output 200:** {id:stayId}.
- **FE sử dụng:** [frontend/src/features/bookings/Bookings.jsx](../frontend/src/features/bookings/Bookings.jsx); [frontend/src/features/rooms/Rooms.jsx](../frontend/src/features/rooms/Rooms.jsx).
- **Quy tắc:** Có booking lấy thông tin từ DB; nhận trực tiếp cần đủ phòng/khách/số người/mode. Phòng sạch, không có stay mở, không xung đột; từ booking không sớm hơn quá 1 giờ.

```json
{
  "bookingId": "{{bookingId}}"
}
```

<a id="03"></a>

## 03. Lưu trú và tài chính

### GET `/api/stays`

- **Quyền:** Admin / Receptionist.
- **Input:** page?; status?:OPEN|CLOSED|ALL.
- **Output 200:** Stay[] có id,roomId,customerId,roomNumber,customerName,mode,startedAt,expectedEnd,endedAt,status,dnd,rateJson,cycle,...
- **FE sử dụng:** [frontend/src/features/stays/Stays.jsx](../frontend/src/features/stays/Stays.jsx); [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** 30 dòng. Giá chính thức trong quote, không tính lại từ rateJson ở FE.

### GET `/api/quote`

- **Quyền:** Admin / Receptionist.
- **Input:** stayId:UUID.
- **Output 200:** {stay,invoice,room,items,services,total,paid,refunded,adjustments,balance,credit,orders,pendingOrderCount}.
- **FE sử dụng:** [frontend/src/features/stays/Stays.jsx](../frontend/src/features/stays/Stays.jsx); [frontend/src/features/stays/Invoices.jsx](../frontend/src/features/stays/Invoices.jsx).
- **Quy tắc:** invoice=null trước chốt; room là breakdown. SPECIAL bị ẩn tên/orderId cho người không có quyền. balance=total-paid+refunded; credit=max(0,paid-refunded-total).
- `orders` chứa toàn bộ đơn của stay ở mọi trạng thái, không phân trang, gồm items đã parse, mealAssistantId/name khi có đặt người bón. Đơn SPECIAL của người thiếu quyền chỉ trả `{kind,status,total,restricted:true}`; không trả ID, tên, ghi chú hay người bón. `pendingOrderCount` đếm PENDING/PREPARING, kể cả đơn hạn chế quyền. Giao diện Phòng → Dịch vụ & trả phòng dùng chính quote này; xử lý từng đơn rồi tải lại quote trước khi checkout.

### GET `/api/receipts`

- **Quyền:** Admin / Receptionist.
- **Input:** stayId:UUID.
- **Output 200:** Receipt[] có id,amount,method,returned,createdAt,...
- **FE sử dụng:** [frontend/src/features/stays/Stays.jsx](../frontend/src/features/stays/Stays.jsx); [frontend/src/features/stays/Invoices.jsx](../frontend/src/features/stays/Invoices.jsx).
- **Quy tắc:** Không phân trang; returned là tổng ReceiptReturns cho phiếu.

### GET `/api/invoices`

- **Quyền:** Admin / Receptionist.
- **Input:** page?; customerId?:UUID; paymentStatus?:UNPAID|PARTIAL|PAID|ALL.
- **Output 200:** Invoice[] có roomNumber,customerName,total,originalTotal,adjustmentAmount,adjustmentReason,adjustedByName,adjustedAt,paid,refunded,adjusted,balance,paymentStatus,startedAt,endedAt,mode,...
- **FE sử dụng:** [frontend/src/features/stays/Invoices.jsx](../frontend/src/features/stays/Invoices.jsx); [frontend/src/features/customers/Customers.jsx](../frontend/src/features/customers/Customers.jsx).
- **Quy tắc:** 30 dòng sau filter. invoice total trước Adjustments; quote.total đã trừ adjustments.

### GET `/api/services`

- **Quyền:** Staff / Guest (phạm vi theo token).
- **Input:** includeDisabled?:true (Admin).
- **Output 200:** Service[] đang bật, loại trừ category FOOD và SPECIAL.
- **FE sử dụng:** [frontend/src/features/stays/Stays.jsx](../frontend/src/features/stays/Stays.jsx); [frontend/src/features/housekeeping/TaskForm.jsx](../frontend/src/features/housekeeping/TaskForm.jsx); [frontend/src/app/guest.jsx](../frontend/src/app/guest.jsx).
- **Quy tắc:** Không phân trang. Có cả dịch vụ cleaning; serviceItem không dùng thay task/order cho các loại có workflow.

### POST `/api/actions/serviceItem`

- **Quyền:** Admin / Receptionist.
- **Input:** stayId:UUID; serviceId:UUID; quantity:int 1..1000; itemId?:UUID để sửa dòng cũ.
- **Output 200:** {id:itemId}.
- **FE sử dụng:** [frontend/src/features/stays/Stays.jsx](../frontend/src/features/stays/Stays.jsx).
- **Quy tắc:** Chỉ stay OPEN, dịch vụ thường; phí cleaning/FOOD/SPECIAL đi theo workflow riêng. Snapshot tên/giá BE.

```json
{
  "stayId": "{{stayId}}",
  "serviceId": "{{serviceId}}",
  "quantity": 1
}
```

### POST `/api/actions/receipt`

- **Quyền:** Admin / Receptionist.
- **Input:** Một trong stayId hoặc bookingId:UUID; amount:int VND >0; method:CASH|TRANSFER.
- **Output 200:** {id:receiptId}.
- **FE sử dụng:** [frontend/src/features/bookings/Bookings.jsx](../frontend/src/features/bookings/Bookings.jsx); [frontend/src/features/stays/Stays.jsx](../frontend/src/features/stays/Stays.jsx); [frontend/src/features/stays/Invoices.jsx](../frontend/src/features/stays/Invoices.jsx).
- **Quy tắc:** Không thu quá số còn phải trả theo BE. Hóa đơn còn nợ vẫn có thể thu sau checkout.

```json
{
  "stayId": "{{stayId}}",
  "amount": 100000,
  "method": "CASH"
}
```

### POST `/api/actions/checkout`

- **Quyền:** Admin / Receptionist.
- **Input:** stayId:UUID; finalTotal?:VND; adjustmentReason?:<=500; discount?:VND; surcharge?:VND; allowDebt?:boolean; reason?:<=500; voucherCode?:<=40; paymentAmount?:VND; paymentMethod?:CASH|TRANSFER; payRemaining?:boolean.
- **Output 200:** {id:invoiceId,total}.
- **FE sử dụng:** [frontend/src/features/stays/Stays.jsx](../frontend/src/features/stays/Stays.jsx).
- **Quy tắc:** Mặc định các khoản nhập =0, allowDebt/payRemaining=false, paymentMethod=CASH. payRemaining và paymentAmount>0 loại trừ nhau; finalTotal và discount/surcharge>0 loại trừ nhau. Điều chỉnh cần lý do >=5, Lễ tân được phép; công nợ cần Admin + reason>=5. Chặn order chờ/task đang làm. Thu dư phải hoàn trước chốt.

```json
{
  "stayId": "{{stayId}}",
  "payRemaining": true,
  "paymentMethod": "CASH"
}
```

### POST `/api/actions/receipt-return`

- **Quyền:** Admin.
- **Input:** receiptId:UUID; amount:VND >0; reason:string 5..500.
- **Output 200:** {id:returnId}.
- **FE sử dụng:** [frontend/src/features/bookings/Bookings.jsx](../frontend/src/features/bookings/Bookings.jsx); [frontend/src/features/stays/Stays.jsx](../frontend/src/features/stays/Stays.jsx).
- **Quy tắc:** Hoàn phiếu thu trước khi có invoice; không vượt phần còn lại chưa hoàn.

```json
{
  "receiptId": "{{receiptId}}",
  "amount": 50000,
  "reason": "Hoàn phần tiền cọc dư"
}
```

### POST `/api/actions/refund`

- **Quyền:** Admin.
- **Input:** invoiceId:UUID; amount:VND >0; reason:string 5..500.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/stays/Invoices.jsx](../frontend/src/features/stays/Invoices.jsx).
- **Quy tắc:** Sau chốt: hoàn tiền và tạo điều chỉnh giảm nghĩa vụ cùng transaction; không chỉ giảm thực thu riêng lẻ.

```json
{
  "invoiceId": "{{invoiceId}}",
  "amount": 50000,
  "reason": "Hoàn tiền theo xác nhận"
}
```

<a id="04"></a>

## 04. Dọn phòng và khách

### GET `/api/tasks`

- **Quyền:** Staff; Guest đúng stay; Cleaner chỉ assignment của mình.
- **Input:** page?; search?:số phòng (desk).
- **Output 200:** Task[]; staff/guest có serviceName,code,fullClean,roomNumber,checklistJson; Cleaner có thêm assignmentId,assignmentStatus,isActive và mốc thời gian.
- **FE sử dụng:** [frontend/src/features/housekeeping/Housekeeping.jsx](../frontend/src/features/housekeeping/Housekeeping.jsx); [frontend/src/features/cleaner/Cleaner.jsx](../frontend/src/features/cleaner/Cleaner.jsx); [frontend/src/app/guest.jsx](../frontend/src/app/guest.jsx).
- **Quy tắc:** 30 dòng. Guest không truyền stayId để mở rộng phạm vi; BE lấy từ token.

### GET `/api/guest-stay`

- **Quyền:** Guest.
- **Input:** Không có.
- **Output 200:** {id,dnd,status,number}.
- **FE sử dụng:** [frontend/src/app/guest.jsx](../frontend/src/app/guest.jsx).
- **Quy tắc:** id là stayId; chỉ own stay đang được link cho phép.

### POST `/api/actions/guest-link`

- **Quyền:** Admin / Receptionist.
- **Input:** stayId:UUID.
- **Output 200:** {url:guestUrl + "#token=..."}.
- **FE sử dụng:** [frontend/src/features/stays/Stays.jsx](../frontend/src/features/stays/Stays.jsx).
- **Quy tắc:** Cấp link mới revoke link trước. checkout vô hiệu truy cập guest.

```json
{
  "stayId": "{{stayId}}"
}
```

### POST `/api/actions/dnd`

- **Quyền:** Guest, đúng stay; Admin / Receptionist.
- **Input:** stayId:UUID; dnd:boolean.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/app/guest.jsx](../frontend/src/app/guest.jsx).
- **Quy tắc:** Guest chỉ own stay; dùng JWT staff cũng được theo guestStay policy.

```json
{
  "stayId": "{{stayId}}",
  "dnd": true
}
```

### POST `/api/actions/task-create`

- **Quyền:** Guest, đúng stay; Admin / Receptionist.
- **Input:** stayId:UUID; serviceCode:FULL|LINEN|BATHROOM|TOWELS; windowStart,windowEnd:ISO; entryConsent:boolean; feeApproved:boolean; notes?:<=1000.
- **Output 200:** {id:taskId,status:"PENDING"}.
- **FE sử dụng:** [frontend/src/features/housekeeping/TaskForm.jsx](../frontend/src/features/housekeeping/TaskForm.jsx); [frontend/src/app/guest.jsx](../frontend/src/app/guest.jsx).
- **Quy tắc:** Không nhận TURNOVER từ request thường; consent phải true, có phí phải feeApproved=true; DND/trùng loại chồng giờ bị chặn; khung tối đa 7 ngày.

```json
{
  "stayId": "{{stayId}}",
  "serviceCode": "TOWELS",
  "windowStart": "{{startAt}}",
  "windowEnd": "{{endAt}}",
  "entryConsent": true,
  "feeApproved": true,
  "notes": "Bổ sung khăn"
}
```

### POST `/api/actions/task-desk-start`

- **Quyền:** Admin / Receptionist.
- **Input:** taskId:UUID; reason?:string <=500.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/housekeeping/Housekeeping.jsx](../frontend/src/features/housekeeping/Housekeeping.jsx).
- **Quy tắc:** PENDING/ASSIGNED/IN_PROGRESS; đúng cycle, stay/DND/khung giờ. Tiếp nhận assignment đang hoạt động cần reason>=5; không cần ca Cleaner.

```json
{
  "taskId": "{{taskId}}",
  "reason": "Lễ tân trực tiếp thực hiện"
}
```

### POST `/api/actions/task-desk-complete`

- **Quyền:** Admin / Receptionist.
- **Input:** taskId:UUID; checklist:string[] <=20, đủ chính xác các mục JSON.parse(task.checklistJson).
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/housekeeping/Housekeeping.jsx](../frontend/src/features/housekeeping/Housekeeping.jsx).
- **Quy tắc:** Phải đã desk-start và IN_PROGRESS; BE chuyển AWAITING_VERIFICATION rồi task-verify passed=true cùng transaction, kết thúc COMPLETED.

```json
{
  "taskId": "{{taskId}}",
  "checklist": [
    "Bổ sung khăn",
    "Thu gom khăn bẩn"
  ]
}
```

### POST `/api/actions/task-verify`

- **Quyền:** Admin / Receptionist.
- **Input:** taskId:UUID; passed:boolean; reason?:<=500, bắt buộc >=5 nếu false.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/housekeeping/Housekeeping.jsx](../frontend/src/features/housekeeping/Housekeeping.jsx).
- **Quy tắc:** Chỉ AWAITING_VERIFICATION. Passed ghi phí đúng một lần/markRoomClean đúng cycle; false về PENDING, version++.

```json
{
  "taskId": "{{taskId}}",
  "passed": true
}
```

### POST `/api/actions/task-cancel`

- **Quyền:** Guest, đúng stay; Admin / Receptionist.
- **Input:** taskId:UUID.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/housekeeping/Housekeeping.jsx](../frontend/src/features/housekeeping/Housekeeping.jsx); [frontend/src/app/guest.jsx](../frontend/src/app/guest.jsx).
- **Quy tắc:** Chỉ PENDING/ASSIGNED trước khi bắt đầu; thu hồi offers và assignment liên quan.

```json
{
  "taskId": "{{taskId}}"
}
```

### POST `/api/actions/task-reschedule`

- **Quyền:** Admin / Receptionist.
- **Input:** taskId:UUID; windowStart,windowEnd:ISO; serviceCode?:FULL|TURNOVER|LINEN|BATHROOM|TOWELS.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/housekeeping/Housekeeping.jsx](../frontend/src/features/housekeeping/Housekeeping.jsx).
- **Quy tắc:** Chỉ PENDING; lịch tương lai <=7 ngày; không đổi giữa TURNOVER và yêu cầu trong stay; đổi loại có giá khác cần hủy/xác nhận lại.

```json
{
  "taskId": "{{taskId}}",
  "windowStart": "{{startAt}}",
  "windowEnd": "{{endAt}}"
}
```

### POST `/api/actions/task-review`

- **Quyền:** Guest đúng stay.
- **Input:** taskId:UUID; rating:int 1..5; comment?:<=500.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/app/guest.jsx](../frontend/src/app/guest.jsx).
- **Quy tắc:** Chỉ COMPLETED, một review/task. Source lấy last.cleanerId từ assignment SUBMITTED nhưng chưa kiểm tra last tồn tại: task dọn trực tiếp không có assignment có nguy cơ 500. Cần BE chốt xử lý đánh giá dọn trực tiếp và FE cập nhật điều kiện hiện nút; chưa tái hiện runtime trong lượt này.

```json
{
  "taskId": "{{taskId}}",
  "rating": 5,
  "comment": "Phòng sạch"
}
```

<a id="05"></a>

## 05. Ăn uống và hỗ trợ riêng

### GET `/api/meal-assistants`

- **Quyền:** Admin hoặc Receptionist có `canAccessSpecialServices`, kiểm tra từ DB.
- **Input:** `page?` từ 1 (30 dòng), `status?:AVAILABLE|SERVING`. Bỏ status để lấy tất cả; không trả hồ sơ đã xóa.
- **Output 200:** mảng `{id,name,birthYear,height,bust,waist,hips,weight,photo,status,deleted,updatedAt}`. `photo` là data URI JPEG/PNG hoặc null. Chiều cao/số đo tính cm, cân nặng kg, số nguyên.

### POST `/api/actions/meal-assistant`

- **Quyền:** Admin; Bearer và Idempotency-Key như các action khác.
- **Input:** `id?:UUID`, `name` 2..120 ký tự; `birthYear` 1900..năm hiện tại; `height` 50..250; `bust,waist,hips` 20..250; `weight` 10..300; `status?:AVAILABLE|SERVING` mặc định AVAILABLE; `photo?:string|null`.
- **Ảnh:** data URI JPEG/PNG base64, tối đa 500.000 byte sau giải mã; null để gỡ, bỏ field giữ ảnh cũ. Chỉ action này có JSON limit 1 MB, các action khác giữ 32 KB. FE chọn ảnh từ thiết bị, thu nhỏ cạnh dài tối đa 640 px và nén JPEG trước khi gửi.
- **Output 200:** `{id}`. 400 dữ liệu/ảnh sai; 403 thiếu quyền; 404 không tìm thấy; 409 nếu cố đặt AVAILABLE khi còn đơn PENDING/PREPARING; 413 body quá lớn.

### POST `/api/actions/meal-assistant-delete`

- **Quyền:** Admin; body `{id:UUID}`; output 200 `{id}`.
- **Quy tắc:** xóa mềm, giữ snapshot tên và liên kết trong lịch sử đơn. 409 nếu đang SERVING hoặc có đơn đang mở; 404 hồ sơ không tồn tại/đã xóa.

Đặt người bón: `POST /api/actions/special-request` nhận thêm `mealAssistantId?:UUID`, chỉ với `purpose=MEAL_ASSISTANCE`. Khi có ID, chỉ nhận hồ sơ AVAILABLE, chưa xóa; giữ người và đổi SERVING ngay lúc tạo đơn PENDING trong cùng transaction. Hoàn thành/hủy đơn đổi lại AVAILABLE cùng transaction. Tranh đặt cùng người chỉ một request thành công; request còn lại 409. `mealAssistantName` là snapshot không bị thay đổi khi sửa/xóa hồ sơ. FOOD/PRIVATE_SUPPORT gửi ID này trả 400. Không truyền ID vẫn tạo yêu cầu dịch vụ như trước.

Migration mới: `003_mongo.js` + snapshot bất biến, thêm MealAssistants và unique partial index cho mỗi người chỉ có một đơn PENDING/PREPARING. Chạy migrate trên DB hiện có; không seed/reset DB để nâng cấp.

### GET `/api/food-items`

- **Quyền:** Admin / Receptionist.
- **Input:** Không có.
- **Output 200:** Service[] FOOD; id,name,unit,price,enabled,...
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** Tối đa 200; Admin thấy cả mục disabled, Lễ tân chỉ enabled.

### GET `/api/food-orders`

- **Quyền:** Admin / Receptionist.
- **Input:** page?; stayId?:UUID; status?:PENDING|PREPARING|COMPLETED|CANCELLED.
- **Output 200:** Order[] có id,kind,stayId,status,items,itemsJson,total,notes,roomNumber và timestamps.
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** 30 dòng; items là array parse sẵn. Không gửi status=ALL, bỏ param khi muốn tất cả.

### GET `/api/special-services`

- **Quyền:** Admin / Receptionist có canAccessSpecialServices.
- **Input:** purpose?:MEAL_ASSISTANCE|PRIVATE_SUPPORT (mặc định MEAL_ASSISTANCE).
- **Output 200:** Service[] SPECIAL của đúng purpose.
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** Tối đa 200; luôn truyền purpose để tách hai danh mục.

### GET `/api/special-requests`

- **Quyền:** Admin / Receptionist có canAccessSpecialServices.
- **Input:** purpose?:MEAL_ASSISTANCE|PRIVATE_SUPPORT; page?; stayId?:UUID; status?:PENDING|PREPARING|COMPLETED|CANCELLED.
- **Output 200:** Order[] SPECIAL của đúng purpose, có items,roomNumber.
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** 30 dòng; quyền từ DB; purpose mặc định MEAL_ASSISTANCE.

### POST `/api/actions/food-item`

- **Quyền:** Admin.
- **Input:** id?:UUID; code?:trim 2..50; name:trim 2..120; unit:trim 1..30; price:VND; enabled?:boolean mặc định true.
- **Output 200:** {id:serviceId}.
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** Tạo/sửa catalogue FOOD, code tự sinh nếu không nhập.

```json
{
  "name": "Nước suối",
  "unit": "Chai",
  "price": 10000,
  "enabled": true
}
```

### POST `/api/actions/special-service`

- **Quyền:** Admin.
- **Input:** purpose:MEAL_ASSISTANCE|PRIVATE_SUPPORT; các trường như food-item.
- **Output 200:** {id:serviceId}.
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** Không đổi mục catalogue sang purpose khác.

```json
{
  "purpose": "MEAL_ASSISTANCE",
  "name": "Hỗ trợ bữa ăn",
  "unit": "Lần",
  "price": 30000,
  "enabled": true
}
```

### POST `/api/actions/food-order`

- **Quyền:** Admin / Receptionist.
- **Input:** stayId:UUID; items:array 1..30 [{serviceId:UUID,quantity:int 1..1000,notes?:<=300}]; notes?:<=1000.
- **Output 200:** {id:orderId,status:"PENDING",total}.
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** Chỉ stay OPEN, catalogue enabled FOOD; không trùng serviceId trong items; BE snapshot giá/tên, tổng <=1 tỷ.

```json
{
  "stayId": "{{stayId}}",
  "items": [
    {
      "serviceId": "{{foodServiceId}}",
      "quantity": 2,
      "notes": ""
    }
  ],
  "notes": ""
}
```

### POST `/api/actions/special-request`

- **Quyền:** Admin / Receptionist có canAccessSpecialServices.
- **Input:** purpose:MEAL_ASSISTANCE|PRIVATE_SUPPORT; stayId,items,notes như food-order.
- **Output 200:** {id:orderId,status:"PENDING",total}.
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** Chỉ dùng catalogue SPECIAL đúng purpose; không gọi điện/gửi tin ra bên ngoài.

```json
{
  "purpose": "MEAL_ASSISTANCE",
  "stayId": "{{stayId}}",
  "items": [
    {
      "serviceId": "{{specialServiceId}}",
      "quantity": 1
    }
  ],
  "notes": ""
}
```

### POST `/api/actions/food-order-status`

- **Quyền:** Admin / Receptionist.
- **Input:** id:orderId UUID; status:PENDING|PREPARING|COMPLETED|CANCELLED.
- **Output 200:** {id,status,total}.
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** PENDING → PREPARING/CANCELLED; PREPARING → COMPLETED/CANCELLED. Cùng status trả hiện trạng; trạng thái cuối không chuyển tiếp. Chỉ COMPLETED ghi StayServiceItems, đúng một lần.

```json
{
  "id": "{{orderId}}",
  "status": "PREPARING"
}
```

### POST `/api/actions/special-request-status`

- **Quyền:** Admin / Receptionist có canAccessSpecialServices.
- **Input:** id:orderId UUID; status:PENDING|PREPARING|COMPLETED|CANCELLED.
- **Output 200:** {id,status,total}.
- **FE sử dụng:** [frontend/src/features/orders/Orders.jsx](../frontend/src/features/orders/Orders.jsx).
- **Quy tắc:** PENDING → PREPARING/CANCELLED; PREPARING → COMPLETED/CANCELLED. Cùng status trả hiện trạng; trạng thái cuối không chuyển tiếp. Chỉ COMPLETED ghi StayServiceItems, đúng một lần.

```json
{
  "id": "{{orderId}}",
  "status": "PREPARING"
}
```

<a id="06"></a>

## 06. Quản trị và sự cố

### GET `/api/users`

- **Quyền:** Admin.
- **Input:** Không có.
- **Output 200:** {id,username,name,role,enabled,canAccessSpecialServices}[]; không có passwordHash.
- **FE sử dụng:** [frontend/src/features/admin/Admin.jsx](../frontend/src/features/admin/Admin.jsx).
- **Quy tắc:** Không phân trang.

### GET `/api/audit`

- **Quyền:** Admin.
- **Input:** page?.
- **Output 200:** AuditLog[] mới nhất trước.
- **FE sử dụng:** [frontend/src/features/admin/Admin.jsx](../frontend/src/features/admin/Admin.jsx).
- **Quy tắc:** 30 dòng.

### GET `/api/maintenance`

- **Quyền:** Admin / Receptionist.
- **Input:** page?.
- **Output 200:** Maintenance[] có roomNumber.
- **FE sử dụng:** [frontend/src/features/rooms/Incidents.jsx](../frontend/src/features/rooms/Incidents.jsx); [frontend/src/features/admin/Admin.jsx](../frontend/src/features/admin/Admin.jsx).
- **Quy tắc:** 30 dòng.

### GET `/api/incidents`

- **Quyền:** Admin / Receptionist.
- **Input:** page?.
- **Output 200:** Incident[] có roomNumber.
- **FE sử dụng:** [frontend/src/features/rooms/Incidents.jsx](../frontend/src/features/rooms/Incidents.jsx).
- **Quy tắc:** 30 dòng.

### POST `/api/actions/user`

- **Quyền:** Admin.
- **Input:** id?:UUID; username:/[a-zA-Z0-9_.-]{3,80}/; name:1..120; role:Admin|Receptionist; enabled?:boolean=true; canAccessSpecialServices?:boolean; password?:10..100.
- **Output 200:** {id:userId}.
- **FE sử dụng:** [frontend/src/features/admin/Admin.jsx](../frontend/src/features/admin/Admin.jsx).
- **Quy tắc:** Tạo mới cần password. Cleaner chỉ được giữ ở tài khoản cũ theo rule tương thích; không tạo mới. Sửa user tăng authVersion và thu hồi refresh; không tự khóa/bỏ Admin của chính mình.

```json
{
  "username": "letan_test",
  "name": "Lễ tân test",
  "role": "Receptionist",
  "enabled": true,
  "canAccessSpecialServices": false,
  "password": "{{newPassword}}"
}
```

### POST `/api/actions/room`

- **Quyền:** Admin.
- **Input:** id?:UUID; number:1..120; typeId:UUID; zone:1..120; enabled?:boolean=true; photoUrl?:URL|null.
- **Output 200:** {id:roomId}.
- **FE sử dụng:** [frontend/src/features/admin/Admin.jsx](../frontend/src/features/admin/Admin.jsx).
- **Quy tắc:** Đổi cấu hình không thay việc checkin/checkout/mark clean bằng action domain.

```json
{
  "number": "T101",
  "typeId": "{{typeId}}",
  "zone": "Tầng test",
  "enabled": true,
  "photoUrl": null
}
```

### POST `/api/actions/roomType`

- **Quyền:** Admin.
- **Input:** id?:UUID; name:1..120; capacity:int 1..20; rate:{hour:VND,night:VND,day?:VND=0,extraHour:VND,graceMinutes:int 0..60}.
- **Output 200:** {id:typeId}.
- **FE sử dụng:** [frontend/src/features/admin/Admin.jsx](../frontend/src/features/admin/Admin.jsx).
- **Quy tắc:** Giá mới không sửa snapshot stay đã nhận phòng. day chỉ phục vụ dữ liệu cũ.

```json
{
  "name": "Loại phòng test",
  "capacity": 2,
  "rate": {
    "hour": 80000,
    "night": 250000,
    "extraHour": 50000,
    "graceMinutes": 15
  }
}
```

### POST `/api/actions/service`

- **Quyền:** Admin.
- **Input:** id?:UUID; code:/[A-Z_]{2,30}/; name,unit:1..120; price:VND; cleaning?,fullClean?:boolean=false; enabled?:boolean=true.
- **Output 200:** {id:serviceId}.
- **FE sử dụng:** [frontend/src/features/admin/Admin.jsx](../frontend/src/features/admin/Admin.jsx).
- **Quy tắc:** Chỉ quản lý dịch vụ thường; cleaning=true bị từ chối, danh mục dọn phòng hệ thống do migration quản lý. FOOD/SPECIAL dùng action catalogue riêng.

```json
{
  "code": "WATER_TEST",
  "name": "Dịch vụ thử",
  "unit": "Lần",
  "price": 10000,
  "cleaning": false,
  "fullClean": false,
  "enabled": true
}
```

### POST `/api/actions/maintenance`

- **Quyền:** Admin / Receptionist.
- **Input:** roomId:UUID; startsAt,endsAt:ISO; reason:string 3..500.
- **Output 200:** {id:maintenanceId}.
- **FE sử dụng:** [frontend/src/features/rooms/Incidents.jsx](../frontend/src/features/rooms/Incidents.jsx); [frontend/src/features/admin/Admin.jsx](../frontend/src/features/admin/Admin.jsx).
- **Quy tắc:** Kiểm tra lịch và xung đột trong transaction.

```json
{
  "roomId": "{{roomId}}",
  "startsAt": "{{startAt}}",
  "endsAt": "{{endAt}}",
  "reason": "Kiểm tra thiết bị phòng"
}
```

### POST `/api/actions/maintenance-resolve`

- **Quyền:** Admin / Receptionist.
- **Input:** id:maintenanceId UUID.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/rooms/Incidents.jsx](../frontend/src/features/rooms/Incidents.jsx).
- **Quy tắc:** Tải lại rooms/maintenance.

```json
{
  "id": "{{maintenanceId}}"
}
```

### POST `/api/actions/incident`

- **Quyền:** Admin / Receptionist / Cleaner cũ.
- **Input:** roomId:UUID; description:string 5..500.
- **Output 200:** {id:incidentId}.
- **FE sử dụng:** [frontend/src/features/rooms/Incidents.jsx](../frontend/src/features/rooms/Incidents.jsx); [frontend/src/features/cleaner/Cleaner.jsx](../frontend/src/features/cleaner/Cleaner.jsx).
- **Quy tắc:** Cleaner chỉ báo tại phòng đã được giao; tải lại incidents/notifications.

```json
{
  "roomId": "{{roomId}}",
  "description": "Thiết bị phòng cần kiểm tra"
}
```

### POST `/api/actions/incident-resolve`

- **Quyền:** Admin / Receptionist.
- **Input:** id:incidentId UUID; resolution:string 5..500.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/rooms/Incidents.jsx](../frontend/src/features/rooms/Incidents.jsx).
- **Quy tắc:** Ghi RESOLVED và thời điểm giải quyết.

```json
{
  "id": "{{incidentId}}",
  "resolution": "Đã kiểm tra và xử lý"
}
```

<a id="07"></a>

## 07. CRM, báo cáo và AI

### GET `/api/campaigns`

- **Quyền:** Admin.
- **Input:** Không có.
- **Output 200:** Campaign[] có thống kê từ view.
- **FE sử dụng:** [frontend/src/features/admin/Marketing.jsx](../frontend/src/features/admin/Marketing.jsx).
- **Quy tắc:** Không phân trang.

### GET `/api/vouchers`

- **Quyền:** Admin.
- **Input:** Không có.
- **Output 200:** Voucher[].
- **FE sử dụng:** [frontend/src/features/admin/Marketing.jsx](../frontend/src/features/admin/Marketing.jsx).
- **Quy tắc:** Không phân trang.

### POST `/api/actions/campaign`

- **Quyền:** Admin.
- **Input:** id?:UUID; name:3..120; channel:2..80; startsAt,endsAt:ISO; budget:VND; draft?:<=2000.
- **Output 200:** {id:campaignId}.
- **FE sử dụng:** [frontend/src/features/admin/Marketing.jsx](../frontend/src/features/admin/Marketing.jsx).
- **Quy tắc:** Chỉ lưu chiến dịch/nội dung, không tự gửi ra ngoài.

```json
{
  "name": "Chiến dịch test",
  "channel": "Trực tiếp",
  "startsAt": "{{startAt}}",
  "endsAt": "{{endAt}}",
  "budget": 0,
  "draft": ""
}
```

### POST `/api/actions/voucher`

- **Quyền:** Admin.
- **Input:** id?:UUID; code:/[A-Z0-9_-]{3,40}/; discount:VND>0; minTotal:VND; startsAt,endsAt:ISO; maxUses:int 1..100000; perCustomer:int 1..100; enabled?:boolean=true.
- **Output 200:** {id:voucherId}.
- **FE sử dụng:** [frontend/src/features/admin/Marketing.jsx](../frontend/src/features/admin/Marketing.jsx).
- **Quy tắc:** Kiểm tra điều kiện/giới hạn lúc checkout; không tính giảm giá chính thức ở FE.

```json
{
  "code": "TEST2026",
  "discount": 10000,
  "minTotal": 50000,
  "startsAt": "{{startAt}}",
  "endsAt": "{{endAt}}",
  "maxUses": 10,
  "perCustomer": 1,
  "enabled": true
}
```

### POST `/api/actions/membership`

- **Quyền:** Admin.
- **Input:** customerId:UUID; tier:STANDARD|SILVER|GOLD.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/admin/Marketing.jsx](../frontend/src/features/admin/Marketing.jsx).
- **Quy tắc:** Đọc lại customers/customer-history.

```json
{
  "customerId": "{{customerId}}",
  "tier": "SILVER"
}
```

### GET `/api/dashboard`

- **Quyền:** Admin / Receptionist.
- **Input:** from?,to?:ISO phải có cùng nhau và to>from; chỉ Admin được truyền range.
- **Output 200:** Lễ tân: {roomCounts,occupied,pending,verifying,arrivals,departures}; Admin thêm revenue,collected,debt,unpaidInvoices,report.
- **FE sử dụng:** [frontend/src/features/reports/Dashboard.jsx](../frontend/src/features/reports/Dashboard.jsx).
- **Quy tắc:** report có from,to,bySource:{ROOM,SERVICE,FOOD,SPECIAL},invoiceCounts:{UNPAID,PARTIAL,PAID},arrivals,departures,stays,averageStayHours,usedRooms,occupancyRate. Không có range thì tài chính tổng lịch sử, occupancy dùng hôm nay. Từ 01/11, API công khai không trả nhãn nguồn nội bộ containsDemoData; số liệu vẫn được tính từ DB hiện có.

### GET `/api/reports.csv`

- **Quyền:** Admin.
- **Input:** from?,to?:ISO như dashboard.
- **Output 200:** text/csv UTF-8 BOM, attachment stayflow.csv.
- **FE sử dụng:** [frontend/src/features/reports/Dashboard.jsx](../frontend/src/features/reports/Dashboard.jsx).
- **Quy tắc:** FE dùng responseType:text, không parse JSON.

### GET `/api/forecast`

- **Quyền:** Admin / Receptionist.
- **Input:** days?:7|30 (mặc định 7).
- **Output 200:** {available:false,message,days:[]} hoặc {available:true,model,historyDays,lastObservedDate,intervalMethod,summary,backtest:{days,revenueMAE,demandMAE},days:[{date,revenue,demand,revenueRange:{low,high},demandRange:{low,high}}]}.
- **FE sử dụng:** [frontend/src/features/reports/Assistant.jsx](../frontend/src/features/reports/Assistant.jsx).
- **Quy tắc:** Cần ít nhất 56 ngày lịch sử; mô hình `weekday-trend-v2` hồi quy riêng từng thứ với xu hướng giới hạn, kiểm thử 14 ngày chỉ dùng quá khứ. Không gọi LLM cho endpoint này. `summary` có totalRevenue,totalDemand,averageDailyRevenue,revenueChangePercent,demandChangePercent,peakDate; phần trăm so bình quân ngày kỳ trước cùng độ dài, null nếu kỳ trước bằng 0. Khoảng low/high là khoảng tham khảo từ phân vị 90% sai số kiểm thử và thời hạn, không phải xác suất bảo đảm. Từ 01/11, public API và AI không trả nhãn simulated; dữ liệu dự báo lấy từ lịch sử trong DB, không thay đổi/xóa nguồn dữ liệu nội bộ.

### POST `/api/ai/draft`

- **Quyền:** Guest, đúng stay; Admin / Receptionist.
- **Input:** stayId:UUID; text:trim 3..1000.
- **Output 200:** {serviceCode,checklist,requestedDate,windowStart,windowEnd,clarificationNeeded,clarificationQuestion,provider,requiresConfirmation:true}.
- **FE sử dụng:** [frontend/src/features/housekeeping/TaskForm.jsx](../frontend/src/features/housekeeping/TaskForm.jsx).
- **Quy tắc:** Không ghi task; ngày/giờ có thể null; hỏi lại và xác nhận form trước task-create.
- **Lỗi provider (áp dụng cả manager/marketing):** HTTP 503 `{error,code?,providerStatus?}`. `code`: AI_PROVIDER_REQUEST (400 upstream), AI_PROVIDER_AUTH (401/403), AI_PROVIDER_MODEL (404), AI_PROVIDER_QUOTA (429), AI_PROVIDER_UNAVAILABLE (HTTP khác), AI_PROVIDER_TIMEOUT (timeout/abort), AI_PROVIDER_FAILURE (mạng/parse). Không trả nguyên body provider, không dùng HTTP 401 của nhân viên cho lỗi key AI. Thiếu cấu hình/output không đầy đủ có thể chỉ có `{error}` như trước. Quota StayFlow vẫn trả HTTP 429. [Cấu hình/deploy và seed](gemini-and-demo-seed.md).

```json
{
  "stayId": "{{stayId}}",
  "text": "Tôi muốn thêm khăn vào chiều mai, vui lòng hỏi lại giờ cụ thể"
}
```

### POST `/api/ai/manager`

- **Quyền:** Admin / Receptionist.
- **Input:** question:trim 3..1000.
- **Output 200:** {tool:"dashboard"|"availability"|"forecast",message,data,asOf} hoặc {message,data:null} khi cần làm rõ.
- **FE sử dụng:** [frontend/src/features/reports/Assistant.jsx](../frontend/src/features/reports/Assistant.jsx).
- **Quy tắc:** Read-only allowlist; dữ liệu vẫn áp quyền theo role. Câu hỏi tương lai chọn tool forecast, days=7 hoặc 30; số liệu/lời trả lời lấy từ GET forecast, không dùng LLM tự tạo con số. UI có câu hỏi gợi ý; chỉ gửi khi bấm Hỏi trợ lý. Nếu chưa đủ lịch sử, trả thông báo thay cho con số dự đoán.

```json
{
  "question": "Có bao nhiêu phòng đang có khách?"
}
```

### POST `/api/ai/marketing`

- **Quyền:** Admin.
- **Input:** brief:string 5..1000.
- **Output 200:** {draft:string,requiresApproval:true}.
- **FE sử dụng:** [frontend/src/features/admin/Marketing.jsx](../frontend/src/features/admin/Marketing.jsx).
- **Quy tắc:** Chỉ tạo bản nháp, không tự gửi.

```json
{
  "brief": "Viết lời cảm ơn khách đã lưu trú, không thêm ưu đãi hay giá"
}
```

<a id="08"></a>

## 08. Thông báo

### GET `/api/notifications`

- **Quyền:** Staff.
- **Input:** page?.
- **Output 200:** Notification[] có id,title,body,taskId,eventKey,isRead,createdAt,...
- **FE sử dụng:** [frontend/src/features/notifications/Notifications.jsx](../frontend/src/features/notifications/Notifications.jsx).
- **Quy tắc:** 30 dòng của user hiện tại; BE lọc thông báo riêng khi mất quyền.

### POST `/api/actions/notification-read`

- **Quyền:** Staff.
- **Input:** id:notificationId UUID.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/notifications/Notifications.jsx](../frontend/src/features/notifications/Notifications.jsx).
- **Quy tắc:** Chỉ thông báo của mình.

```json
{
  "id": "{{notificationId}}"
}
```

### POST `/api/actions/device`

- **Quyền:** Staff.
- **Input:** token:ExpoPushToken[...] hoặc ExponentPushToken[...].
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/notifications/Notifications.jsx](../frontend/src/features/notifications/Notifications.jsx).
- **Quy tắc:** Đăng ký device token; không đồng nghĩa remote push đã được xác minh. PUSH_ENABLED/FCM/native build là việc cấu hình riêng.

```json
{
  "token": "{{expoPushToken}}"
}
```

<a id="09"></a>

## 09. Cleaner — tương thích

### GET `/api/cleaners` — tương thích dữ liệu cũ

- **Quyền:** Admin / Receptionist.
- **Input:** Không có.
- **Output 200:** {id,name,enabled,zone,skills,accepting,inShift,busy}[]
- **FE sử dụng:** Màn cũ/giao việc.
- **Quy tắc:** Dữ liệu tài khoản Cleaner cũ, không dùng làm yêu cầu bắt buộc cho dọn trực tiếp.

### GET `/api/offers` — tương thích dữ liệu cũ

- **Quyền:** Cleaner cũ.
- **Input:** Không có.
- **Output 200:** Offer[] của mình còn hạn, có serverNow,taskId,expiresAt,roomNumber,serviceName,notes,windowStart,windowEnd.
- **FE sử dụng:** [frontend/src/features/cleaner/Cleaner.jsx](../frontend/src/features/cleaner/Cleaner.jsx).
- **Quy tắc:** serverNow ở từng offer; không dựa đồng hồ điện thoại làm quyết định accept.

### GET `/api/cleaner-status` — tương thích dữ liệu cũ

- **Quyền:** Cleaner cũ.
- **Input:** Không có.
- **Output 200:** {userId,zone,skills,accepting,inShift,busy,...} hoặc null nếu thiếu profile.
- **FE sử dụng:** [frontend/src/features/cleaner/Cleaner.jsx](../frontend/src/features/cleaner/Cleaner.jsx).
- **Quy tắc:** busy/inShift tính từ DB.

### POST `/api/actions/cleaner` — tương thích dữ liệu cũ

- **Quyền:** Admin.
- **Input:** userId:UUID; zone:1..120; skills:array >=1 FULL|TURNOVER|LINEN|BATHROOM|TOWELS; startsAt,endsAt:ISO.
- **Output 200:** {ok:true}.
- **FE sử dụng:** admin/Admin.jsx (luồng cũ).
- **Quy tắc:** Cấu hình hồ sơ/ca cho Cleaner cũ; không phải tạo tài khoản Cleaner mới.

```json
{
  "userId": "{{cleanerId}}",
  "zone": "Tầng 1",
  "skills": [
    "FULL",
    "TURNOVER",
    "TOWELS"
  ],
  "startsAt": "{{startAt}}",
  "endsAt": "{{endAt}}"
}
```

### POST `/api/actions/cleaner-availability` — tương thích dữ liệu cũ

- **Quyền:** Cleaner cũ.
- **Input:** accepting:boolean.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/cleaner/Cleaner.jsx](../frontend/src/features/cleaner/Cleaner.jsx).
- **Quy tắc:** Không cho FE tự thay busy/inShift.

```json
{
  "accepting": true
}
```

### POST `/api/actions/offer-accept` — tương thích dữ liệu cũ

- **Quyền:** Cleaner cũ.
- **Input:** offerId:UUID.
- **Output 200:** {id:assignmentId,taskId}.
- **FE sử dụng:** [frontend/src/features/cleaner/Cleaner.jsx](../frontend/src/features/cleaner/Cleaner.jsx).
- **Quy tắc:** Kiểm tra chủ offer, hạn, version, eligibility trong transaction; chỉ người thắng nhận được assignment.

```json
{
  "offerId": "{{offerId}}"
}
```

### POST `/api/actions/offer-reject` — tương thích dữ liệu cũ

- **Quyền:** Cleaner cũ.
- **Input:** offerId:UUID.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/cleaner/Cleaner.jsx](../frontend/src/features/cleaner/Cleaner.jsx).
- **Quy tắc:** Chỉ offer của chính mình.

```json
{
  "offerId": "{{offerId}}"
}
```

### POST `/api/actions/task-assign` — tương thích dữ liệu cũ

- **Quyền:** Admin / Receptionist.
- **Input:** taskId:UUID; cleanerId:UUID.
- **Output 200:** {id:assignmentId,taskId}.
- **FE sử dụng:** Luồng giao Cleaner cũ.
- **Quy tắc:** Task PENDING, gần khung giờ <=15 phút, Cleaner eligible.

```json
{
  "taskId": "{{taskId}}",
  "cleanerId": "{{cleanerId}}"
}
```

### POST `/api/actions/task-reassign` — tương thích dữ liệu cũ

- **Quyền:** Admin / Receptionist.
- **Input:** taskId:UUID; reason:string >=5 <=500.
- **Output 200:** {ok:true}.
- **FE sử dụng:** Luồng giao Cleaner cũ.
- **Quy tắc:** Task PENDING/ASSIGNED/IN_PROGRESS → PENDING, đóng assignment cũ và revoke offers, version++; không tự giao khi mất socket.

```json
{
  "taskId": "{{taskId}}",
  "reason": "Điều phối lại người thực hiện"
}
```

### POST `/api/actions/task-start` — tương thích dữ liệu cũ

- **Quyền:** Cleaner cũ.
- **Input:** taskId:UUID.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/cleaner/Cleaner.jsx](../frontend/src/features/cleaner/Cleaner.jsx).
- **Quy tắc:** Đúng assignment đang hoạt động; khung giờ, stay/DND/cycle hợp lệ.

```json
{
  "taskId": "{{taskId}}"
}
```

### POST `/api/actions/task-submit` — tương thích dữ liệu cũ

- **Quyền:** Cleaner cũ.
- **Input:** taskId:UUID; checklist:string[] <=20 đầy đủ như checklistJson.
- **Output 200:** {ok:true}.
- **FE sử dụng:** [frontend/src/features/cleaner/Cleaner.jsx](../frontend/src/features/cleaner/Cleaner.jsx).
- **Quy tắc:** IN_PROGRESS → AWAITING_VERIFICATION; desk task-verify sau đó.

```json
{
  "taskId": "{{taskId}}",
  "checklist": [
    "Bổ sung khăn",
    "Thu gom khăn bẩn"
  ]
}
```

## Socket.IO, cache và thứ tự tải lại

Socket.IO nối origin API, handshake `{auth:{token},transports:["websocket"]}`, chỉ staff. Server join `user:<id>`, client nhận event `changed` rồi GET lại dữ liệu; không xem event như command thay trạng thái. Server xác minh lại token mỗi 15 giây, worker tick mỗi 5 giây. Đây không phải WebSocket thuần để dùng thay thư viện Socket.IO. Guest không dùng socket staff.

Hiện `useAction` invalidate toàn bộ queries khi thành công; socket connect/changed và AppState active cũng invalidate; query polling mặc định 15 giây, staleTime 5 giây, query retry 1, mutation không tự retry. Nếu tối ưu cache theo module, tối thiểu phải giữ các quan hệ sau:

- customer/membership → customers, customer-lookup, customer-history.
- booking/booking-cancel → bookings, booking-receipts, availability, rooms, dashboard.
- checkin → bookings, stays, rooms, availability, receipts, booking-receipts, quote, dashboard, customer-history, room-history.
- serviceItem/receipt/receipt-return/refund → quote, receipts hoặc booking-receipts, invoices, dashboard, customer-history.
- checkout → stays, rooms, invoices, quote, receipts, tasks, dashboard, availability và lịch sử khách/phòng.
- task-create/cancel/reschedule/start/complete/verify → tasks, room-cleaning-history, rooms, quote, dashboard, notifications; luồng Cleaner thêm offers/cleaner-status/cleaners.
- food/special order-status → danh sách order đúng kind/purpose, quote, notifications; hoàn tất ảnh hưởng hóa đơn tương lai.
- room/roomType/maintenance → rooms, roomTypes, availability, maintenance, dashboard.
- user → users, quyền/phiên; device/notification-read → notifications.

## Postman: cấu hình và dùng đúng key

1. Import collection, đặt baseUrl origin môi trường test; điền username/password/newPassword trong local values của Postman. Không có mật khẩu/token thật trong file.
2. Gửi login: script chỉ lưu token/refreshToken vào collection khi status=200. Gửi refresh sẽ lưu token mới; exchange lưu guestToken/stayId riêng, không ghi đè token staff.
3. Trước action, tự điền `idempotencyKey` 8–100 ký tự. Dùng key mới cho một ý định mới hoặc action khác; giữ key khi gửi lại đúng body chưa rõ kết quả. Collection cố ý không tự sinh key mỗi lần Send vì cách đó làm mất bảo vệ retry.
4. Điền startAt/endAt là thời gian tương lai có offset, roomId/customerId/bookingId/stayId/serviceId/... từ kết quả thực tế. Key không thay thế ID resource. Collection không tự suy đoán dữ liệu phụ thuộc hay chạy xâu chuỗi.
5. Hai checklist mẫu là loại TOWELS; đổi sang các chuỗi trong checklistJson của task thật nếu thử loại khác. Gửi đổi trạng thái PREPARING trước, sau đó đổi body/key cho COMPLETED.
6. Request guest-stay/task-review dùng guestToken; tasks/services/dnd/task-create/task-cancel mặc định token staff, muốn thử guest thì đổi Bearer sang guestToken. Cleaner endpoints cần đăng nhập bằng tài khoản Cleaner cũ được cấp trong DB test.
7. Response template trong tài liệu không phải test assertion tự chạy. Kịch bản acceptance nằm ở team-handoff.md; đối chiếu source/service khi bổ sung field mới.

## Khác với tài liệu API cũ

- Có customer inline/lookup, endsAt/expectedEnd tùy chọn, HOUR/NIGHT cho giao dịch mới.
- Có task-desk-start/task-desk-complete không cần shift.
- Có 4 resource và 6 action FOOD/SPECIAL, tách purpose, phân quyền riêng.
- Checkout có finalTotal/adjustmentReason/paymentAmount/paymentMethod/payRemaining; Lễ tân được điều chỉnh có lý do. Công nợ và hoàn tiền vẫn Admin.
- reports.csv chỉ Admin; dashboard Lễ tân không nhận tài chính, range chỉ Admin.
- POST user có canAccessSpecialServices; không tạo tài khoản Cleaner mới.
- refresh có trên BE nhưng FE hiện chỉ gọi khi restore, gặp 401 thì đăng xuất.
