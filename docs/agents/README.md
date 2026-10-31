# Dùng tài liệu StayFlow với Agent

Bộ tài liệu này dành cho **hai người phát triển trên hai checkout/nhánh của cùng dự án**: một người BE, một người FE mobile. Source đã chia `backend/` và `frontend/`, tài liệu chung trong `docs/`. Mở gốc repository để Agent thấy cả ba thư mục; chỉ làm việc trong phần phụ trách. Không tự tạo Agent hay chạy toàn bộ backlog khi chỉ đọc các file này.

## Người làm BE

Mở repository trong công cụ có Agent, gửi nội dung sau và thay phần trong ngoặc bằng việc thực tế:

```text
Bạn phụ trách BE của StayFlow. Đọc AGENTS.md ở gốc repository,
backend/AGENTS.md, docs/agents/BE_AGENT.md và
docs/agents/SHARED_API_RULES.md trước khi làm.
Tra contract tại docs/api-reference-current.md và đối chiếu source liên quan.
Nhiệm vụ lần này: [mô tả ticket BE cần thực hiện].
Giữ khả năng kết nối với FE mobile; khi hoàn tất, bàn giao request/response,
thay đổi contract, dữ liệu test và kết quả kiểm tra theo mẫu trong BE_AGENT.md.
```

## Người làm FE mobile

```text
Bạn phụ trách FE mobile của StayFlow. Đọc AGENTS.md ở gốc repository,
frontend/AGENTS.md, frontend/src/AGENTS.md, docs/agents/FE_MOBILE_AGENT.md và
docs/agents/SHARED_API_RULES.md trước khi làm.
Tra contract tại docs/api-reference-current.md và đối chiếu source liên quan.
Nhiệm vụ lần này: [mô tả ticket màn hình/luồng cần thực hiện].
Giữ khả năng kết nối với BE hiện có; khi hoàn tất, bàn giao mapping màn hình–API,
payload thực gửi, tình huống lỗi và kết quả kiểm tra theo mẫu trong FE_MOBILE_AGENT.md.
```

Không cần đổi tên hai file vai trò thành AGENTS.md. Các file `AGENTS.md` theo thư mục đã trỏ tới đúng hướng dẫn. Công cụ không tự nạp AGENTS.md thì đính kèm file vai trò, file quy tắc chung và tài liệu API vào chat của Agent.

## Các file cần có trong checkout của cả hai người

- [BE_AGENT.md](BE_AGENT.md): bối cảnh, phạm vi BE, thứ tự đọc source, checklist và mẫu bàn giao.
- [FE_MOBILE_AGENT.md](FE_MOBILE_AGENT.md): bối cảnh, phạm vi mobile, cách nối API, checklist và mẫu bàn giao.
- [SHARED_API_RULES.md](SHARED_API_RULES.md): quy tắc mà cả hai Agent phải giữ.
- [team-handoff.md](../team-handoff.md): phân việc M0–M7, các ID và luồng nghiệp vụ xuyên suốt.
- [api-reference-current.md](../api-reference-current.md): 90 HTTP endpoint trong snapshot source ngày 31/10/2026.
- [stayflow-team.postman_collection.json](../stayflow-team.postman_collection.json): request template, tự điền origin/tài khoản/ID/key của môi trường test.

## Khi gửi gói ZIP

Gói `StayFlow-Agent-Handoff-20261031.zip` chỉ chứa tài liệu và quy tắc Agent, **không chứa source dự án, dependency hoặc cấu hình bí mật**. Người nhận cần checkout source có cấu trúc backend/frontend cùng baseline, rồi giải nén ở gốc repository để giữ đúng đường dẫn. Đối chiếu các file AGENTS.md đang có trước khi chép đè nếu nhánh nhận đã có hướng dẫn riêng.

Nếu Agent chỉ được cung cấp tài liệu mà chưa có source, Agent có thể hiểu kiến trúc/contract và đề xuất việc; không được báo đã xác minh hoặc sửa code thực tế. Nếu backend/mobile bị tách thành hai repository riêng, cần mang theo docs và chỉnh lại đường dẫn tham chiếu tương ứng.

## Quy trình giữa hai người

1. Cùng chốt baseline source và môi trường test. Tài liệu này là snapshot, không chứng minh server/APK đang chạy cùng version.
2. Mỗi người giao một ticket cụ thể cho Agent đúng vai trò. Agent kiểm tra phần đã có để sửa/hoàn thiện, không dựng lại dự án.
3. Người làm BE gửi ghi chú bàn giao theo mẫu cho người làm FE; người làm FE đưa ghi chú đó cho Agent mobile và gửi lại kết quả ghép. Các file trên đĩa không tự đồng bộ hoặc gửi thông tin giữa hai Agent.
4. Khi đổi API, cập nhật contract và Postman cùng thay đổi; cùng chạy một luồng trên API thật trước khi đóng ticket.
