# Thiết kế dữ liệu và Mongoose dự kiến

## 1. Trạng thái tài liệu

Đây là thiết kế logic để duyệt cho Bước 2. Chưa tạo collection, Mongoose schema, seed hoặc migration. Tên trường dùng tiếng Anh trong database/API; nhãn tiếng Việt thuộc frontend.

Thiết kế giả định một tổ chức trong một database, VND là tiền tệ mặc định, người dùng có một bộ phận chính và có thể được cấp phạm vi bổ sung. Các giả định này cần được xác nhận trước khi triển khai.

## 2. Nguyên tắc chung

### Kiểu và trường chuẩn

Mọi collection nghiệp vụ dùng:

```ts
{
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: ObjectId;
  updatedBy?: ObjectId;
  version: number;      // optimistic concurrency
  isActive?: boolean;   // danh mục có thể ngừng dùng, không hard-delete
}
```

- Mongoose bật `timestamps: true`, `optimisticConcurrency: true` cho aggregate có cập nhật.
- Thời gian lưu bằng BSON `Date` theo UTC. API nhận/trả ISO 8601 có `Z`; UI hiển thị `Asia/Ho_Chi_Minh`.
- Không lưu chuỗi ngày giờ địa phương không có offset.
- ID bên ngoài phải kiểm tra đúng ObjectId và tham chiếu còn tồn tại/đang hoạt động trong service; MongoDB không có foreign key.
- Không dùng `populate` không giới hạn; query chủ động trường cần thiết hoặc aggregation.
- Không hard-delete chứng từ, giao dịch tồn, lịch sử và audit log.

### Tiền

Dùng số nguyên theo đơn vị tiền nhỏ nhất trong BSON `Long`, không dùng `Number` dấu phẩy động:

```ts
type Money = {
  amountMinor: Long; // API truyền chuỗi thập phân, ví dụ "1250000"
  currency: string; // ISO 4217, mặc định VND
};
```

- VND có scale 0; tiền tệ khác dùng số chữ số thập phân theo ISO 4217.
- Tính tổng bằng `Long`/BigInt hoặc thư viện money; JSON response trả `amountMinor` dưới dạng string để tránh vượt giới hạn số an toàn của JavaScript.
- `unitPrice`, `taxAmount`, `discountAmount`, `totalAmount` đều theo cấu trúc này.

### Chuẩn hóa mã và serial

- `codeNormalized`: Unicode NFKC, trim, uppercase; mã do hệ thống sinh không chứa khoảng trắng.
- `assetCodeNormalized`: quy tắc trên; unique toàn hệ thống, kể cả tài sản đã thanh lý.
- `serial` được phép `null`/không có. Chuỗi rỗng sau trim phải lưu `null`, không lưu `""`.
- `serialNormalized`: Unicode NFKC, trim, uppercase, gộp chuỗi khoảng trắng liên tiếp thành một khoảng trắng; giữ nguyên dấu `-`, `/` và ký tự có ý nghĩa.
- Phạm vi chống trùng serial đề xuất: unique theo `{ brandNormalized, serialNormalized }` khi serial tồn tại. Cùng serial chỉ được lặp giữa hai hãng khác nhau. Nếu chưa biết hãng, dùng giá trị chuẩn `UNKNOWN`, vì vậy các serial chưa rõ hãng vẫn chống trùng với nhau.
- Chuẩn hóa được thực hiện ở application trước validation và có migration backfill trước khi tạo unique index.

## 3. Nhúng và tham chiếu

### Nhúng khi

- Dữ liệu nhỏ, có giới hạn rõ, chỉ có ý nghĩa trong document cha.
- Cần snapshot lịch sử không thay đổi theo danh mục hiện tại.
- Luôn được đọc cùng document cha.

Ví dụ: thông tin phạm vi trong một assignment vai trò, snapshot tên hàng/người trên dòng chứng từ, địa chỉ nhà cung cấp, tổng tiền.

### Tham chiếu khi

- Thực thể có vòng đời riêng hoặc được nhiều aggregate sử dụng.
- Danh sách có thể tăng không giới hạn.
- Cần phân trang, lọc hoặc index độc lập.

Vì vậy dòng chứng từ, giao dịch tồn, lịch sử thiết bị, tệp và audit log là collection riêng. Tuyệt đối không nhúng mảng lịch sử tăng vô hạn vào `devices`.

## 4. Danh sách collection

### 4.1. Danh tính và tổ chức

#### `users`

```ts
{
  employeeCode: string;
  employeeCodeNormalized: string;
  email: string;
  emailNormalized: string;
  displayName: string;
  phone?: string;
  passwordHash?: string;          // không có nếu chỉ dùng SSO
  authProvider: "LOCAL" | "MICROSOFT" | "GOOGLE" | "AD";
  providerSubject?: string;
  primaryDepartmentId: ObjectId;
  status: "INVITED" | "ACTIVE" | "LOCKED" | "DISABLED";
  lastLoginAt?: Date;
}
```

Index:

- Unique `{ employeeCodeNormalized: 1 }`.
- Unique `{ emailNormalized: 1 }`.
- Unique partial `{ authProvider: 1, providerSubject: 1 }` khi có `providerSubject`.
- `{ primaryDepartmentId: 1, status: 1, displayName: 1 }`.
- Text search không ưu tiên cho MVP; dùng prefix search trên các trường normalized.

#### `auth_sessions`

```ts
{
  userId: ObjectId;
  refreshTokenHash: string;       // chỉ lưu hash
  familyId: string;               // phát hiện refresh-token reuse
  userAgent?: string;
  ipHash?: string;
  expiresAt: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  revokeReason?: string;
}
```

Index: unique `refreshTokenHash`; `{ userId: 1, revokedAt: 1 }`; TTL `{ expiresAt: 1 }` với `expireAfterSeconds: 0`. TTL chỉ dọn session hết hạn, không dùng cho dữ liệu nghiệp vụ.

#### `roles`

```ts
{
  code: string;
  codeNormalized: string;
  name: string;
  description?: string;
  permissions: string[];          // danh sách bounded, ví dụ documents.approve
  system: boolean;
  isActive: boolean;
}
```

Index unique `codeNormalized`. `permissions` được nhúng vì nhỏ, luôn đi cùng role và có giới hạn bởi catalog quyền trong code.

#### `user_role_assignments`

```ts
{
  userId: ObjectId;
  roleId: ObjectId;
  scope: {
    departmentMode: "SELF" | "OWN_DEPARTMENT" | "DEPARTMENT_TREE" |
      "SELECTED_DEPARTMENTS" | "ALL_DEPARTMENTS";
    departmentIds: ObjectId[];
    warehouseMode: "NONE" | "ASSIGNED_WAREHOUSES" | "ALL_WAREHOUSES";
    warehouseIds: ObjectId[];
    itemCategoryIds: ObjectId[];
  };
  validFrom: Date;
  validUntil?: Date;
  grantedBy: ObjectId;
  revokedAt?: Date;
}
```

Index unique partial `{ userId: 1, roleId: 1, "scope.scopeKey": 1 }` nếu tạo `scopeKey` ổn định; index tra quyền `{ userId: 1, revokedAt: 1, validFrom: 1, validUntil: 1 }`.

#### `departments`

```ts
{
  code: string;
  codeNormalized: string;
  name: string;
  parentId?: ObjectId;
  ancestorIds: ObjectId[];        // materialized path, bounded theo độ sâu tổ chức
  managerUserId?: ObjectId;
  isActive: boolean;
}
```

Index: unique `codeNormalized`; `{ parentId: 1, isActive: 1 }`; `{ ancestorIds: 1, isActive: 1 }`. Khi chuyển cây phòng ban phải cập nhật node và descendants trong transaction hoặc migration có kiểm soát.

### 4.2. Danh mục kho và hàng hóa

#### `warehouses`

```ts
{
  code: string;
  codeNormalized: string;
  name: string;
  departmentId?: ObjectId;
  address?: { line?: string; ward?: string; province?: string };
  keeperUserIds: ObjectId[];      // bounded; quyền thực tế vẫn từ assignment
  isActive: boolean;
}
```

Index unique `codeNormalized`; `{ departmentId: 1, isActive: 1 }`.

#### `warehouse_locations`

```ts
{
  warehouseId: ObjectId;
  code: string;
  codeNormalized: string;
  name: string;
  type: "ZONE" | "RACK" | "SHELF" | "BIN" | "QUARANTINE";
  parentId?: ObjectId;
  path: string;
  isActive: boolean;
}
```

Index unique `{ warehouseId: 1, codeNormalized: 1 }`; `{ warehouseId: 1, parentId: 1, isActive: 1 }`.

#### `suppliers`

```ts
{
  code: string;
  codeNormalized: string;
  name: string;
  taxCode?: string;
  taxCodeNormalized?: string;
  contacts: Array<{ name: string; email?: string; phone?: string }>;
  address?: { line?: string; ward?: string; province?: string };
  isActive: boolean;
}
```

Contacts/address được nhúng và giới hạn số lượng. Index unique `codeNormalized`; unique partial `taxCodeNormalized`; `{ name: 1, isActive: 1 }`.

#### `item_categories`

```ts
{
  code: string;
  codeNormalized: string;
  name: string;
  parentId?: ObjectId;
  trackingMode: "SERIALIZED" | "QUANTITY";
  consumptionType: "ASSET" | "COMPONENT" | "CONSUMABLE";
  isActive: boolean;
}
```

Index unique `codeNormalized`; `{ parentId: 1, isActive: 1 }`.

#### `units_of_measure`

```ts
{
  code: string;
  codeNormalized: string;
  name: string;
  precision: number; // 0 cho chiếc; giới hạn 0..6
  isActive: boolean;
}
```

Index unique `codeNormalized`.

#### `item_models`

Đây là mã hàng/SKU hoặc model, không phải thiết bị từng chiếc.

```ts
{
  sku: string;
  skuNormalized: string;
  name: string;
  categoryId: ObjectId;
  unitId: ObjectId;
  brand?: string;
  brandNormalized: string;        // mặc định UNKNOWN
  modelNumber?: string;
  specifications: Record<string, string | number | boolean>;
  trackingMode: "SERIALIZED" | "QUANTITY";
  consumptionType: "ASSET" | "COMPONENT" | "CONSUMABLE";
  reorderPoint?: Decimal128;      // số lượng, không phải tiền
  isActive: boolean;
}
```

Index: unique `skuNormalized`; `{ categoryId: 1, isActive: 1, name: 1 }`; `{ brandNormalized: 1, modelNumber: 1 }`; Atlas Search hoặc text index chỉ bổ sung khi có nhu cầu thật. `specifications` phải giới hạn key/size và không chứa key bắt đầu `$` hoặc có `.`.

### 4.3. Thiết bị từng chiếc

#### `devices`

```ts
{
  assetCode: string;
  assetCodeNormalized: string;
  itemModelId: ObjectId;
  serial?: string | null;
  serialNormalized?: string | null;
  brandNormalized: string;        // snapshot từ model để index serial
  usageStatus: "AVAILABLE" | "RESERVED" | "IN_USE" |
    "ON_LOAN" | "IN_REPAIR" | "DISPOSED";
  condition: "GOOD" | "DEGRADED" | "BROKEN" | "UNKNOWN";
  warehouseId?: ObjectId;
  locationId?: ObjectId;
  custodianUserId?: ObjectId;
  departmentId?: ObjectId;
  reservedByDocumentId?: ObjectId;
  parentDeviceId?: ObjectId;      // linh kiện serialized đang lắp
  acquiredAt?: Date;
  warrantyUntil?: Date;
  purchasePrice?: Money;
  currentAssignmentVersion: number;
  disposedAt?: Date;
}
```

Index:

- Unique `{ assetCodeNormalized: 1 }`.
- Unique partial `{ brandNormalized: 1, serialNormalized: 1 }` với `serialNormalized` kiểu string.
- `{ itemModelId: 1, usageStatus: 1, condition: 1 }`.
- `{ warehouseId: 1, locationId: 1, usageStatus: 1 }`.
- `{ custodianUserId: 1, usageStatus: 1 }`.
- `{ departmentId: 1, usageStatus: 1 }`.
- `{ reservedByDocumentId: 1 }` partial.
- `{ parentDeviceId: 1 }` partial.

`devices` chỉ giữ trạng thái hiện tại để đọc nhanh. Timeline, bàn giao, sửa chữa và thay đổi tình trạng nằm ở collection riêng, không có mảng lịch sử vô hạn.

### 4.4. Chứng từ và dòng chi tiết

#### `business_documents`

```ts
{
  documentNo: string;
  documentNoNormalized: string;
  type: "RECEIPT" | "ALLOCATION" | "LOAN" | "TRANSFER" |
    "RECALL" | "ADJUSTMENT" | "RETURN";
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" |
    "PARTIALLY_FULFILLED" | "COMPLETED" | "REJECTED" | "CANCELLED";
  requestDepartmentId?: ObjectId;
  sourceWarehouseId?: ObjectId;
  destinationWarehouseId?: ObjectId;
  requesterUserId: ObjectId;
  beneficiaryUserId?: ObjectId;
  purpose: string;
  requestedAt: Date;
  dueAt?: Date;
  submittedAt?: Date;
  approvedAt?: Date;
  completedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
  reasonCode?: string;
  reasonText?: string;
  lineCount: number;
  totals?: { subtotal: Money; tax: Money; grandTotal: Money };
  originalDocumentId?: ObjectId;  // điều chỉnh/đảo nghiệp vụ
  currentApprovalStep?: number;
}
```

Index: unique `documentNoNormalized`; `{ type: 1, status: 1, createdAt: -1 }`; `{ requestDepartmentId: 1, status: 1, createdAt: -1 }`; `{ sourceWarehouseId: 1, status: 1 }`; `{ destinationWarehouseId: 1, status: 1 }`; `{ requesterUserId: 1, createdAt: -1 }`; `{ beneficiaryUserId: 1, createdAt: -1 }`; `{ currentApprovalStep: 1, status: 1 }`.

#### `document_lines`

```ts
{
  documentId: ObjectId;
  lineNo: number;
  itemModelId: ObjectId;
  deviceId?: ObjectId;
  snapshot: {
    sku: string;
    itemName: string;
    unitCode: string;
    brand?: string;
    modelNumber?: string;
    assetCode?: string;
    serial?: string;
  };
  quantityRequested: Decimal128;
  quantityApproved: Decimal128;
  quantityReserved: Decimal128;
  quantityFulfilled: Decimal128;
  quantityClosed: Decimal128;
  unitPrice?: Money;
  conditionBefore?: string;
  conditionAfter?: string;
  dueAt?: Date;
  lineStatus: "OPEN" | "RESERVED" | "PARTIAL" | "FULFILLED" | "CLOSED";
  closeReason?: string;
}
```

Dòng tách collection để phân trang, giao nhiều đợt và tránh vượt giới hạn 16 MB. `snapshot` được nhúng để chứng từ lịch sử không đổi khi tên danh mục đổi. Index unique `{ documentId: 1, lineNo: 1 }`; `{ documentId: 1, lineStatus: 1 }`; `{ deviceId: 1, createdAt: -1 }` partial; `{ itemModelId: 1, createdAt: -1 }`.

#### `document_approvals`

```ts
{
  documentId: ObjectId;
  step: number;
  assignedRoleId?: ObjectId;
  assignedUserId?: ObjectId;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
  actedBy?: ObjectId;
  actedAt?: Date;
  comment?: string;
  delegationId?: ObjectId;
}
```

Index unique `{ documentId: 1, step: 1 }`; `{ assignedUserId: 1, status: 1, createdAt: 1 }`. Việc duyệt kiểm tra người tạo/người hưởng để chống tự duyệt.

### 4.5. Tồn kho

#### `inventory_transactions`

Sổ cái append-only; một record cho một biến động hàng tại một kho/vị trí.

```ts
{
  transactionNo: string;
  documentId: ObjectId;
  documentLineId: ObjectId;
  type: "RECEIPT" | "ISSUE" | "TRANSFER_OUT" | "TRANSFER_IN" |
    "RETURN" | "ADJUST_IN" | "ADJUST_OUT" | "RESERVE" | "RELEASE";
  warehouseId: ObjectId;
  locationId?: ObjectId;
  itemModelId: ObjectId;
  deviceId?: ObjectId;
  quantityDelta: Decimal128;      // reserve/release không đổi onHand
  reservedDelta: Decimal128;
  occurredAt: Date;
  performedBy: ObjectId;
  reversalOfId?: ObjectId;
}
```

Index unique `transactionNo`; unique partial `reversalOfId` nếu chỉ cho đảo một lần; `{ documentId: 1, occurredAt: 1 }`; `{ itemModelId: 1, warehouseId: 1, occurredAt: -1 }`; `{ deviceId: 1, occurredAt: -1 }`. Không update/delete record đã ghi sổ; tạo bút toán đảo.

#### `inventory_balances`

```ts
{
  warehouseId: ObjectId;
  locationId?: ObjectId;
  itemModelId: ObjectId;
  onHand: Decimal128;
  reserved: Decimal128;
  available: Decimal128;         // cache = onHand - reserved
  version: number;
  lastTransactionAt?: Date;
}
```

Unique `{ warehouseId: 1, locationId: 1, itemModelId: 1 }`. Balance là projection cập nhật trong cùng transaction với ledger. Mỗi ghi phải kiểm tra `available >= requested` và `version` mong đợi; có job đối soát balance với ledger.

#### `inventory_reservations`

```ts
{
  documentId: ObjectId;
  documentLineId: ObjectId;
  warehouseId: ObjectId;
  locationId?: ObjectId;
  itemModelId: ObjectId;
  deviceId?: ObjectId;
  quantity: Decimal128;
  fulfilledQuantity: Decimal128;
  status: "ACTIVE" | "PARTIAL" | "FULFILLED" | "RELEASED" | "EXPIRED";
  expiresAt?: Date;
  releasedAt?: Date;
  releaseReason?: string;
}
```

Index unique partial `{ deviceId: 1, status: 1 }` cho trạng thái active/partial của thiết bị định danh; `{ documentLineId: 1, status: 1 }`; `{ warehouseId: 1, itemModelId: 1, status: 1 }`; `{ expiresAt: 1, status: 1 }`. Không dùng TTL vì hết hạn phải giải phóng balance bằng transaction nghiệp vụ.

### 4.6. Lịch sử vòng đời

#### `device_events`

Timeline append-only chung cho thiết bị:

```ts
{
  deviceId: ObjectId;
  eventType: "RECEIVED" | "RESERVED" | "ALLOCATED" | "LOANED" |
    "RETURNED" | "TRANSFERRED" | "RECALLED" | "REPAIR_OPENED" |
    "REPAIR_COMPLETED" | "CONDITION_CHANGED" | "DISPOSED";
  documentId?: ObjectId;
  documentLineId?: ObjectId;
  occurredAt: Date;
  actorUserId: ObjectId;
  from: { warehouseId?: ObjectId; departmentId?: ObjectId; userId?: ObjectId;
    status?: string; condition?: string };
  to: { warehouseId?: ObjectId; departmentId?: ObjectId; userId?: ObjectId;
    status?: string; condition?: string };
  note?: string;
}
```

Index `{ deviceId: 1, occurredAt: -1, _id: -1 }`; `{ documentId: 1 }`. Timeline phân trang cursor, không nhúng vào `devices`.

#### `handovers`

Mỗi lần giao/nhận thực tế, kể cả giao một phần:

```ts
{
  documentId: ObjectId;
  sequence: number;
  fromUserId?: ObjectId;
  toUserId?: ObjectId;
  handedOverBy: ObjectId;
  receivedBy?: ObjectId;
  handedOverAt: Date;
  receivedAt?: Date;
  status: "PENDING_RECEIPT" | "RECEIVED" | "DISPUTED" | "CANCELLED";
  lines: Array<{ documentLineId: ObjectId; deviceId?: ObjectId;
    quantity: Decimal128; condition: string; note?: string }>;
  signatureAttachmentIds: ObjectId[];
}
```

`lines` được nhúng vì thuộc một lần bàn giao và giới hạn, đề xuất tối đa 200 dòng. Index unique `{ documentId: 1, sequence: 1 }`; `{ toUserId: 1, status: 1, handedOverAt: -1 }`.

#### `loan_returns`

```ts
{
  loanDocumentId: ObjectId;
  handoverId?: ObjectId;
  sequence: number;
  returnedBy: ObjectId;
  receivedBy: ObjectId;
  returnedAt: Date;
  lines: Array<{ documentLineId: ObjectId; deviceId: ObjectId;
    condition: string; note?: string }>;
  status: "RECEIVED" | "DISPUTED" | "COMPLETED";
}
```

Index unique `{ loanDocumentId: 1, sequence: 1 }`; `{ "lines.deviceId": 1, returnedAt: -1 }`.

#### `repair_orders`

```ts
{
  repairNo: string;
  deviceId: ObjectId;
  status: "DRAFT" | "SENT" | "DIAGNOSING" | "REPAIRING" |
    "WAITING_PARTS" | "COMPLETED" | "CANCELLED";
  supplierId?: ObjectId;
  reportedBy: ObjectId;
  symptom: string;
  diagnosis?: string;
  sentAt?: Date;
  expectedAt?: Date;
  completedAt?: Date;
  conditionBefore: string;
  conditionAfter?: string;
  estimatedCost?: Money;
  actualCost?: Money;
}
```

Index unique `repairNo`; `{ deviceId: 1, createdAt: -1 }`; unique partial `{ deviceId: 1, activeKey: 1 }` để mỗi thiết bị chỉ có một phiếu sửa đang mở.

### 4.7. Mua sắm, kiểm kê và thanh lý

#### `purchase_requests`

```ts
{
  requestNo: string;
  departmentId: ObjectId;
  requesterUserId: ObjectId;
  status: string;
  purpose: string;
  neededBy?: Date;
  lines: Array<{ itemModelId?: ObjectId; description: string;
    quantity: Decimal128; unitId: ObjectId; estimatedUnitPrice?: Money }>;
  totalEstimated?: Money;
  selectedSupplierId?: ObjectId;
}
```

Mảng dòng được nhúng ở giai đoạn mở rộng nếu giới hạn 200; nếu cần đấu thầu/báo giá theo từng dòng thì tách collection. Index unique `requestNo`; `{ departmentId: 1, status: 1, createdAt: -1 }`.

#### `stocktakes` và `stocktake_lines`

Header có `stocktakeNo`, kho/phạm vi, `snapshotAt`, trạng thái, người phụ trách. Line riêng gồm expected/actual/difference, deviceId hoặc itemModelId/locationId, condition và resolution. Index unique `stocktakeNo`; line unique theo `{ stocktakeId, deviceId }` hoặc `{ stocktakeId, itemModelId, locationId }`. Chốt kiểm kê không tự sửa tồn; sinh chứng từ điều chỉnh được duyệt.

#### `disposals` và `disposal_lines`

Header có `disposalNo`, lý do, phương thức, hội đồng/người duyệt, ngày và giá trị thu hồi. Line riêng tham chiếu device, condition, bookValue/recoveryValue dạng `Money`. Chỉ hoàn tất mới chuyển thiết bị sang `DISPOSED`; không xóa device. Index unique `disposalNo`; unique partial trên `disposal_lines.deviceId` với disposal đang hoạt động cần được bảo đảm bằng transaction/service hoặc `activeKey` denormalized.

### 4.8. Tệp, audit, idempotency và migration

#### `attachments`

```ts
{
  ownerType: "DOCUMENT" |
    "DEVICE" |
    "HANDOVER" |
    "REPAIR" |
    "PURCHASE" |
    "STOCKTAKE" |
    "DISPOSAL";
  ownerId: ObjectId;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: Long;
  sha256: string;
  uploadedBy: ObjectId;
  uploadedAt: Date;
  status: "PENDING" | "READY" | "QUARANTINED" | "DELETED";
}
```

Binary lưu object storage/GridFS, không nhúng base64. Index unique `storageKey`; `{ ownerType: 1, ownerId: 1, uploadedAt: -1 }`; `{ sha256: 1 }` không unique vì một file có thể gắn nhiều nghiệp vụ.

#### `audit_logs`

```ts
{
  actorUserId?: ObjectId;
  action: string;
  entityType: string;
  entityId?: ObjectId;
  requestId: string;
  occurredAt: Date;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

Append-only; loại bỏ password/token/file binary khỏi before/after. Index `{ entityType: 1, entityId: 1, occurredAt: -1 }`; `{ actorUserId: 1, occurredAt: -1 }`; `{ requestId: 1 }`. Retention/archive cần chính sách riêng, không TTL mặc định.

#### `idempotency_keys`

```ts
{
  userId: ObjectId;
  scope: string;                  // HTTP method + normalized route/business action
  key: string;
  requestHash: string;            // SHA-256 canonical body + relevant params
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  responseStatus?: number;
  responseBody?: unknown;         // giới hạn kích thước, không chứa secret
  resourceType?: string;
  resourceId?: ObjectId;
  lockedUntil?: Date;
  expiresAt: Date;
}
```

Unique `{ userId: 1, scope: 1, key: 1 }`; TTL `expiresAt`. Cùng key và cùng `requestHash` trả lại status/body hoặc resource cũ. Cùng key nhưng hash khác trả `409 IDEMPOTENCY_KEY_CONFLICT`. Key đang xử lý trả `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` hoặc chờ ngắn có giới hạn. Record idempotency phải được tạo/hoàn tất trong ranh giới đảm bảo không thực thi nghiệp vụ hai lần.

#### `schema_migrations`

```ts
{
  version: string;                // ví dụ 20260904_001
  name: string;
  checksum: string;
  status: "RUNNING" | "APPLIED" | "FAILED";
  startedAt: Date;
  finishedAt?: Date;
  appliedBy: string;
  details?: string;
}
```

Unique `version`, unique `checksum` theo chính sách. Migration nằm trong source, chạy explicit ngoài app startup. Quy trình: preflight → backup/restore test → backfill theo batch có checkpoint → kiểm tra duplicate → tạo index hidden/non-unique nếu phù hợp → validate → unique index → ghi version. Index destructive hoặc drop field cần kế hoạch rollback riêng.

## 5. Transaction boundaries

Các thao tác sau phải dùng MongoDB transaction:

1. **Duyệt và giữ chỗ:** kiểm tra document/version/quyền → tạo reservation → cập nhật balance reserved/available → cập nhật line/header → event/audit/idempotency.
2. **Giao hoặc nhập:** khóa logic bằng version → ghi inventory transactions → cập nhật balances → fulfillment lines → trạng thái device hiện tại → handover/device events → header → audit.
3. **Trả/thu hồi:** cập nhật handover/return → device, balance nếu về kho → event → document.
4. **Điều chuyển kho:** `TRANSFER_OUT` và `TRANSFER_IN`, hai balance và device/location thay đổi cùng transaction; không để hàng mất giữa hai kho.
5. **Hủy/giải phóng:** cập nhật reservation, balance và document cùng transaction.
6. **Hoàn tất sửa chữa/thanh lý/điều chỉnh:** trạng thái hiện tại, ledger/chứng từ liên quan và event cùng transaction.

Không gọi dịch vụ ngoài hoặc upload file trong transaction. Dùng outbox nếu sau này cần email/webhook; commit trước rồi worker xử lý.

## 6. Chống cập nhật đồng thời

- Client gửi `version` hoặc HTTP `If-Match`; update dùng điều kiện `{ _id, version, status }` và `$inc: { version: 1 }`.
- Không match trả `409 VERSION_CONFLICT`, client tải lại dữ liệu.
- Balance update dùng điều kiện `available >= quantity` cùng version; không đọc rồi ghi tách rời.
- Unique index là lớp bảo vệ cuối cho mã tài sản, serial và số chứng từ.
- Transition trạng thái dùng allowlist `from → to`, không chấp nhận status tùy ý từ client.
- Retry transaction chỉ cho lỗi transient và toàn bộ command phải có idempotency key.
- Mỗi thiết bị serialized chỉ có tối đa một reservation active và một quy trình sửa/thanh lý active.

## 7. Kiểm tra tham chiếu

Trước khi ghi, service phải batch-load và xác nhận:

- User/department/warehouse/location/item/model/unit/supplier tồn tại và active.
- Location thuộc đúng warehouse.
- User thuộc hoặc được ủy quyền cho department.
- Device thuộc item model và trạng thái/tình trạng cho phép.
- Document line thuộc đúng document.
- Kho nguồn/đích khác nhau khi điều chuyển.
- Attachment owner tồn tại và caller có quyền với owner.

Các tham chiếu cần giữ lịch sử vẫn được phép trỏ đến danh mục đã inactive; không được trỏ đến ID không tồn tại. Với dữ liệu hiển thị lịch sử, dùng snapshot nhúng bên cạnh reference.

## 8. Quyết định cần duyệt

1. Xác nhận một tổ chức/database hay cần `tenantId` trên mọi collection.
2. Xác nhận serial unique theo hãng như đề xuất hay unique toàn hệ thống.
3. Xác nhận VND-only trong MVP; thiết kế vẫn lưu `currency` để mở rộng.
4. Xác nhận số lượng chỉ nguyên hay cần Decimal128 đến 6 chữ số cho mét/kg.
5. Xác nhận giới hạn 200 dòng mỗi lần bàn giao và 500 dòng mỗi chứng từ.
6. Xác nhận giữ chỗ phát sinh lúc duyệt và có/không có thời hạn.
7. Xác nhận chuyển kho nguyên tử hay cần trạng thái `IN_TRANSIT` và hai bước gửi/nhận.
8. Xác nhận provider đăng nhập để chốt trường session/password.
9. Xác nhận thời gian lưu session, idempotency record, audit log và attachment.
10. Xác nhận có lưu giá mua trong MVP và vai trò được xem tiền.
