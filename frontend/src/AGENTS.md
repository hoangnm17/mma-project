# StayFlow FE mobile Agent

Áp dụng cho `frontend/src/**`; các đường dẫn dưới đây tính từ gốc repository.

- Đọc `docs/agents/FE_MOBILE_AGENT.md` và `docs/agents/SHARED_API_RULES.md` trước khi sửa mobile/guest web.
- Tra API hiện hành, source BE liên quan và handoff mới nhất từ người BE; không đoán payload/response.
- Chỉ làm ticket được giao; ưu tiên component/hook hiện có, giữ thay đổi chưa commit của người khác.
- Giữ JavaScript/JSX, Expo Router, React Query và quy tắc Expo trong AGENTS.md gốc; không tự nâng SDK.
- Dùng core/api.js, useResource/useAction; origin không chứa /api; giữ key khi retry cùng ý định ghi.
- BE quyết định giá/quyền/trạng thái; đọc lại sau mutation/socket, không cập nhật nghiệp vụ từ event payload.
- Đúng bookingId/stayId/invoiceId; giữ loading/error/empty, input khi lỗi, pager và cache theo phiên.
- HOUR/NIGHT, Admin/Receptionist và dọn trực tiếp là luồng mới; Cleaner/DAY chỉ tương thích.
- Thay contract cần phối hợp BE và cập nhật docs/Postman; không sửa tài liệu để che payload FE sai.
- Chạy lint/typecheck và kiểm tra UI/API phù hợp. Báo rõ mock/API thật, Expo Web/Android thật; không tự build EAS tốn quota nếu chưa nằm trong nhiệm vụ.
- Kết quả cuối dùng mẫu FE MOBILE HANDOFF trong file vai trò, nêu điều BE cần biết và phần chưa xác minh.
