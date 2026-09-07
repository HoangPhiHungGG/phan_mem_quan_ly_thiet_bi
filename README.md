# PMQLTB

Nền tảng quản lý thiết bị điện tử và linh kiện cho Phòng IT. Hiện đã có nền tảng, xác thực bằng cookie session, phân quyền, dữ liệu nền, hồ sơ thiết bị và linh kiện; các nghiệp vụ làm thay đổi tồn kho vẫn chưa triển khai.

## Yêu cầu trên macOS

- Node.js 20 trở lên và npm.
- Git.
- Docker Desktop đúng kiến trúc máy: Apple Silicon cho `arm64`, Intel cho `x86_64`.

Kiểm tra bằng:

```bash
uname -m
node --version
npm --version
git --version
docker --version
docker compose version
docker info
```

Nếu thiếu Docker, tải Docker Desktop từ trang Docker, chọn đúng Apple Silicon hoặc Intel. Không cần dùng `sudo` để chạy dự án.

## Chạy từ đầu

```bash
cp .env.example .env
npm install
npm run db:up
npm run bootstrap:admin --workspace=@pmqltb/api
npm run dev
```

- Web: <http://localhost:3000>
- API health: <http://localhost:3001/api/health>
- Database readiness: <http://localhost:3001/api/health/ready>
- Swagger: <http://localhost:3001/api/docs>

## Phạm vi đã có

- Danh mục: bộ phận, kho, vị trí, người giữ (không bắt buộc có tài khoản), nhà cung cấp, loại thiết bị, đơn vị tính và mã hàng/model.
- Thiết bị: danh sách, tìm kiếm/lọc/phân trang, hồ sơ, tệp đính kèm và các trường kỹ thuật/mua/bảo hành.
- Linh kiện: quản lý theo số lượng hoặc theo serial; tồn kho khởi tạo bằng 0.
- Không có màn hình/API sửa trực tiếp tồn kho, người giữ, kho/vị trí hoặc trạng thái sử dụng. Các thay đổi này sẽ đi qua nhập số dư đầu kỳ và các chứng từ ở bước sau.

## Tạo quản trị viên đầu tiên

Chỉ chạy khi database chưa có tài khoản. Giá trị được đọc từ biến môi trường, không hardcode trong source. Tránh ghi mật khẩu vào command history:

```bash
export BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
export BOOTSTRAP_ADMIN_DISPLAY_NAME="Quản trị viên"
export BOOTSTRAP_ADMIN_EMPLOYEE_CODE="ADMIN001"
read -s BOOTSTRAP_ADMIN_PASSWORD
export BOOTSTRAP_ADMIN_PASSWORD
npm run bootstrap:admin --workspace=@pmqltb/api
unset BOOTSTRAP_ADMIN_PASSWORD
```

Quy trình có khóa one-time và từ chối nếu đã có tài khoản. Mật khẩu tối thiểu 12 ký tự và được băm bằng `scrypt` với salt ngẫu nhiên.

## Khôi phục mật khẩu quản trị cục bộ

Chỉ dùng trên máy phát triển có quyền truy cập thư mục dự án. Lệnh không in mật khẩu, đặt hash mới và thu hồi mọi phiên đang đăng nhập của tài khoản:

```bash
export RESET_PASSWORD_EMAIL="admin@pmqltb.local"
read -s RESET_PASSWORD_NEW_PASSWORD
export RESET_PASSWORD_NEW_PASSWORD
npm run reset-password:local --workspace=@pmqltb/api
unset RESET_PASSWORD_NEW_PASSWORD
```

## Cơ chế phiên và CSRF

- Token phiên opaque ngẫu nhiên nằm trong cookie `HttpOnly`; database chỉ lưu SHA-256 của token.
- Không lưu token nhạy cảm trong `localStorage`.
- Cookie dùng `SameSite=Lax`, `Secure` ở production và CORS credentials với origin allowlist.
- Request thay đổi dữ liệu phải có CSRF token khớp cookie/header và Origin hợp lệ.
- Khóa/vô hiệu hóa tài khoản hoặc thay đổi quyền sẽ thu hồi mọi phiên của tài khoản.
- Đăng nhập sai bị giới hạn 5 lần trong 15 phút trên mỗi cặp IP/email ở một API instance.

## Kiểm thử xác thực & phân quyền (E2E)

Bộ test E2E (`apps/api/test/auth.e2e-spec.ts`) chạy thật qua HTTP và MongoDB local phủ các kịch bản bắt buộc:

| #   | Kịch bản               | Kết quả mong đợi                              |
| --- | ---------------------- | --------------------------------------------- |
| 1   | Không đăng nhập        | 401 `AUTH_REQUIRED`                           |
| 2   | Sai mật khẩu           | 401 `INVALID_CREDENTIALS`, không tạo phiên    |
| 3   | Đăng nhập đúng         | 200, cookie HttpOnly + CSRF                   |
| 4   | Đăng xuất              | Thu hồi phiên; phiên cũ trả 401               |
| 5   | Hết phiên (TTL)        | 401                                           |
| 6   | Tài khoản bị khóa      | Không đăng nhập được (403)                    |
| 7   | Khóa tài khoản         | Thu hồi mọi phiên đang hoạt động              |
| 8   | Truy cập trái quyền    | 403 `PERMISSION_DENIED`                       |
| 9   | Thay ID xem người khác | Không lộ dữ liệu (404), quản trị vẫn đọc được |

Yêu cầu: database local đang chạy (`npm run db:up`). Chạy:

```bash
npm run test:e2e
```

Unit test nhanh (không cần database):

```bash
npm run test --workspace=@pmqltb/api
```

MongoDB local dùng replica set một node để backend chạy trực tiếp trên Mac vẫn sử dụng transaction. `npm run db:stop` chỉ dừng container, không xóa volume. Chỉ `docker compose down -v` mới xóa dữ liệu và không thuộc luồng chạy thông thường.

## Các lệnh

```bash
npm run dev
npm run dev:web
npm run dev:api
npm run build
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run typecheck
npm run test
npm run test:e2e
npm run db:up
npm run db:stop
npm run db:logs
```

Không commit `.env` hoặc `atlas-credentials.env`. Nếu dùng Atlas, đặt URI đã URL-encode trong `MONGODB_URI`; không ghi credential vào source hoặc tài liệu.
