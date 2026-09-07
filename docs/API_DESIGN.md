# Thiết kế API dự kiến

## 1. Phạm vi

Tài liệu định nghĩa quy ước và hợp đồng REST dự kiến để duyệt. Bước 2 không triển khai controller, DTO, guard hoặc collection. API có prefix `/api/v1`; các endpoint nền hiện tại `/api/health`, `/api/health/ready`, `/api/docs` được giữ nguyên.

## 2. Quy ước giao tiếp

- JSON UTF-8; field dùng `camelCase`; enum dùng `UPPER_SNAKE_CASE`.
- ID là chuỗi ObjectId 24 ký tự hex trong API.
- Thời gian nhận/trả ISO 8601 có timezone, lưu UTC; ví dụ `2026-09-04T08:30:00.000Z`.
- Ngày nghiệp vụ không có giờ dùng `YYYY-MM-DD` và được mô tả rõ là local date.
- Số lượng truyền JSON string nếu dùng Decimal128, ví dụ `"2.5"`.
- Tiền: `{ "amountMinor": "1250000", "currency": "VND" }`; không nhận float.
- `Content-Type: application/json`; upload file dùng luồng presigned hoặc multipart riêng.
- Mọi response có `requestId`; không trả URI database, stack trace, token hash hoặc dữ liệu bí mật.

### Response thành công

```json
{
  "data": {
    "id": "66d8...",
    "version": 3
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

### Response lỗi

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Dữ liệu đã được người khác cập nhật.",
    "details": [
      {
        "field": "version",
        "reason": "STALE_VALUE"
      }
    ]
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

Thông báo phục vụ người dùng bằng tiếng Việt; `code` ổn định để frontend xử lý.

## 3. Xác thực và phân quyền

- Access token ngắn hạn trong `Authorization: Bearer`; refresh token ưu tiên cookie `HttpOnly`, `Secure`, `SameSite=Lax/Strict` tùy mô hình triển khai.
- Mọi endpoint trừ login/refresh/health cần xác thực.
- Backend kiểm tra permission + department scope + warehouse scope + quan hệ đối tượng + trạng thái.
- Filter quyền được đưa vào database query; không tải toàn bộ rồi lọc trong application.
- Field nhạy cảm như tiền/audit được loại khỏi projection nếu không có quyền.
- Duyệt kiểm tra chống tự duyệt trong transaction, không chỉ trong UI.

## 4. Mã HTTP và mã lỗi

| HTTP | Code điển hình                                                                                                                                      | Ý nghĩa                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`, `INVALID_FILTER`, `INVALID_STATE_TRANSITION`                                                                                    | Request sai hoặc chuyển trạng thái không hợp lệ            |
| 401  | `AUTH_REQUIRED`, `TOKEN_EXPIRED`, `SESSION_REVOKED`                                                                                                 | Chưa xác thực/phiên hết hiệu lực                           |
| 403  | `PERMISSION_DENIED`, `SCOPE_DENIED`, `SELF_APPROVAL_FORBIDDEN`                                                                                      | Có danh tính nhưng không đủ quyền                          |
| 404  | `RESOURCE_NOT_FOUND`                                                                                                                                | Không tồn tại hoặc không được phép biết tài nguyên tồn tại |
| 409  | `VERSION_CONFLICT`, `DUPLICATE_ASSET_CODE`, `DUPLICATE_SERIAL`, `INSUFFICIENT_STOCK`, `IDEMPOTENCY_KEY_CONFLICT`, `IDEMPOTENCY_REQUEST_IN_PROGRESS` | Xung đột dữ liệu/trạng thái                                |
| 410  | `RESOURCE_GONE`                                                                                                                                     | Tài nguyên tạm đã hết hạn, nếu cần                         |
| 413  | `FILE_TOO_LARGE`, `TOO_MANY_LINES`                                                                                                                  | Vượt giới hạn                                              |
| 415  | `UNSUPPORTED_MEDIA_TYPE`                                                                                                                            | File/content type không hỗ trợ                             |
| 422  | `BUSINESS_RULE_VIOLATION`, `REFERENCE_INACTIVE`                                                                                                     | Hợp lệ cú pháp nhưng vi phạm nghiệp vụ                     |
| 429  | `RATE_LIMITED`                                                                                                                                      | Quá giới hạn request                                       |
| 500  | `INTERNAL_ERROR`                                                                                                                                    | Lỗi không dự kiến, không lộ chi tiết                       |
| 503  | `DEPENDENCY_UNAVAILABLE`                                                                                                                            | Database/storage chưa sẵn sàng                             |

Validation lỗi có đường dẫn field dạng `lines[2].quantity` và không trả raw Mongoose error.

## 5. Phân trang, sắp xếp, tìm kiếm và lọc

### Cursor pagination mặc định

```http
GET /api/v1/devices?limit=25&after=eyJjcmVhdGVkQXQi...&sort=-createdAt
```

```json
{
  "data": [],
  "page": {
    "limit": 25,
    "nextCursor": null,
    "hasNext": false
  },
  "meta": { "requestId": "req_..." }
}
```

- `limit` mặc định 25, tối đa 100.
- Cursor ký/mã hóa từ các trường sort và `_id`; client không tự sửa.
- Sort luôn có `_id` làm tie-breaker.
- Offset/page chỉ dùng cho báo cáo nhỏ cần nhảy trang, giới hạn độ sâu.
- Allowlist field sort/filter theo resource; field lạ trả `INVALID_FILTER`.

### Filter chung

- `q`: prefix/token search trên mã, tên, serial đã chuẩn hóa.
- `createdFrom`, `createdTo`: ISO timestamp; quy ước `[from, to)`.
- Nhiều enum/ID lặp bằng dấu phẩy hoặc query lặp; API chọn một chuẩn duy nhất khi triển khai.
- Ví dụ thiết bị: `itemModelId`, `categoryId`, `usageStatus`, `condition`, `warehouseId`, `departmentId`, `custodianUserId`, `hasSerial`.
- Ví dụ chứng từ: `type`, `status`, `requestDepartmentId`, `warehouseId`, `requesterUserId`, `from`, `to`.
- Scope của caller luôn được AND với filter, không cho filter mở rộng quyền.

## 6. Concurrency và idempotency

### Optimistic concurrency

Request cập nhật/chuyển trạng thái gửi một trong hai dạng:

```http
If-Match: "3"
```

hoặc body có `version: 3`. Đề xuất chuẩn hóa `If-Match` cho update resource và `expectedVersion` trong command action. Không khớp trả `409 VERSION_CONFLICT` kèm version hiện tại nếu caller được xem.

### Idempotency

Các POST tạo resource và command tác động tồn yêu cầu:

```http
Idempotency-Key: 6ea14a16-...
```

- Scope = user + method + route/action.
- Canonicalize body, relevant query và resource ID rồi SHA-256 thành `requestHash`.
- Cùng key + cùng hash: trả status/body/resource của lần thành công đầu, có header `Idempotency-Replayed: true`.
- Cùng key + hash khác: `409 IDEMPOTENCY_KEY_CONFLICT`.
- Key đang chạy: `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` và có thể kèm `Retry-After`.
- Lỗi validation trước khi bắt đầu không cần cache. Kết quả nghiệp vụ đã commit phải được cache; retry sau mất kết nối không chạy lại.
- Key đề xuất giữ 24 giờ cho command thông thường, lâu hơn cho import/bulk sau khi xác nhận.

## 7. Validation chung

- ObjectId đúng định dạng chưa đủ; phải batch-check resource tồn tại, active và đúng scope.
- String trim, giới hạn độ dài, chặn null byte; mã/serial chuẩn hóa theo thiết kế dữ liệu.
- Enum dùng allowlist; không nhận giá trị tự do.
- Quantity phải dương, đúng precision của đơn vị; thiết bị serialized luôn bằng 1.
- Mảng dòng tối thiểu 1, tối đa 500; không lặp device trong cùng command.
- Ngày hết hạn/trả không trước ngày yêu cầu/giao.
- Tiền cùng currency mới được cộng; amount phải là chuỗi integer có phạm vi hợp lệ.
- Người nhận/bộ phận/kho/location phải nhất quán.
- DTO dùng `whitelist`, `forbidNonWhitelisted`, transform có kiểm soát; không dùng implicit boolean conversion mơ hồ.

## 8. Resource API dự kiến

### 8.1. Auth và người dùng

| Method          | Endpoint                      | Mục đích                 | Quyền                    |
| --------------- | ----------------------------- | ------------------------ | ------------------------ |
| POST            | `/auth/login`                 | Đăng nhập                | Public + rate limit      |
| POST            | `/auth/refresh`               | Đổi access token         | Session hợp lệ           |
| POST            | `/auth/logout`                | Thu hồi session hiện tại | Authenticated            |
| GET             | `/me`                         | Hồ sơ và quyền hiệu lực  | Authenticated            |
| GET/POST        | `/users`                      | Danh sách/tạo người dùng | `users.read/manage`      |
| GET/PATCH       | `/users/:id`                  | Xem/cập nhật             | Self hoặc `users.manage` |
| GET/POST/DELETE | `/users/:id/role-assignments` | Gán/thu hồi vai trò      | `roles.assign`           |
| GET/POST/PATCH  | `/roles`                      | Vai trò                  | `roles.read/manage`      |

`POST /auth/login` không cho biết email có tồn tại; lock/rate-limit theo account và IP phù hợp. Response không trả refresh token nếu dùng cookie.

### 8.2. Danh mục

Resource chuẩn: `/departments`, `/warehouses`, `/warehouse-locations`, `/suppliers`, `/item-categories`, `/units`, `/item-models`.

Mỗi resource có:

- `GET /resource`: list có scope/filter.
- `POST /resource`: tạo.
- `GET /resource/:id`: chi tiết.
- `PATCH /resource/:id`: cập nhật với version.
- `POST /resource/:id/deactivate`: ngừng dùng thay vì hard-delete.

Không cho deactivate khi còn quan hệ hoạt động mà không có phương án thay thế. Mã đã dùng không được tái sử dụng tùy tiện.

### 8.3. Thiết bị

| Method | Endpoint                   | Mục đích                                                      |
| ------ | -------------------------- | ------------------------------------------------------------- |
| GET    | `/devices`                 | Tìm/lọc thiết bị theo scope                                   |
| POST   | `/devices`                 | Tạo thủ công ngoại lệ; nhập kho là luồng chuẩn                |
| GET    | `/devices/:id`             | Trạng thái hiện tại                                           |
| PATCH  | `/devices/:id`             | Chỉ sửa metadata cho phép, không sửa trực tiếp trạng thái/tồn |
| GET    | `/devices/:id/timeline`    | Cursor timeline                                               |
| GET    | `/devices/:id/documents`   | Chứng từ liên quan                                            |
| GET    | `/devices/:id/attachments` | Tệp liên quan                                                 |

Ví dụ tạo metadata:

```json
{
  "assetCode": "TB-2026-000001",
  "itemModelId": "66d8...",
  "serial": null,
  "condition": "GOOD",
  "warehouseId": "66d9...",
  "locationId": "66da..."
}
```

Response bao gồm `permissions.allowedActions` để UI dựng nút nhưng backend vẫn kiểm tra lại.

### 8.4. Chứng từ nghiệp vụ

Endpoint chung:

| Method       | Endpoint                          | Mục đích                          |
| ------------ | --------------------------------- | --------------------------------- |
| GET          | `/documents`                      | Danh sách theo type/status/scope  |
| POST         | `/documents`                      | Tạo nháp                          |
| GET          | `/documents/:id`                  | Header và page đầu của lines      |
| PATCH        | `/documents/:id`                  | Sửa khi `DRAFT`                   |
| GET          | `/documents/:id/lines`            | Phân trang dòng                   |
| POST         | `/documents/:id/lines`            | Thêm dòng khi `DRAFT`             |
| PATCH/DELETE | `/documents/:id/lines/:lineId`    | Sửa/xóa dòng nháp                 |
| POST         | `/documents/:id/actions/submit`   | Gửi duyệt                         |
| POST         | `/documents/:id/actions/approve`  | Duyệt và có thể giữ chỗ           |
| POST         | `/documents/:id/actions/reject`   | Từ chối, bắt buộc lý do           |
| POST         | `/documents/:id/actions/cancel`   | Hủy phần hợp lệ                   |
| POST         | `/documents/:id/actions/reserve`  | Chọn/giữ hàng nếu tách khỏi duyệt |
| POST         | `/documents/:id/handovers`        | Giao một phần/toàn phần           |
| POST         | `/documents/:id/receipts`         | Xác nhận nhận                     |
| POST         | `/documents/:id/actions/complete` | Đóng phần đã xử lý                |

Tạo chứng từ:

```json
{
  "type": "ALLOCATION",
  "requestDepartmentId": "66d8...",
  "sourceWarehouseId": "66d9...",
  "beneficiaryUserId": "66da...",
  "purpose": "Cấp máy làm việc",
  "lines": [
    {
      "itemModelId": "66db...",
      "quantity": "1"
    }
  ]
}
```

Command duyệt:

```json
{
  "expectedVersion": 2,
  "comment": "Đồng ý cấp phát",
  "lines": [
    {
      "lineId": "66dc...",
      "approvedQuantity": "1"
    }
  ]
}
```

### 8.5. Tồn và giữ chỗ

| Method | Endpoint                     | Quy tắc                                              |
| ------ | ---------------------------- | ---------------------------------------------------- |
| GET    | `/inventory/balances`        | Scope kho; `onHand/reserved/available`               |
| GET    | `/inventory/transactions`    | Ledger read-only, filter document/item/device        |
| GET    | `/inventory/reservations`    | Reservation trong scope                              |
| POST   | `/inventory/adjustments`     | Tạo chứng từ điều chỉnh, không sửa balance trực tiếp |
| POST   | `/inventory/reconcile/check` | Chỉ quyền kiểm soát; so balance/ledger, không tự sửa |

Không có endpoint generic `PATCH /inventory/balances/:id`.

### 8.6. Mượn/trả, bàn giao và sửa chữa

- Mượn là `documents.type=LOAN`; trả qua `POST /documents/:loanId/returns`.
- `GET /handovers/:id`, `POST /handovers/:id/actions/confirm`, `POST /handovers/:id/actions/dispute`.
- `/repair-orders` có list/create/detail/update draft và các command `send`, `diagnose`, `start`, `complete`, `cancel`.
- Hoàn tất sửa chữa bắt buộc `conditionAfter`, ngày hoàn tất và chi phí nếu có quyền/áp dụng.

### 8.7. Mua sắm, kiểm kê, thanh lý

Các namespace mở rộng:

- `/purchase-requests` với submit/approve/reject/cancel.
- `/stocktakes` với start/count/reconcile/complete; dữ liệu đếm có thể bulk theo batch và idempotent.
- `/disposals` với submit/approve/execute/complete/cancel.

Thiết bị chỉ sang `DISPOSED` trong command execute/complete đã duyệt; không qua PATCH device.

### 8.8. Tệp và audit

- `POST /attachments/upload-intents`: validate owner/quyền/mime/size, trả upload target.
- `POST /attachments/:id/actions/complete`: xác nhận checksum/scan.
- `GET /attachments/:id/download`: URL ngắn hạn sau kiểm tra quyền.
- `DELETE /attachments/:id`: soft-delete nếu owner còn cho phép sửa.
- `GET /audit-logs`: quyền nhạy cảm, filter và cursor; không có update/delete.

## 9. Quy tắc chuyển trạng thái

Backend dùng state machine theo loại chứng từ. Baseline:

| Từ                           | Action   | Đến                                 | Điều kiện chính                                    |
| ---------------------------- | -------- | ----------------------------------- | -------------------------------------------------- |
| DRAFT                        | submit   | PENDING_APPROVAL                    | Đủ field/dòng/reference                            |
| PENDING_APPROVAL             | approve  | APPROVED                            | Đúng approver, không tự duyệt, đủ tồn nếu giữ ngay |
| PENDING_APPROVAL             | reject   | REJECTED                            | Lý do bắt buộc                                     |
| DRAFT/PENDING_APPROVAL       | cancel   | CANCELLED                           | Người tạo/được phép, chưa giao                     |
| APPROVED                     | handover | PARTIALLY_FULFILLED hoặc COMPLETED  | Đã giữ/chọn hàng, đúng người giao                  |
| PARTIALLY_FULFILLED          | handover | PARTIALLY_FULFILLED hoặc COMPLETED  | Không vượt remaining                               |
| APPROVED/PARTIALLY_FULFILLED | cancel   | CANCELLED hoặc giữ PARTIAL rồi đóng | Chỉ phần chưa giao, giải phóng giữ chỗ             |

- Transition phải kiểm tra status và version trong câu update.
- Action không hợp lệ trả `400 INVALID_STATE_TRANSITION` với `allowedActions`.
- Từ `COMPLETED`, `REJECTED`, `CANCELLED` không sửa trực tiếp; dùng chứng từ điều chỉnh/đảo.
- Trạng thái header được suy ra/xác nhận từ trạng thái lines trong cùng transaction.

## 10. Quyền theo endpoint

Mỗi handler khai báo permission nhỏ nhất, ví dụ:

```text
documents.allocation.create
documents.allocation.submit
documents.allocation.approve
inventory.reserve
inventory.issue
devices.read
devices.read_cost
audit.read
```

Policy service nhận actor, action, resource và context; trả allow/deny cùng filter scope. Không mã hóa vai trò trực tiếp trong controller (`if role === ...`). Điều này cho phép một người nhiều vai trò và quyền theo kho/bộ phận.

## 11. Phi chức năng và an toàn

- Request body JSON đề xuất tối đa 1 MB; file đi endpoint riêng.
- Rate limit login, search nặng, export và upload.
- Timeout database và transaction; retry có giới hạn.
- Log structured với requestId/userId/action, redaction token/password/URI.
- OpenAPI sinh từ DTO và có examples/error schemas.
- Contract test cho pagination, validation, permission, transition, idempotency và concurrency.
- Không đưa transaction-test endpoint ra production; bảo vệ bằng environment hoặc loại khỏi production module.

## 12. Điểm cần duyệt trước triển khai

1. Access/refresh token hay session cookie hoàn toàn; provider đăng nhập nào?
2. Prefix `/api/v1` và cursor pagination có được chấp thuận không?
3. Chọn `If-Match` hay `expectedVersion` làm chuẩn chính?
4. Giữ chỗ ngay lúc approve hay command reserve riêng?
5. Người nhận bắt buộc tự confirm hay thủ kho được confirm thay?
6. Quy tắc trả 404 thay 403 để tránh lộ tài nguyên có áp dụng toàn hệ thống không?
7. Retention idempotency 24 giờ có đủ không?
8. Giới hạn 500 dòng/chứng từ và 100 bản ghi/trang có phù hợp không?
