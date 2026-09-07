export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = `${encodeURIComponent(name)}=`;
  const part = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : undefined;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = readCookie("pmqltb_csrf");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: { message?: string; code?: string };
    code?: string;
  };
  if (!response.ok) {
    const rawMessage = Array.isArray(payload.message)
      ? payload.message.join(" ")
      : (payload.error?.message ?? payload.message);
    const knownMessages: Record<string, string> = {
      WAREHOUSE_REFERENCE_INVALID:
        "Kho nhập không hợp lệ hoặc đã ngừng sử dụng.",
      OPENING_SOURCE_AND_REASON_REQUIRED:
        "Nhập số dư đầu kỳ cần nhập nguồn dữ liệu và lý do.",
      PART_REFERENCE_INVALID: "Linh kiện không hợp lệ hoặc đã ngừng sử dụng.",
      PART_SERIAL_COUNT_MISMATCH:
        "Số serial phải đúng bằng số lượng linh kiện theo serial.",
      PART_SERIAL_COUNT_EXCEEDED:
        "Số serial không được lớn hơn số lượng linh kiện nhập.",
      PART_SERIAL_ALREADY_EXISTS:
        "Một hoặc nhiều serial đã tồn tại cho linh kiện này.",
      RECEIPT_ALREADY_COMPLETED:
        "Phiếu đã được hoàn tất, tồn kho không được ghi nhận lần hai.",
      RECEIPT_NOT_EDITABLE: "Chỉ được sửa phiếu đang ở trạng thái Nháp.",
      RECEIPT_NOT_REVERSIBLE: "Chỉ được đảo phiếu đã hoàn tất.",
      INSUFFICIENT_STOCK_TO_REVERSE:
        "Không thể đảo phiếu vì một phần hàng đã xuất khỏi kho (cấp phát/điều chuyển/thanh lý).",
      DEVICE_NOT_REVERSIBLE:
        "Không thể đảo phiếu vì thiết bị đã rời kho (cấp phát/điều chuyển/thanh lý).",
      PART_SERIAL_NOT_REVERSIBLE:
        "Không thể đảo phiếu vì có serial linh kiện đã xuất khỏi kho.",
      PART_SERIAL_NOT_ALLOWED:
        "Linh kiện quản lý theo số lượng không nhận serial.",
      DEVICE_LINE_REQUIRED: "Dòng thiết bị thiếu thông tin thiết bị.",
      DEVICE_ASSET_CODE_INVALID:
        "Mỗi thiết bị phải có một mã tài sản không trùng trong phiếu.",
      OPERATION_CODE_EXISTS: "Mã phiếu đã tồn tại. Hãy nhập một mã phiếu khác.",
      IDEMPOTENCY_KEY_CONFLICT:
        "Yêu cầu trùng khóa nhưng dữ liệu khác nhau. Hãy tải lại trang và thử lại.",
    };
    const code = payload.error?.code ?? payload.code;
    const error = new Error(
      knownMessages[code ?? ""] ?? rawMessage ?? "Yêu cầu không thành công.",
    );
    Object.assign(error, {
      status: response.status,
      code,
    });
    throw error;
  }
  return payload as T;
}

type PaginatedResult<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

/**
 * Retrieves every server page while retaining the filters supplied by the
 * caller. The API caps a single response at 100 records, so exports must not
 * use a single request as their data source.
 */
export async function apiFetchAllPages<T>(
  path: string,
  filters: URLSearchParams,
  pageSize = 100,
): Promise<T[]> {
  const allRows: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams(filters);
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    const result = await apiFetch<PaginatedResult<T>>(
      `${path}?${params.toString()}`,
    );
    allRows.push(...result.data);
    totalPages = result.meta.totalPages;
    page += 1;
  } while (page <= totalPages);

  return allRows;
}
