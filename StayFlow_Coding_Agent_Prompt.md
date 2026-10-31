# Prompt để coding agent triển khai StayFlow

Sao chép nội dung từ BẮT ĐẦU PROMPT đến KẾT THÚC PROMPT vào agent đang mở thư mục dự án. Bản này dùng được độc lập; nếu có file đặc tả `StayFlow_React_Native_Agent_Prompt.md`, cung cấp thêm để agent tham chiếu nghiệp vụ chi tiết.

**BẮT ĐẦU PROMPT**

Bạn là Senior React Native Developer và Backend Developer. Hãy trực tiếp xây dựng **StayFlow**, ứng dụng quản lý nhà nghỉ/khách sạn nhỏ, có **Smart Housekeeping — gọi nhân viên dọn phòng theo yêu cầu** và AI hiểu tiếng Việt.

Đây là dự án môn học. Cần mã nguồn chạy được, dữ liệu được lưu thật, giao diện hoàn chỉnh và bản Android APK để demo. Hãy triển khai từng luồng từ UI đến database, kiểm thử rồi tiếp tục. Không chỉ trả về kế hoạch hoặc các màn hình mock.

## 1. Cách bắt đầu và phạm vi

- Đọc hướng dẫn repository, package.json, cấu trúc source, schema và API hiện có. Tái sử dụng phần phù hợp; không xóa hoặc viết lại toàn bộ dự án đang hoạt động.
- Nếu có file `StayFlow_React_Native_Agent_Prompt.md`, đọc đặc tả đó để giữ các quy tắc nghiệp vụ chi tiết. Nếu chưa có, dùng phạm vi dưới đây và ghi các quyết định còn thiếu vào `docs/assumptions.md`.
- Nếu thư mục trống, tạo `mobile/`, `backend/`, `frontend/guest-web/`, `docs/`. Guest-web chỉ là form dọn phòng nhỏ, không phải website đặt phòng đầy đủ.
- Một cơ sở lưu trú; tiếng Việt; tiền VND; lưu thời gian UTC và diễn giải theo `Asia/Ho_Chi_Minh`.
- Ba vai trò app: Admin, Receptionist, Cleaner. Khách sử dụng form từ QR/link của lượt lưu trú, không cần cài APK hoặc tạo tài khoản.
- Dùng modular monolith. Không mở rộng thành nhiều đại lý/chi nhánh, microservices, ví điện tử hoặc hệ thống OTA.
- Chủ động quyết định các chi tiết nhỏ. Chỉ hỏi khi thiếu thông tin thực sự ảnh hưởng kiến trúc, quyền truy cập dịch vụ hoặc nghiệp vụ quan trọng.

## 2. Công nghệ

- Mobile bắt buộc **React Native + Expo + JavaScript**, chỉ viết mã ứng dụng `.js/.jsx`, không TypeScript.
- Nếu tạo mới, chọn template JavaScript; kiểm tra tài liệu chính thức và phiên bản Expo SDK ổn định tương thích. Cài package Expo bằng `npx expo install` khi phù hợp và giữ lockfile.
- React Navigation; TanStack Query cho dữ liệu server; Zustand hoặc Context cho trạng thái UI nhỏ; Axios; React Hook Form và validation schema.
- React Native Paper + StyleSheet/theme; Expo SecureStore cho credential; Expo Notifications; Expo Print/Sharing cho hóa đơn PDF.
- Guest-web dùng Expo Web/React Native JavaScript, tái sử dụng validation và các component phù hợp.
- Ưu tiên tích hợp backend hiện có. Nếu chưa có: **Node.js + Express + JavaScript + SQL Server**, driver `mssql`, query tham số hóa, transaction, migration và seed.
- Socket.IO cập nhật khi app mở; Expo Push/FCM thông báo cho Cleaner; worker đơn giản cùng codebase xử lý outbox và offer hết hạn. Chưa cần Redis/RabbitMQ.
- AI chỉ gọi qua backend. Không để AI key, DB password, JWT signing secret trong mobile hoặc biến `EXPO_PUBLIC_*`.

## 3. Phân quyền

- Admin: tài khoản, phòng, loại phòng, bảng giá, dịch vụ, nhân viên dọn phòng, ca làm, báo cáo, marketing, hoàn tiền và điều chỉnh hóa đơn.
- Receptionist: khách hàng, booking, check-in/out, dịch vụ sử dụng, thu tiền, tạo/giao lại/kiểm tra công việc dọn phòng.
- Cleaner: bật nhận việc, xem lời mời của mình, nhận/từ chối, bắt đầu, nộp checklist, xem lịch sử và công của mình nếu bật.
- Guest: tạo/xem/hủy trước khi bắt đầu và đánh giá công việc thuộc đúng lượt lưu trú được cấp quyền.
- Kiểm tra quyền trên backend. Cleaner không được đọc danh sách khách, doanh thu, hóa đơn hoặc công việc không thuộc quyền của mình. Khóa tài khoản phải ngăn request tiếp theo; không chỉ ẩn menu.

## 4. Chức năng quản lý lưu trú

Triển khai các nhóm sau và theo dõi trạng thái hoàn thành:

1. Authentication: đăng nhập, đăng xuất, đổi mật khẩu; Admin tạo/sửa/khóa/mở khóa tài khoản.
2. Rooms: danh sách/chi tiết/ảnh; tìm và lọc; loại phòng, sức chứa, giá; ngừng sử dụng; lịch sử sử dụng.
3. Customers: tạo/sửa/tìm theo tên/điện thoại; lịch sử lưu trú và hóa đơn.
4. Booking: kiểm tra phòng trống theo khoảng thời gian, tạo/sửa/xác nhận/hủy, tiền cọc, chuyển thành stay.
5. Check-in: walk-in hoặc từ booking; khách đại diện, số khách, giờ thực tế/dự kiến, hình thức thuê và snapshot giá.
6. Services: danh mục/đơn giá/đơn vị; thêm dịch vụ vào stay, sửa số lượng trước chốt; lưu snapshot giá.
7. Check-out: báo giá phòng/dịch vụ/phụ thu/giảm giá/cọc; thanh toán; đóng stay; chuyển phòng cần dọn.
8. Invoices & Payments: thu tiền mặt/chuyển khoản thủ công, thu nhiều lần, công nợ, lịch sử thanh toán, PDF/share; Admin hoàn tiền/điều chỉnh có audit.
9. Dashboard: phòng theo trạng thái, check-in/out hôm nay, doanh thu, tiền thực thu, công nợ, xuất CSV tiếng Việt.
10. Housekeeping & Maintenance: dọn theo yêu cầu/dọn sau checkout, báo sự cố, lịch bảo trì chặn phòng và lịch sử xử lý.
11. Notifications: khách sắp đến/sắp đi, quá giờ, việc dọn phòng, sự cố; đã đọc/chưa đọc, mở đúng màn hình theo quyền.

Quy tắc cốt lõi:

- Tách trạng thái booking, stay, vệ sinh phòng, bảo trì và thanh toán. Phòng trống hiện tại chưa chắc khả dụng cho khoảng đặt phòng tương lai.
- Kiểm tra và tạo/sửa booking/check-in trong transaction để chống đặt trùng. Không coi khách quá giờ dự kiến là đã checkout.
- Hỗ trợ giá giờ/qua đêm/ngày; chốt chính sách grace, làm tròn và phụ thu vào tài liệu và seed. Backend tính tiền và trả breakdown; test các mốc biên. Thay bảng giá không đổi snapshot của stay đang ở.
- Tiền VND dùng số nguyên an toàn hoặc kiểu số chính xác. Tiền cọc là khoản đã thu, không phải giảm giá; phân bổ cọc sang hóa đơn không tạo lần thu mới.
- Doanh thu nội bộ theo hóa đơn đã chốt khác tiền thực thu theo giao dịch. Không cộng hai lần tiền cọc và không tính tiền thừa trả khách thành doanh thu.
- Check-out mặc định cần trả đủ; Admin cho còn nợ phải có lý do. Thao tác tiền/check-in/check-out có idempotency. Refund phải đi cùng điều chỉnh nghĩa vụ phù hợp, không tự tạo công nợ giả.
- Sau checkout phòng cần dọn; chỉ sẵn sàng khi sạch, không có stay đang mở và không bị bảo trì chặn.

## 5. Smart Housekeeping — chức năng trọng tâm

Admin quản lý khoảng 5–10 Cleaner, khu vực/tầng, loại việc có thể làm, ca làm và trạng thái hoạt động. Trạng thái Rảnh/Bận/Ngoài ca phải dựa trên dữ liệu server; Cleaner không tự bật Rảnh để vượt giới hạn nhận việc.

Loại việc demo: dọn toàn phòng, dọn sau checkout, thay ga, vệ sinh phòng tắm, bổ sung khăn. Dọn tiêu chuẩn mặc định đã bao gồm tiền phòng; dịch vụ thu phí phải có giá và được chấp thuận trước. Tiền công nhân viên tách riêng phí khách trả.

Workflow:

1. Khách mở QR của stay hoặc lễ tân tạo yêu cầu thay khách.
2. Chọn loại việc/khung giờ hoặc nhập tiếng Việt cho AI tạo bản nháp.
3. Khách/lễ tân xác nhận loại việc, khung giờ, phí và điều kiện vào phòng.
4. Backend kiểm tra quyền, stay, Không làm phiền, lịch và trùng yêu cầu; lưu task PENDING cùng outbox trong transaction.
5. Lọc người trong ca, có kỹ năng, bật nhận việc và chưa có assignment active. Với yêu cầu tương lai, điều phối gần giờ, không giữ nhân viên bận từ lúc tạo yêu cầu.
6. Gửi offer đến tối đa 3 người phù hợp, TTL demo 60 giây. Có giới hạn vòng gửi; không ai nhận thì báo lễ tân, không tự báo khách đã có người nhận.
7. Cleaner nhận/từ chối. Nhận việc phải xác minh lại offer, giờ server, task version và tính khả dụng trong transaction.
8. Người nhận hợp lệ đầu tiên được giao. Thu hồi offer còn lại của task; mỗi task và mỗi Cleaner tối đa một assignment active. Retry trả lại kết quả cũ.
9. Cleaner bắt đầu, làm checklist và nộp hoàn tất. Lễ tân kiểm tra đạt hoặc yêu cầu làm lại có lý do.
10. Hoàn tất hợp lệ mới cập nhật vệ sinh, cho đánh giá và ghi phí/công nếu áp dụng, đúng một lần.

Task states:
PENDING → ASSIGNED → IN_PROGRESS → AWAITING_VERIFICATION → COMPLETED.
Cho CANCELLED trước bắt đầu; kiểm tra không đạt thì quay về PENDING với lịch sử assignment được giữ lại.

Yêu cầu bắt buộc:

- Dọn khi khách còn ở vẫn giữ phòng đang có khách. Thay khăn không tự đánh dấu toàn phòng đã sạch.
- Task dọn sau checkout gắn đúng chu kỳ/lượt ở; công việc cũ không được cập nhật trạng thái của lượt ở mới.
- Offer hết hạn/thu hồi không được nhận dù push đến trễ. Mất socket sau nhận việc không tự hủy assignment; lễ tân xác minh trước khi giao lại.
- Đổi giờ/loại việc phải vô hiệu offer cũ và tính lại. Yêu cầu dừng khi đang làm chuyển lễ tân xử lý, không âm thầm giao người khác.
- Khi submit, đóng assignment active để nhân viên nhận việc khác; task chờ lễ tân kiểm tra. Nếu làm lại thì có assignment mới, không thu phí hai lần.
- Dùng transaction và unique constraint/filtered unique index để chống trùng; disable nút trên UI không đủ.
- Database là nguồn trạng thái thật; socket/push chỉ báo thay đổi. Foreground/reconnect luôn refetch; outbox lưu bền vững, có retry và dedupe.
- QR/link dùng token ngẫu nhiên gắn stay, lưu hash, có hạn/thu hồi, đổi thành session guest hạn chế. Không dùng số phòng làm mật khẩu. Checkout vô hiệu quyền tạo yêu cầu mới.

## 6. AI và phân công

AI-03 là ưu tiên đầu tiên: hiểu yêu cầu dọn phòng tiếng Việt.

Ví dụ: “Chiều nay 3 giờ dọn phòng và thay ga giúp tôi, xong trước 4 giờ”.

Backend gọi LLM để trả dữ liệu theo schema: serviceCode, checklist, requestedDate, windowStart, windowEnd, clarificationNeeded, clarificationQuestion. Phòng/stay lấy từ quyền đã xác thực, không lấy từ model.

- Validate dịch vụ, checklist và ngày giờ ở backend. Thiếu thông tin hoặc câu mơ hồ thì hỏi lại.
- Chỉ trả bản nháp; người dùng xác nhận mới tạo task. AI không tự cho phép vào phòng hoặc tự chấp thuận phí.
- Thiếu key/timeout: chuyển sang form thường, ghi rõ AI chưa hoạt động; không giả câu trả lời hard-code thành AI thật.
- Tạo bộ 30–50 câu có đáp án kiểm tra để đánh giá loại việc, ngày/giờ, tỷ lệ phải hỏi lại và độ trễ.

Phân công MVP dùng thuật toán theo luật, các thành phần chuẩn hóa về [0,1]:

score = 100 × (0.40 × zoneFit + 0.30 × loadBalance + 0.20 × quality + 0.10 × idleTime).

- zoneFit: ưu tiên cùng tầng/khu vực; chưa cần GPS.
- loadBalance: dựa trên số phút đã làm trong ca, không chỉ số việc.
- quality: rating đã xác thực, làm trơn về mức chung để nhân viên mới không bị điểm 0.
- idleTime: ưu tiên người chờ lâu; có quy tắc phá hòa ổn định.
- Lưu breakdown và phiên bản trọng số để giải thích; đây là heuristic, không gọi là mô hình ML đã huấn luyện. Điểm chọn nhóm được mời, không bảo đảm người nhận đầu tiên luôn có điểm cao nhất.

Sau luồng chính, triển khai:

- AI-01: trợ lý quản lý hỏi doanh thu, phòng trống, công nợ. Chỉ gọi các backend tool đọc dữ liệu trong allowlist, áp quyền; không chạy SQL tùy ý hoặc bịa số.
- AI-02: dự báo doanh thu/nhu cầu 7 và 30 ngày bằng baseline thống kê theo ngày trong tuần. Backtest theo thời gian; không để LLM tự sinh số dự báo. Thiếu lịch sử thì thông báo chưa đủ dữ liệu; dữ liệu seed phải ghi rõ mô phỏng.
- Marketing: voucher có hạn/điều kiện/giới hạn lượt, hạng khách hàng, nguồn booking, campaign, nội dung chăm sóc và AI soạn bản nháp. Không tự gửi hàng loạt/đăng quảng cáo. Phân biệt doanh thu quy nguồn với doanh thu tăng thêm do chiến dịch.

## 7. Dữ liệu, API và cấu trúc code

Tái sử dụng bảng hiện có; bổ sung schema/migration có PK, FK, index và constraint. Nhóm dữ liệu chính:

- Users, RefreshSessions, Rooms, RoomTypes, RatePlans, Customers, Bookings, Stays.
- Services, StayServiceItems, Invoices, InvoiceLines, Receipts, PaymentAllocations, Refunds/Adjustments.
- CleanerProfiles, CleanerShifts, HousekeepingTasks, CleaningOffers, CleaningAssignments, CleaningReviews.
- GuestAccessTokens, Notifications, DeviceTokens, OutboxEvents, AuditLogs, IdempotencyRecords.
- Voucher/Campaign/Membership theo giai đoạn; CleaningEarnings tùy chọn khi tính công theo việc.

HousekeepingTasks cần roomId, stayId, serviceId, source, timeWindow, status, checklist, priceSnapshot, turnoverKey/dedupeKey và version.
CleaningOffers cần taskId, cleanerId, round, expiresAt, status, scoreBreakdown.
CleaningAssignments cần taskId, cleanerId, offerId, assignedAt, startedAt, submittedAt, closedAt, status và isActive.

Phân biệt trạng thái offer, task và assignment. Unique assignment active theo taskId và cleanerId. Giao thủ công dùng cùng business service như nhận offer.

API hành động rõ ràng: guest-access/exchange, AI draft, create task, list own offers, accept/reject offer, start/submit/verify/cancel/reassign task, review và báo cáo. Không cho PATCH status tùy ý bỏ qua nghiệp vụ.

- Mobile tổ chức theo feature: auth, rooms, customers, bookings, stays, invoices, housekeeping, cleaner, reports, notifications, ai, marketing.
- Tách screens/components/hooks/api/validation; có theme, navigation, API client và query client chung.
- Backend chia route/controller/service/repository; tách pricing, availability và assignment thành logic có thể test.
- Không gọi API rải rác trong component hoặc nhét mọi thứ vào App.js. Không tính giá chính thức trên mobile.

## 8. Giao diện và dữ liệu demo

- Giao diện tiếng Việt, nền sáng, navy/teal, status badge có chữ, bố cục phù hợp điện thoại.
- Admin/Receptionist: Tổng quan, Phòng, Đặt phòng, Khách hàng, Thêm.
- Cleaner: Việc mới, Việc của tôi, Lịch sử, Cá nhân; nút Rảnh/Nghỉ và countdown offer rõ ràng.
- Guest form: loại việc, nội dung yêu cầu, giờ mong muốn, xác nhận, theo dõi tiến độ.
- Có loading, empty, error/retry, search/filter, pagination, keyboard handling, safe area và chống double-submit.
- Mất mạng chỉ cho xem cache được phép; chặn giao dịch tiền/phòng/nhận việc chưa xác nhận được server. Không báo thành công giả.
- Seed khoảng 20 phòng, 3 loại phòng, 6 Cleaner có ca/trạng thái khác nhau, khách/stay/booking và việc mẫu. Demo là môi trường riêng, không gửi tin thật tới người ngoài.

## 9. Expo EAS và APK

- Tạo app config, icon/splash, Android package và eas.json. Giữ định danh EAS của dự án hiện có; không bịa owner/projectId.
- Profile development dùng expo-dev-client; profile preview tạo APK release không cần Metro để mở app.
- Cấu hình preview tối thiểu: distribution = internal, android.buildType = apk.
- Lệnh build: npx eas-cli@latest build --platform android --profile preview.
- Chạy expo dependency check, expo-doctor, lint/test liên quan và Android bundle check trước build. Bundle pass không đồng nghĩa native build pass.
- Kiểm thử remote push bằng development build hoặc APK đã cấu hình FCM, không chỉ Expo Go.
- EXPO_PUBLIC_API_URL phải trỏ tới backend điện thoại truy cập được; không dùng localhost cho APK chia sẻ. Backend và guest-web cần triển khai riêng, EAS không tự triển khai hai phần đó.
- Nếu có tài khoản/quyền, thực hiện build và trả URL/APK thật. Nếu thiếu Expo/FCM/AI credentials, hoàn tất phần độc lập, ghi rõ bước còn thiếu; không báo đã build hoặc tích hợp thành công.

## 10. Kiểm thử và thứ tự triển khai

Kiểm tra tối thiểu:

- Quyền Admin/Receptionist/Cleaner/Guest, tài khoản khóa và token guest sau checkout.
- Booking cạnh tranh; giá giờ/qua đêm/ngày; snapshot; cọc không thu hai lần; payment/refund retry.
- Hai Cleaner nhận một task và một Cleaner nhận hai task đồng thời: chỉ một assignment hợp lệ.
- Offer hết hạn, từ chối, push trễ, hủy/đổi lịch, mất mạng, outbox restart và làm lại.
- Dọn khi khách đang ở không làm phòng thành trống; task cũ không đổi trạng thái chu kỳ mới.
- AI tạo đúng bản nháp, hỏi lại khi thiếu thông tin, có fallback và không ghi dữ liệu khi chưa xác nhận.
- APK preview khởi động không có Metro, kết nối API, chạy luồng chính; nêu rõ nếu chưa có thiết bị để test.

Thứ tự:

1. Khảo sát repo, chốt assumptions, nền tảng Expo JS/backend, migration, auth và role.
2. Phòng, khách, booking/check-in, giá, dịch vụ, thanh toán/check-out đủ cho một luồng thực tế.
3. Smart Housekeeping từ form đến database, Cleaner nhận việc, checklist/verify; socket/push.
4. AI-03, form QR cho khách, dashboard dọn phòng và demo hai thiết bị.
5. Hoàn thiện các nhóm quản lý còn lại, CRM/marketing, AI-01 và AI-02 theo thứ tự ưu tiên.
6. Kiểm thử, sửa lỗi, build APK và tài liệu bàn giao.

Sau mỗi giai đoạn, kiểm tra phần vừa thay đổi, cập nhật tiến độ rồi tiếp tục. Phần bị chặn vì credentials được ghi riêng; không dùng nó làm lý do bỏ phần độc lập.

## 11. Bàn giao

- Source chạy được, migration/seed, .env.example không chứa secret.
- README hướng dẫn setup SQL Server, backend, mobile, guest-web và tài khoản demo qua seed.
- docs/assumptions.md, business-rules.md, architecture.md, API contract, requirements-traceability.md, progress.md, test-results.md, eas-build.md.
- docs/demo-script.md: check-in → khách nhập yêu cầu tiếng Việt → xác nhận draft → hai Cleaner nhận thông báo → một người nhận → dọn/kiểm tra → trạng thái phòng đúng → checkout.
- APK/build URL thật hoặc thông tin chính xác về điều kiện còn thiếu. Phân biệt đã viết code, đã test API, đã bundle, đã native build và đã test thiết bị.

**Bắt đầu ngay bằng đọc repository, tóm tắt hiện trạng ngắn gọn rồi sửa/tạo mã nguồn cho giai đoạn 1. Tiếp tục đến khi hoàn thành phạm vi hoặc chỉ còn các bước phụ thuộc quyền/credentials chưa có. Không kết thúc sau phần lập kế hoạch.**

**KẾT THÚC PROMPT**
