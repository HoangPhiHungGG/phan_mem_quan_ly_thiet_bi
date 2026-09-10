export type LoanRef = {
  _id: string;
  name?: string;
  displayName?: string;
  code?: string;
};
export type LoanDevice = LoanRef & {
  assetCode: string;
  serial?: string;
  modelId?: LoanRef;
  techCondition?: string;
  keeperId?: LoanRef;
  loanId?: string;
  usageStatus?: string;
};
export type LoanLine = {
  deviceId?: LoanDevice;
  kind: string;
  deviceName?: string;
  assetCode?: string;
  serial?: string;
  conditionOut?: string;
  conditionOutDescription?: string;
  handoverCondition?: string;
  accessoryNote?: string;
  note?: string;
  handedOverAt?: string;
  returned?: boolean;
  returnedAt?: string;
  conditionIn?: string;
  conditionInDescription?: string;
  returnReceivedBy?: LoanRef;
  returnNote?: string;
  returnResult?: string;
};
export type LoanReturnItem = {
  deviceId: string;
  deviceName?: string;
  assetCode?: string;
  serial?: string;
  conditionOut?: string;
  conditionOutDescription?: string;
  conditionIn: string;
  conditionInDescription?: string;
  note?: string;
  result: string;
};
export type LoanReturn = {
  _id: string;
  returnedAt: string;
  recordedAt: string;
  receivedBy?: LoanRef;
  note?: string;
  items: LoanReturnItem[];
};
export type LoanRow = {
  _id: string;
  code: string;
  status: string;
  operationDate: string;
  dueDate?: string;
  sourceWarehouseId?: LoanRef;
  receiverKeeperId?: LoanRef;
  receiverDepartmentId?: LoanRef;
  reason: string;
  note?: string;
  createdBy?: LoanRef;
  createdAt?: string;
  updatedAt?: string;
  dispatchedBy?: LoanRef;
  dispatchedAt?: string;
  completedBy?: LoanRef;
  completedAt?: string;
  lines: LoanLine[];
  returnHistory?: LoanReturn[];
};
export const outConditions = [
  { value: "GOOD", label: "Tốt" },
  { value: "NORMAL", label: "Bình thường" },
  { value: "SCRATCHED", label: "Trầy xước nhẹ" },
  { value: "MINOR_FAULT", label: "Có lỗi nhẹ" },
  { value: "OTHER", label: "Khác" },
];
export const inConditions = [
  { value: "GOOD", label: "Tốt" },
  { value: "NORMAL", label: "Bình thường" },
  { value: "SCRATCHED", label: "Trầy xước" },
  { value: "BROKEN", label: "Hư hỏng" },
  { value: "MISSING_ACCESSORIES", label: "Thiếu phụ kiện" },
  { value: "LOST", label: "Mất thiết bị" },
  { value: "OTHER", label: "Khác" },
];
export const conditionLabel = (value?: string) =>
  [
    ...outConditions,
    ...inConditions,
    { value: "DEGRADED", label: "Suy giảm" },
  ].find((item) => item.value === value)?.label ??
  value ??
  "—";
export const resultLabel = (value?: string) =>
  ({
    IN_STOCK: "Trong kho",
    REPAIRING: "Chờ sửa chữa / kiểm tra",
    LOST: "Mất thiết bị",
    LENT: "Đang cho mượn",
    IN_USE: "Đang sử dụng",
    DISPOSED: "Đã thanh lý",
  })[value ?? ""] ??
  value ??
  "—";
export const resultForCondition = (condition: string) =>
  condition === "LOST"
    ? "LOST"
    : ["BROKEN", "MISSING_ACCESSORIES", "OTHER"].includes(condition)
      ? "REPAIRING"
      : "IN_STOCK";
export const loanPending = (row: LoanRow) =>
  ["DRAFT", "PENDING"].includes(row.status);
export const loanReturnable = (row: LoanRow) =>
  ["ACTIVE", "PARTIALLY_RETURNED", "COMPLETED", "PARTIAL"].includes(
    row.status,
  ) && row.lines.some((line) => line.kind === "DEVICE" && !line.returned);
export const loanStatus = (row: LoanRow) =>
  loanPending(row)
    ? "Chưa giao"
    : ({
        ACTIVE: "Đang mượn",
        COMPLETED: "Đang mượn",
        PARTIAL: "Trả một phần",
        PARTIALLY_RETURNED: "Trả một phần",
        RETURNED: "Đã trả",
      }[row.status] ?? row.status);
export const localLoanDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const overdueDays = (row: LoanRow, now = new Date()) =>
  loanReturnable(row) && row.dueDate
    ? Math.max(
        0,
        Math.round(
          (Date.parse(localLoanDay(now)) -
            Date.parse(localLoanDay(new Date(row.dueDate)))) /
            86400000,
        ),
      )
    : 0;
export const loanDate = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "—";
export const loanTimestamp = (value?: string) =>
  value
    ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "—";
export const loanDeviceName = (line: LoanLine) =>
  line.deviceName ??
  line.deviceId?.modelId?.name ??
  line.deviceId?.assetCode ??
  "—";
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function loanPrintHtml(row: LoanRow, batch?: LoanReturn) {
  const cells = (values: unknown[]) =>
    `<tr>${values.map((value) => `<td>${escape(value)}</td>`).join("")}</tr>`;
  const headers = batch
    ? [
        "Thiết bị",
        "Mã tài sản",
        "Serial",
        "Tình trạng lúc giao",
        "Tình trạng khi trả",
        "Kết quả xử lý",
        "Ghi chú",
      ]
    : [
        "Thiết bị",
        "Mã tài sản",
        "Serial",
        "Tình trạng khi giao",
        "Phụ kiện đi kèm",
        "Ghi chú",
      ];
  const body = batch
    ? batch.items
        .map((item) =>
          cells([
            item.deviceName,
            item.assetCode,
            item.serial,
            [conditionLabel(item.conditionOut), item.conditionOutDescription]
              .filter(Boolean)
              .join(" · "),
            [conditionLabel(item.conditionIn), item.conditionInDescription]
              .filter(Boolean)
              .join(" · "),
            resultLabel(item.result),
            item.note,
          ]),
        )
        .join("")
    : row.lines
        .map((line) =>
          cells([
            loanDeviceName(line),
            line.assetCode ?? line.deviceId?.assetCode,
            line.serial ?? line.deviceId?.serial,
            [
              conditionLabel(line.conditionOut ?? line.handoverCondition),
              line.conditionOutDescription,
            ]
              .filter(Boolean)
              .join(" · "),
            line.accessoryNote,
            line.note,
          ]),
        )
        .join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escape(row.code)}${batch ? " - Biên bản trả" : " - Phiếu mượn"}</title><style>body{font:14px Arial;color:#111;margin:24px}h1{text-align:center;font-size:22px}p,td{white-space:pre-wrap}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:8px;text-align:left}tr{break-inside:avoid}.sign{display:flex;justify-content:space-around;margin-top:36px;text-align:center}@page{size:A4 landscape;margin:15mm}</style></head><body><h1>${batch ? "BIÊN BẢN TRẢ THIẾT BỊ" : "PHIẾU MƯỢN THIẾT BỊ"}</h1><p>Mã phiếu mượn: ${escape(row.code)} — ${escape(loanStatus(row))}</p><p>${batch ? "Người trả" : "Người mượn"}: ${escape(row.receiverKeeperId?.displayName)} — Bộ phận: ${escape(row.receiverDepartmentId?.name)}</p><p>Kho quản lý thiết bị: ${escape(row.sourceWarehouseId?.name)}</p><p>Ngày mượn: ${escape(loanDate(row.operationDate))} — Hạn trả: ${escape(loanDate(row.dueDate))}</p><p>Mục đích mượn: ${escape(row.reason)}</p>${batch ? `<p>Ngày trả thực tế: ${escape(loanDate(batch.returnedAt))} — Người nhận lại: ${escape(batch.receivedBy?.displayName)}</p><p>Ghi chú lần trả: ${escape(batch.note)}</p>` : `<p>Người giao: ${escape((row.dispatchedBy ?? row.createdBy)?.displayName)}</p><p>Ghi chú: ${escape(row.note)}</p>`}<table><thead><tr>${headers.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table><div class="sign"><div>${batch ? "NGƯỜI TRẢ" : "NGƯỜI GIAO"}<br>(Ký, ghi rõ họ tên)</div><div>${batch ? "NGƯỜI NHẬN LẠI" : "NGƯỜI MƯỢN"}<br>(Ký, ghi rõ họ tên)</div></div></body></html>`;
}
