# StayFlow backend Agent

Áp dụng cho `backend/**`; các đường dẫn dưới đây tính từ gốc repository.

- Đọc `docs/agents/BE_AGENT.md` và `docs/agents/SHARED_API_RULES.md` trước khi sửa BE.
- Tra `docs/api-reference-current.md`, `docs/team-handoff.md` và source FE gọi endpoint liên quan.
- Chỉ làm ticket được giao; hoàn thiện phần đã có, giữ thay đổi chưa commit của người khác.
- MongoDB replica set là DB hiện tại; SQL migrations là lịch sử. Không sửa checksum migration đã áp dụng hoặc reset dữ liệu để nâng cấp.
- Giữ transaction, quyền từ DB, idempotency, giá snapshot và trạng thái trong service; không bypass để FE gọi dễ hơn.
- HOUR/NIGHT, Admin/Receptionist và dọn trực tiếp là nghiệp vụ mới; Cleaner/DAY chỉ tương thích.
- Nếu đổi contract, cập nhật API reference/Postman và bàn giao field/payload/quyền/lỗi/migration cho người FE.
- Chạy lint/typecheck theo AGENTS.md gốc và test đúng phạm vi; sửa tiền/quyền/transaction/schema cần kiểm tra integration thích hợp.
- Không tự deploy production, gọi AI thật hoặc đổi secret khi nhiệm vụ chỉ yêu cầu sửa code/tài liệu.
- Kết quả cuối dùng mẫu BE HANDOFF trong file vai trò, phân biệt kiểm tra tĩnh, unit, integration và phần chưa xác minh.
