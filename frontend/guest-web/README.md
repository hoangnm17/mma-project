# Form khách

Form React Native/Expo Web JavaScript được chia sẻ trực tiếp tại `src/app/guest.jsx`, không tạo bản sao ứng dụng. Route `/guest#token=...` đổi token ngẫu nhiên lấy guest session và xóa token khỏi URL. Khách không cần tài khoản.

Chạy từ thư mục app: `npm run web`. Triển khai static export `npm run export:web` lên hosting HTTPS, cấu hình fallback về `guest.html` cho `/guest` nếu hosting yêu cầu. `GUEST_WEB_URL` backend phải trỏ tới URL HTTPS thật. `EXPO_PUBLIC_API_URL` được đóng gói khi export; CORS phải có origin của form.
