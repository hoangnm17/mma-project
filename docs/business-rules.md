# Quy tắc nghiệp vụ

> Requirement hiện hành đã đổi ngày 31/10/2026. Xem [cập nhật requirement](requirements-update.md) cho hai vai trò, bỏ ca bắt buộc, thuê HOUR/NIGHT, giá nhiều đêm, điều chỉnh hóa đơn và các đơn ăn uống/hỗ trợ riêng. Những mô tả DAY, chỉ Cleaner và ca ở dưới là luồng lịch sử.

## Lưu trú và giá

Booking CONFIRMED/CANCELLED/CHECKED_IN khác Stay OPEN/CLOSED, vệ sinh CLEAN/DIRTY, bảo trì và thanh toán. Không tự checkout theo giờ dự kiến. Kiểm tra và ghi booking/check-in/checkout trong transaction.

Khoảng `[start,end)`; booking tiếp giáp không trùng. Phòng ngừng/bảo trì không khả dụng. Check-in cần sạch, không stay mở, không trùng booking. Từ booking phải lấy room/customer/guests/mode đã lưu, tối đa sớm 1 giờ.

Giá mẫu giờ 80.000, ngày 350.000, đêm 250.000, phụ thu đêm 50.000/giờ; loại khác có giá cao hơn. Giờ/ngày làm tròn lên sau 15 phút grace, tối thiểu 1 đơn vị. Qua đêm đến 12:00 Việt Nam tiếp theo sau check-in; sau 12:15 phụ thu làm tròn giờ. Không tự nhân giá đêm nhiều đêm: dùng DAY cho nhiều ngày. Snapshot khi check-in không đổi khi sửa RoomTypes.

Backend trả breakdown, mobile không tính giá chính thức. VND nguyên, tối đa một tỷ mỗi giá trị/hóa đơn. Dịch vụ snapshot tên/đơn giá, chỉ sửa số lượng trước chốt. Cleaning taskId unique, không sửa như dịch vụ thường.

## Tài chính

Cọc là receipt, không phải giảm giá. Check-in gắn receipt cũ sang stay. Checkout phân bổ số tiền ròng qua PaymentAllocations, không tạo lần thu mới. Voucher kiểm tra thời hạn, minTotal, maxUses và perCustomer trong transaction.

Checkout cần đủ tiền; Admin cho nợ phải có lý do. Sau chốt được thu đến số dư còn thiếu. Không thu quá báo giá; cọc vượt tổng cuối thì Admin hoàn dư trước chốt bằng ReceiptReturns. Refund sau chốt đồng thời giảm nghĩa vụ đúng số tiền trả lại bằng Adjustments; retry không nhân đôi.

Doanh thu = invoice trừ adjustments. Thực thu = receipts trừ refunds và receipt returns, bao gồm cọc chưa chốt. Công nợ = nghĩa vụ sau điều chỉnh trừ số thực thu của stay. PaymentAllocations không cộng vào thực thu.

## Smart Housekeeping

PENDING → ASSIGNED → IN_PROGRESS → AWAITING_VERIFICATION → COMPLETED. Hủy PENDING/ASSIGNED. Kiểm tra không đạt cần lý do, assignment cũ REWORK giữ lại, task PENDING và tăng version; vòng offer mới tách theo version.

Tạo cần stay hợp lệ, không DND, consent, đồng ý phí, khung <=7 ngày; TURNOVER chỉ checkout. Không trùng loại việc/chồng giờ cùng stay. Đổi lịch/loại thu hồi offer; đổi phí khác cần hủy và xác nhận lại.

Eligible: Cleaner enabled, trong ca, có kỹ năng, bật nhận, không active assignment. Điểm = 100 × (.40 zoneFit + .30 loadBalance + .20 quality + .10 idleTime). Khối lượng theo phút trong ca; quality làm trơn 5 rating ở mức 4/5; idle tối đa 1 giờ. Hòa điểm phá theo userId. Offer lưu rules-v1 breakdown.

Accept kiểm tra chủ offer, status, expiry theo server, version, eligible trong transaction; người đầu tiên nhận, thu hồi offer khác. Retry accepted trả assignment cũ. Mất socket không hủy assignment; giao lại việc đang làm cần lễ tân xác minh và lý do.

Submit đủ checklist đóng active assignment, cho nhận việc khác. Lễ tân/Admin xác nhận mới ghi phí một lần và cập nhật CLEAN cho fullClean. Thay khăn/ga không tự sạch cả phòng. Dọn khi có khách giữ OPEN; turnover chỉ cập nhật đúng cycle và không stay mới.

## Quyền, AI và vận hành

Mỗi staff request đọc enabled/authVersion. Guest random token 32 byte lưu hash SHA-256, link hạn 7 ngày, session 2 giờ, cấp lại/checkout thu hồi. Số phòng không là mật khẩu.

AI-03 chỉ draft, whitelist dịch vụ/checklist và validate giờ; không tạo việc/cấp consent/chấp thuận phí. AI-01 chỉ tool dashboard/availability/clarify, backend đọc đúng quyền, không SQL tùy ý. Thiếu key/timeout/schema sai trả 503. Quota ngày/rate limit/output cap hạn chế chi phí.

Outbox cùng transaction với notification, lưu trước phát. Worker lease 2 phút, retry backoff <=1 giờ, dedupe eventKey. Delivery có thể at-least-once khi chết sau send; client refetch. PUSH_ENABLED=false: SENT chỉ biểu thị xử lý kênh in-app/socket, không chứng minh remote push.
