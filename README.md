<div align="center">

# PMQLTB

### Hệ thống quản lý thiết bị, linh kiện và vòng đời tài sản dành cho phòng IT

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react)](https://react.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs)](https://nestjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Một nền tảng thống nhất để quản lý tài sản IT từ lúc tiếp nhận vào kho, cấp phát và sử dụng đến kiểm kê, sửa chữa, thu hồi và thanh lý.

</div>

---

## Tổng quan

PMQLTB giúp phòng IT theo dõi chính xác thiết bị và linh kiện tại từng kho, bộ phận và người giữ. Hệ thống dùng chứng từ và giao dịch kho làm nguồn dữ liệu nghiệp vụ, có phân quyền chi tiết, nhật ký audit và các state machine bảo vệ luồng xử lý.

Giao diện hỗ trợ desktop, tablet và mobile; API có tài liệu Swagger; MongoDB chạy ở chế độ replica set để hỗ trợ transaction ngay trong môi trường phát triển.

## Chức năng chính

| Nhóm                   | Chức năng                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------- |
| **Tổng quan**          | KPI tài sản, phân bổ thiết bị, cảnh báo, xu hướng nhập/xuất và hoạt động gần đây      |
| **Thiết bị**           | Tạo/import tài sản vào kho trực tiếp, quản lý asset code, serial, model và vòng đời   |
| **Linh kiện**          | Quản lý theo số lượng hoặc serial; import Excel, tồn tối thiểu, loại và model độc lập |
| **Kho**                | Chọn kho tại chỗ, xem thiết bị thực tế trong kho, tồn linh kiện và lịch sử giao dịch  |
| **Nhập kho linh kiện** | Lập, hoàn tất và đảo phiếu nhập linh kiện/số dư đầu kỳ bằng transaction               |
| **Cấp phát**           | Giao thiết bị/linh kiện cho nhân sự hoặc bộ phận                                      |
| **Mượn / trả**         | Theo dõi hạn trả, trả từng phần, tình trạng nhận lại và lịch sử trả                   |
| **Điều chuyển**        | Điều chuyển giữa các kho với bước xuất, tiếp nhận và từ chối                          |
| **Thu hồi**            | Thu hồi tài sản đã cấp phát về kho và ghi nhận tình trạng thực tế                     |
| **Sửa chữa**           | Tiếp nhận, đang sửa, hoàn tất, không thể sửa và hướng xử lý sau sửa                   |
| **Kiểm kê**            | Snapshot số liệu, ghi nhận thực tế, phát hiện và xử lý chênh lệch                     |
| **Thanh lý**           | Lập phiếu, gửi duyệt, phê duyệt/từ chối và hoàn tất thanh lý                          |
| **Báo cáo**            | Báo cáo tài sản, tồn kho, giao dịch và xuất Excel                                     |
| **Nhân sự & danh mục** | Bộ phận, chức vụ, người giữ, kho, vị trí, nhà cung cấp, loại/model và đơn vị tính     |
| **Quản trị**           | Tài khoản, khóa/mở khóa, vai trò, permission, đặt lại mật khẩu và audit log           |
| **Thông báo**          | Chuông thông báo theo tài khoản, badge chưa đọc, đánh dấu đọc và trang tổng hợp       |

### Tiếp nhận thiết bị và import Excel

- Khi tạo thiết bị, người dùng chọn kho nhận. Backend ghi đồng thời hồ sơ thiết bị ở trạng thái `IN_STOCK`, giao dịch tài sản `INITIAL_RECEIPT` và audit log trong một MongoDB transaction.
- Thiết bị và linh kiện đều có luồng import hai bước: **xem trước** để kiểm tra dữ liệu, sau đó **xác nhận** mới ghi database.
- File mẫu Excel có sẵn trang dữ liệu và hướng dẫn. Hệ thống kiểm tra định dạng, danh mục tham chiếu, dữ liệu trùng, giới hạn dung lượng và số dòng trước khi import.
- Phiên import có thời hạn, chống commit lặp và hỗ trợ chính sách dừng hoặc bỏ qua dữ liệu trùng.
- Import thiết bị tạo lịch sử `AssetTransaction`; import linh kiện điều chỉnh tồn bằng `InventoryTransaction`, giúp truy vết đầy đủ thay vì sửa số dư trực tiếp.

| API                                | Quyền               | Mục đích                      |
| ---------------------------------- | ------------------- | ----------------------------- |
| `POST /api/devices/import/preview` | `devices.import`    | Kiểm tra trước file thiết bị  |
| `POST /api/devices/import/commit`  | `devices.import`    | Xác nhận import thiết bị      |
| `POST /api/parts/import/preview`   | `components.import` | Kiểm tra trước file linh kiện |
| `POST /api/parts/import/commit`    | `components.import` | Xác nhận import linh kiện     |

## Kiến trúc

```mermaid
flowchart LR
    U[Người dùng] --> W[Next.js 15 · React 19]
    W -->|Cookie session + CSRF| A[NestJS REST API]
    A --> V[Validation · Permission Guards]
    V --> S[Business Services]
    S --> M[(MongoDB Replica Set)]
    S --> T[Inventory & Asset Transactions]
    S --> L[Audit Logs]
```

```text
PMQuanLyThietBi/
├── apps/
│   ├── api/                 # NestJS API, schema, service và test
│   └── web/                 # Next.js App Router UI
├── docker/
│   ├── mongodb.yml          # MongoDB 7 replica set cho local development
│   └── init-replica-set.sh
├── .env.example
├── package.json             # npm workspaces
└── README.md
```

## Công nghệ

| Tầng     | Công nghệ                                                                         |
| -------- | --------------------------------------------------------------------------------- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Radix Slot, Lucide Icons, SheetJS |
| Backend  | NestJS 10, Mongoose 8, Swagger, class-validator, Jest                             |
| Database | MongoDB 7 replica set, transaction, optimistic concurrency, unique index          |
| Security | HttpOnly session cookie, CSRF, CORS allowlist, permission guards, scrypt          |
| Tooling  | npm workspaces, ESLint, Prettier, Docker Compose                                  |

## Cài đặt và chạy local

Yêu cầu Node.js **20 trở lên**, npm, Git và Docker Desktop.

```bash
git clone git@github.com:HoangPhiHungGG/phan_mem_quan_ly_thiet_bi.git
cd phan_mem_quan_ly_thiet_bi
npm install
cp .env.example .env
npm run db:up
npm run bootstrap:admin --workspace=@pmqltb/api
npm run dev
```

| Dịch vụ            | Địa chỉ                                  |
| ------------------ | ---------------------------------------- |
| Web                | <http://localhost:3000>                  |
| API                | <http://localhost:3001>                  |
| API Health         | <http://localhost:3001/api/health>       |
| Database Readiness | <http://localhost:3001/api/health/ready> |
| Swagger UI         | <http://localhost:3001/api/docs>         |

### Cấu hình môi trường

```env
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/pmqltb?replicaSet=rs0&directConnection=true
CORS_ORIGINS=http://localhost:3000
SESSION_TTL_HOURS=8
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Không commit `.env`, mật khẩu hoặc URI chứa credential. MongoDB local dùng replica set một node để transaction hoạt động; `npm run db:stop` dừng container nhưng giữ nguyên volume dữ liệu.

## Tạo quản trị viên đầu tiên

Các giá trị được đọc từ biến môi trường và không hard-code trong source:

```bash
export BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
export BOOTSTRAP_ADMIN_DISPLAY_NAME="Quản trị viên"
export BOOTSTRAP_ADMIN_EMPLOYEE_CODE="ADMIN001"
read -s BOOTSTRAP_ADMIN_PASSWORD
export BOOTSTRAP_ADMIN_PASSWORD
npm run bootstrap:admin --workspace=@pmqltb/api
unset BOOTSTRAP_ADMIN_PASSWORD
```

Bootstrap có khóa one-time và từ chối chạy nếu hệ thống đã có tài khoản.

## Bảo mật

- Token phiên ngẫu nhiên nằm trong cookie `HttpOnly`; database chỉ lưu hash SHA-256.
- Cookie dùng `SameSite=Lax` và tự bật `Secure` trong production.
- Request thay đổi dữ liệu phải vượt qua kiểm tra CSRF và origin.
- API whitelist DTO và từ chối field không khai báo.
- Backend kiểm tra quyền ở từng chức năng, độc lập với việc ẩn nút trên UI.
- Khóa tài khoản hoặc thay đổi quyền sẽ thu hồi các phiên liên quan.
- Mật khẩu được băm bằng `scrypt` với salt ngẫu nhiên.
- Đăng nhập sai được giới hạn theo cặp IP và email.

## Tính nhất quán nghiệp vụ

```mermaid
flowchart LR
    D[Chứng từ nghiệp vụ] --> C{Kiểm tra trạng thái và quyền}
    C -->|Hợp lệ| X[MongoDB Transaction]
    X --> B[Inventory Balance]
    X --> I[Inventory Transaction]
    X --> A[Audit Log]
    C -->|Không hợp lệ| E[HTTP 400 / 409]
```

- Snapshot kiểm kê giữ nguyên số liệu tại thời điểm bắt đầu.
- Chênh lệch kiểm kê không tự sửa dữ liệu gốc khi chưa được xử lý.
- Thiết bị mới được đưa thẳng vào kho đã chọn và có giao dịch `INITIAL_RECEIPT`; không cần lập thêm phiếu nhập thiết bị.
- Thiết bị chỉ được tính là trong kho khi có trạng thái `IN_STOCK`, có `warehouseId` và không có người giữ.
- Linh kiện theo serial yêu cầu số lượng khớp với số serial hợp lệ.
- Model thiết bị và model linh kiện được phân tách bằng `entityType`.
- Các thao tác quan trọng dùng transaction hoặc optimistic concurrency.

## Kiểm thử và chất lượng

```bash
npm run lint
npm run typecheck
npm run test
npm run build

# E2E API với MongoDB local đang chạy
npm run test:e2e
```

Các integration test có transaction cần MongoDB replica set hoạt động. Chạy `npm run db:up` trước khi chạy.

## Migration dữ liệu

Các lệnh migration mặc định chạy ở chế độ **dry-run** để chỉ thống kê dữ liệu. Thêm `--apply` sau khi đã kiểm tra kết quả.

```bash
# Chuẩn hóa mã hiển thị của danh mục và nhân sự
npm run migrate:display-codes --workspace=@pmqltb/api
npm run migrate:display-codes --workspace=@pmqltb/api -- --apply

# Đưa thiết bị cũ chưa có kho vào kho có tên chính xác "Kho IT"
npm run migrate:unwarehoused-devices --workspace=@pmqltb/api
npm run migrate:unwarehoused-devices --workspace=@pmqltb/api -- --apply
```

Migration thiết bị chỉ xử lý tài sản đang hoạt động, có trạng thái `NOT_RECEIVED` và chưa có kho. Mỗi thiết bị được cập nhật trong transaction riêng, giữ nguyên `_id`, tạo `AssetTransaction` nguồn `LEGACY_MIGRATION` và có thể chạy lại an toàn. Lệnh sẽ dừng nếu không tìm thấy hoặc có nhiều kho cùng tên `Kho IT`.

## Lệnh thường dùng

| Lệnh                                                           | Mục đích                                 |
| -------------------------------------------------------------- | ---------------------------------------- |
| `npm run dev`                                                  | Chạy đồng thời API và Web                |
| `npm run dev:api`                                              | Chỉ chạy NestJS API                      |
| `npm run dev:web`                                              | Chỉ chạy Next.js Web                     |
| `npm run build`                                                | Build toàn bộ workspace                  |
| `npm run lint`                                                 | Kiểm tra ESLint                          |
| `npm run typecheck`                                            | Kiểm tra TypeScript                      |
| `npm run test`                                                 | Chạy test hiện có                        |
| `npm run test:e2e`                                             | Chạy E2E API                             |
| `npm run db:up`                                                | Khởi động MongoDB và replica set         |
| `npm run db:stop`                                              | Dừng MongoDB, giữ dữ liệu                |
| `npm run db:logs`                                              | Xem log MongoDB                          |
| `npm run migrate:display-codes --workspace=@pmqltb/api`        | Xem trước migration mã hiển thị          |
| `npm run migrate:unwarehoused-devices --workspace=@pmqltb/api` | Xem trước migration thiết bị chưa có kho |

## Khôi phục mật khẩu quản trị ở local

```bash
export RESET_PASSWORD_EMAIL="admin@example.com"
read -s RESET_PASSWORD_NEW_PASSWORD
export RESET_PASSWORD_NEW_PASSWORD
npm run reset-password:local --workspace=@pmqltb/api
unset RESET_PASSWORD_NEW_PASSWORD
```

Lệnh không in mật khẩu, cập nhật password hash và thu hồi phiên cũ của tài khoản.

## Nguyên tắc dữ liệu

- Không reset hoặc xóa MongoDB để sửa lỗi nghiệp vụ.
- Không bypass transaction/audit khi điều chỉnh tồn kho.
- Không dùng AuditLog thay cho Notification.
- Không lưu token hoặc mật khẩu trong source, README hay lịch sử Git.
- Mã hiển thị dùng định dạng ngắn, dễ đọc và được sinh tập trung; mã tài sản, serial và mã phiếu vẫn là định danh nghiệp vụ.

---

<div align="center">

**PMQLTB · Quản lý tài sản IT rõ ràng, có kiểm soát và truy vết được**

</div>
