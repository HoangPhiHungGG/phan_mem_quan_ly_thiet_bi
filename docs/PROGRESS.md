# Tiến độ

## Bước 6

- [x] Cấp phát, mượn/trả, điều chuyển và thu hồi có chứng từ, dòng thiết bị/linh kiện, người giao/nhận, bộ phận, kho/vị trí, tình trạng, ngày và lý do.
- [x] Giao dịch MongoDB cập nhật chứng từ, trạng thái thiết bị, số dư và lịch sử tồn cùng nhau; điều kiện cập nhật nguyên tử ngăn giao trùng tài sản hoặc xuất vượt số dư.
- [x] Mượn có hạn trả, nhận trả một phần và danh sách quá hạn. Linh kiện/vật tư xuất theo số lượng không tạo nghĩa vụ trả tự động.
- [x] Điều chuyển hai bước: xuất sang `IN_TRANSIT`, nhận ở kho đích hoặc từ chối để hoàn nguyên kho nguồn.
- [x] Thu hồi đưa thiết bị về kho/vị trí; thiết bị hỏng chuyển `REPAIRING`.
- [x] Biên bản bàn giao để in, menu theo quyền và dashboard cá nhân thiết bị/khoản mượn.
- [!] MVP chưa có bước duyệt/giữ chỗ riêng; tồn khả dụng hiện bằng tồn thực tế và được kiểm tra tại thời điểm hoàn tất giao dịch.

## Bước 0

- [x] npm workspaces và lockfile gốc.
- [x] Next.js, TypeScript, Tailwind CSS và cấu hình shadcn/ui.
- [x] NestJS, Mongoose, Swagger, validation và CORS.
- [x] MongoDB replica set một node, volume, healthcheck và init idempotent.
- [x] Health, readiness và transaction commit/rollback.
- [x] Layout quản trị tiếng Việt responsive và trạng thái kết nối thật.
- [x] Build, lint, format và typecheck.
- [x] Tài liệu chạy, brief và kiến trúc.

## Xác minh ngày 04/09/2026

- macOS 15.1, Apple Silicon `arm64`; Node 24.15.0 và npm 11.12.1.
- Docker daemon 27.5.1 (`aarch64`), Compose 2.32.4; MongoDB healthy.
- `db:up` chạy lặp lại và giữ nguyên replica set `rs0`.
- API health/readiness và Swagger trả HTTP 200 với MongoDB local.
- Transaction commit và rollback thành công; collection thử còn 0 document sau khi dọn.
- Frontend dev trả HTTP 200.
- `lint`, `format:check`, `typecheck` và production build thành công.

## Bước 3

- [x] Cookie session HttpOnly, CSRF và Origin validation.
- [x] Đăng nhập, đăng xuất và thông tin tài khoản FE/BE.
- [x] Băm mật khẩu bằng scrypt và giới hạn đăng nhập sai.
- [x] Tài khoản, vai trò, phạm vi bộ phận/kho và object-level access.
- [x] Thu hồi phiên khi khóa tài khoản hoặc thay đổi quyền.
- [x] Bootstrap quản trị viên đầu tiên one-time, không hardcode mật khẩu.
- [x] Audit đăng nhập, đăng xuất, tài khoản và thay đổi quyền.
- [x] Swagger và README xác thực.
- [x] E2E: không đăng nhập, sai mật khẩu, hết phiên, đăng xuất, bị khóa, trái quyền, thay ID (IDOR).

## Bước 4

- [x] Danh mục: bộ phận, kho, vị trí, người giữ không cần tài khoản, nhà cung cấp, loại thiết bị, đơn vị tính và mã hàng/model.
- [x] Danh sách, tìm kiếm, lọc, phân trang, thêm/sửa, ngừng sử dụng và xóa có kiểm tra tham chiếu cho danh mục.
- [x] Hồ sơ thiết bị: mã tài sản, serial tùy chọn, model, giá/ngày mua, bảo hành, tình trạng kỹ thuật, trạng thái sử dụng, kho/vị trí, bộ phận, người giữ và tệp đính kèm.
- [x] Linh kiện quản lý theo số lượng hoặc theo serial; tồn kho khởi tạo luôn bằng 0 và không có API sửa tồn trực tiếp.
- [x] Validation tham chiếu đang hoạt động, unique index, kiểm tra model–loại thiết bị và kho–vị trí, phân quyền API và audit log.
- [x] FE responsive có trạng thái tải/rỗng/lỗi; menu và nút tạo/sửa theo quyền.
- [x] `lint`, `typecheck`, `format:check`, `build`, web `GET /`, API health/readiness đều đạt ngày 04/09/2026.

## Chưa triển khai

- Mua sắm, cấp phát, mượn/trả, điều chuyển, thu hồi, sửa chữa, kiểm kê, thanh lý và báo cáo.

## Bước 5

- [x] Phiếu nhập kho/số dư đầu kỳ nhiều dòng, có mã phiếu duy nhất, kho, nguồn, ngày, người tạo, tệp đính kèm và lý do/nguồn dữ liệu đầu kỳ.
- [x] Luồng nháp → gửi duyệt → duyệt (nếu yêu cầu) → hoàn tất; nháp/chờ duyệt không thay đổi tồn.
- [x] Hoàn tất trong MongoDB transaction: tạo thiết bị, serial linh kiện, giao dịch kho, số dư theo kho và tổng tồn cũ tương thích.
- [x] Idempotency-Key cho tạo nháp; khóa trùng cùng nội dung trả phiếu cũ, khác nội dung trả xung đột.
- [x] Kiểm tra trùng mã tài sản/serial, serial theo số lượng, tham chiếu kho/linh kiện và cạnh tranh cập nhật.
- [x] Trang Nhập kho, chi tiết phiếu, tồn linh kiện theo kho và lịch sử giao dịch kho.
- [ ] Đảo phiếu: chưa mở API để tránh đảo sai khi tài sản/hàng đã được dịch chuyển; sẽ thực hiện cùng nghiệp vụ xuất/thu hồi.
