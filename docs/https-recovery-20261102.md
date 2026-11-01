# Khôi phục HTTPS — 02/11/2026

## Kết quả đối chiếu log server

API `deploy-api-1` healthy, migration 003 hoàn tất. HTTP trả 308 từ Caddy,
nhưng bắt tay HTTPS bị TLS alert internal error. Caddy ghi HTTP 429 từ Let's Encrypt:
đã cấp 5 chứng chỉ cho cùng bộ hostname trong 168 giờ; retry-after mới nhất trong
log được cung cấp là 2026-11-02 11:24:17 UTC (18:24:17 Việt Nam).

Caddy hiện gắn `deploy_caddy-data` vào `/data`, trong khi volume cũ
`stayflow_caddy-data` vẫn còn trên server. Đọc chứng chỉ công khai trong volume cũ
đã xác nhận CN `3.26.69.81.sslip.io`, issuer Let's Encrypt YE1, còn hạn đến
28/01/2027 14:57:10 UTC. Có thể khôi phục bộ chứng chỉ này vào volume hiện tại;
không cần cấp lại chứng chỉ, không thay đổi volume MongoDB.

## Phục hồi trường hợp đã xác minh trên server này

Chạy tại thư mục dự án trên Linux. Kiểm tra tên volume trước khi dùng cho server
khác. Không in hay tải khóa riêng ra chat. Lệnh sao lưu thư mục chứng chỉ đích
nếu đang tồn tại, giữ nguyên volume nguồn và khởi động lại riêng Caddy:

```sh
docker run --rm --network none --entrypoint sh \
  -v stayflow_caddy-data:/old:ro -v deploy_caddy-data:/new \
  caddy:2-alpine -ec '
cert_source=/old/caddy/certificates/acme-v02.api.letsencrypt.org-directory/3.26.69.81.sslip.io
cert_parent=/new/caddy/certificates/acme-v02.api.letsencrypt.org-directory
cert_target="$cert_parent/3.26.69.81.sslip.io"
test -s "$cert_source/3.26.69.81.sslip.io.crt"
test -s "$cert_source/3.26.69.81.sslip.io.key"
mkdir -p "$cert_parent"
if [ -d "$cert_target" ]; then cp -a "$cert_target" "/new/tls-backup-$(date +%Y%m%d%H%M%S)"; fi
cp -a "$cert_source" "$cert_parent/"
echo "Da khoi phuc chung chi cu"
' && docker compose -p deploy --env-file deploy/.env -f deploy/compose.yaml restart caddy
curl --fail --show-error https://3.26.69.81.sslip.io/health
```

Thành công phải trả `{"status":"ok"}` với xác minh TLS bình thường.
Nếu không thành công, xem log Caddy mới; không chuyển app sang bỏ kiểm tra TLS,
không dùng chứng chỉ staging cho ứng dụng thực, không xóa volume để thử cấp lại.

## Giữ cấu hình qua các lần build

- ZIP build/deploy mới đặt Compose cloud ở `compose.yaml` gốc như gói deploy cũ;
  bản local nằm ở `compose.local.yaml`. Repository phát triển giữ nguyên Compose local.
- Project deploy vẫn là `deploy`; giữ các volume `deploy_caddy-data`,
  `deploy_caddy-config`, `deploy_mongo-data`, `deploy_mongo-config` đã dùng.
- Dùng `docker compose up -d --build` sau khi giải nén ZIP mới. Không cần `down`
  trước khi cập nhật; không dùng `down -v`, `volume prune`, hay đổi project để sửa lỗi.
- Bảo toàn `deploy/.env` hiện có; ZIP không chứa file env thật, chứng chỉ hoặc khóa riêng.
- API khỏe và chứng chỉ hợp lệ là hai kiểm tra riêng. Docker build thành công
  không chứng minh HTTPS đã hoạt động.

Nguồn: [Let's Encrypt — exact-set rate limit](https://letsencrypt.org/docs/rate-limits/#new-certificates-per-exact-set-of-identifiers),
[Caddy — lưu trữ HTTPS](https://caddyserver.com/docs/automatic-https#storage),
[Docker — vòng đời volume](https://docs.docker.com/reference/compose-file/volumes/).

## BE / FE HANDOFF

Contract HTTP, API origin, frontend và schema không đổi trong lượt khắc phục TLS.
Không đổi secret, không deploy hay đọc khóa trên server từ máy phát triển.
Người dùng thực hiện lệnh phục hồi tại server; kết quả public health được kiểm tra
riêng sau thao tác. Gói ZIP mới được kiểm tra CRC, SHA256 và mapping Compose mặc định;
Docker daemon local không hoạt động nên không coi kiểm tra cấu hình là deploy thành công.
