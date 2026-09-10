# Cấp phát — cập nhật và kiểm thử

## Phạm vi

Màn hình Cấp phát dùng `apps/web/components/operations/issue-page.tsx`, được gọi từ `operation-page.tsx`. Các màn hình Mượn/trả, Điều chuyển, Thu hồi tiếp tục dùng giao diện hiện có.

- Form nhiều dòng thiết bị/linh kiện; lọc theo kho đang hoạt động, tự điền bộ phận từ người nhận.
- Lưu phiếu chưa hoàn tất, không thay đổi thiết bị/tồn kho; xem, sửa, xóa có xác nhận.
- Hoàn tất có xác nhận; backend kiểm tra lại dữ liệu và cập nhật thiết bị, linh kiện, phiếu trong MongoDB transaction.
- Kiểm tra tổng số lượng khi một linh kiện xuất hiện nhiều dòng; không chọn trùng thiết bị.
- Khóa sửa/xóa/hoàn tất lại ở cả FE và BE.
- In từ GET chi tiết của đúng phiếu, có serial, đơn vị, tình trạng, ghi chú và khu vực ký. Escape dữ liệu trước khi ghi HTML vào cửa sổ in.
- Khi cấp linh kiện có bản ghi serial trong kho, hệ thống chọn serial còn tồn theo thứ tự serial, chuyển sang ISSUED và lưu serial đã cấp vào dòng phiếu trong cùng transaction.

## API

Giữ convention và controller hiện có, không tạo API trùng:

| Method | Endpoint                       | Hành vi                                                                 |
| ------ | ------------------------------ | ----------------------------------------------------------------------- |
| POST   | `/api/operations`              | `type=ISSUE`: mã tự sinh, trạng thái PENDING, lưu ghi chú và nhiều dòng |
| GET    | `/api/operations?type=ISSUE`   | Danh sách phân trang, đủ thông tin người nhận/bộ phận/kho               |
| GET    | `/api/operations/:id`          | Chi tiết và thông tin người tạo/hoàn tất, dùng cho in                   |
| PATCH  | `/api/operations/:id`          | Chỉ sửa ISSUE chưa hoàn tất; mã và loại phiếu không thay đổi            |
| DELETE | `/api/operations/:id`          | Chỉ xóa ISSUE chưa hoàn tất                                             |
| PATCH  | `/api/operations/:id/complete` | Transaction cập nhật thiết bị, tồn kho, serial và trạng thái            |

Các endpoint vẫn dùng quyền `operations.read` / `operations.manage` sẵn có.

## Dữ liệu

- `OperationDocument`: thêm PENDING, `note`, `completedAt`, `completedBy`, `updatedBy`, `closedAt`.
- `OperationLine`: thêm `serials` để lưu serial linh kiện thực tế đã cấp.
- Collection mới `operation_counters`: bộ đếm nguyên tử theo ngày, khởi tạo theo mã đã tồn tại; tránh trùng khi tạo đồng thời và không tái sử dụng số đã cấp sau khi xóa.
- Collection `operations`, `devices`, `inventory_balances`, `inventory_transactions`, `part_serials` tiếp tục được sử dụng.
- Giữ DRAFT cho các nghiệp vụ khác và dữ liệu cũ. ISSUE cũ có DRAFT được hiển thị là Chưa hoàn tất; sửa chuyển thành PENDING, hoàn tất chuyển thành COMPLETED.
- Không cần migration phá vỡ dữ liệu; không chỉnh dữ liệu nghiệp vụ hiện có trong lúc kiểm thử.

## Kiểm thử API với database thật

Cần MongoDB replica set cục bộ. Chạy từ thư mục gốc:

```sh
ISSUE_TEST_MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true' npm run test --workspace=@pmqltb/api -- --runInBand operation.integration.spec.ts
```

Bộ test tự tạo database `pmqltb_issue_test_<ObjectId>` và xóa database đó khi kết thúc; không dùng database ứng dụng. Đây là kiểm thử controller/DTO/service/MongoDB thật, xác thực được kiểm thử riêng bởi bộ test auth hiện có.

15 ca kiểm thử bao gồm CRUD, nhiều thiết bị, thiết bị + linh kiện, lưu/xem lại, hoàn tất và metadata, khóa phiếu hoàn tất, cấp trùng, thiếu tồn sau khi lưu, validation, tổng số lượng linh kiện, mã không trùng khi tạo đồng thời, hoàn tất đồng thời, dữ liệu DRAFT cũ và serial. Ca rollback tạo lỗi ràng buộc database sau khi đã ghi thiết bị và tồn kho, rồi kiểm tra toàn bộ thay đổi được rollback.

Bộ test này bỏ qua nếu không truyền `ISSUE_TEST_MONGODB_URI`.

## Kiểm tra dự án

```sh
npm run typecheck
npm run lint
npm run build
npm run test --workspace=@pmqltb/api -- --runInBand
```

## Kiểm thử giao diện và in

```sh
npm run build --workspace=@pmqltb/api
node scripts/test-issue-browser.cjs
```

Chạy từ thư mục gốc, cần Chrome và MongoDB replica set cục bộ. Mặc định dùng Chrome trên macOS; có thể đặt `CHROME_BINARY` cho đường dẫn khác. Các cổng 3100, 3101, 9227 phải trống. Script tự mở FE/API kiểm thử, tạo người dùng và dữ liệu trên database `pmqltb_issue_browser_<ObjectId>`, chạy Chrome headless rồi đóng các tiến trình và xóa database tạm. Không đăng nhập vào tài khoản thật.

Kiểm tra: tạo phiếu thiết bị + linh kiện; tự điền bộ phận; xem chi tiết; sửa và thêm thiết bị; xóa có xác nhận/hủy; hoàn tất có xác nhận/hủy; đối chiếu thiết bị và tồn kho; khóa các nút trên phiếu hoàn tất; kiểm tra nội dung/escape HTML của cửa sổ in; render PDF thật; reload giữ đúng trạng thái. PDF kiểm thử nằm ở `/private/tmp/issue-print-check.pdf`.

## Các file liên quan

| Nhóm          | File                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| FE            | `apps/web/components/operations/issue-page.tsx` (mới), `operation-page.tsx`                                       |
| FE dùng chung | `apps/web/components/ui/dialog.tsx`, `apps/web/lib/api.ts`, `apps/web/lib/catalogs.ts`                            |
| BE            | `apps/api/src/operations/operation.service.ts`, `operation.dto.ts`, `operation.schemas.ts`, `operation.module.ts` |
| Kiểm thử      | `apps/api/src/operations/operation.integration.spec.ts`, `scripts/test-issue-browser.cjs`                         |

Kết quả xác minh: 15 kiểm thử tích hợp MongoDB qua; 4 unit test auth qua; luồng Chrome qua cả tạo → xem → sửa → xóa → hoàn tất → in PDF → reload. Build, typecheck, lint thành công. Các database kiểm thử đã được xóa sau khi chạy.
