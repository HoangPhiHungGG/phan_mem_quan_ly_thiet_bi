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
      COMPONENT_TYPE_REFERENCE_INVALID:
        "Loại linh kiện không hợp lệ hoặc đã ngừng sử dụng.",
      COMPONENT_MODEL_REFERENCE_INVALID:
        "Model được chọn không thuộc danh mục linh kiện hoặc đã ngừng sử dụng.",
      DEVICE_MODEL_REFERENCE_INVALID:
        "Model được chọn không thuộc danh mục thiết bị hoặc đã ngừng sử dụng.",
      MODEL_COMPONENT_TYPE_MISMATCH:
        "Model linh kiện không thuộc loại linh kiện đã chọn.",
      DEVICE_LINE_REQUIRED: "Dòng thiết bị thiếu thông tin thiết bị.",
      DEVICE_ASSET_CODE_INVALID:
        "Mỗi thiết bị phải có một mã tài sản không trùng trong phiếu.",
      WAREHOUSE_QUERY_INVALID:
        "Bộ lọc hoặc mã kho không hợp lệ. Kiểm tra lại khoảng ngày và dữ liệu tìm kiếm.",
      WAREHOUSE_NOT_FOUND: "Không tìm thấy kho này.",
      LOAN_REQUIRED_FIELDS:
        "Nhập người mượn, ngày mượn, hạn trả, mục đích, kho và ít nhất một thiết bị.",
      LOAN_DUE_DATE_INVALID: "Hạn trả không được nhỏ hơn ngày mượn.",
      LOAN_DESTINATION_NOT_ALLOWED:
        "Phiếu mượn chỉ sử dụng kho quản lý ban đầu, không có kho nhận.",
      LOAN_REFERENCE_INVALID:
        "Người mượn, bộ phận hoặc kho không hợp lệ hay đã ngừng hoạt động.",
      LOAN_DEVICE_INVALID:
        "Mỗi dòng phải có một thiết bị, không được chọn trùng hay chọn linh kiện.",
      LOAN_CONDITION_REQUIRED:
        "Chọn tình trạng khi giao; mô tả chi tiết nếu chọn Khác.",
      LOAN_NOT_EDITABLE:
        "Chỉ được sửa, xóa hoặc hoàn tất giao phiếu chưa giao.",
      LOAN_NOT_RETURNABLE: "Phiếu không ở trạng thái cho phép trả thiết bị.",
      LOAN_RETURN_REQUIRED:
        "Nhập ngày trả và chọn ít nhất một thiết bị cùng tình trạng khi trả.",
      LOAN_RETURN_DEVICE_INVALID:
        "Thiết bị không thuộc phiếu, đã được trả hoặc không còn được mượn theo phiếu này.",
      LOAN_RETURN_DATE_INVALID: "Ngày trả phải từ ngày mượn đến ngày hiện tại.",
      LOAN_RETURN_CONDITION_REQUIRED:
        "Chọn tình trạng khi trả; bổ sung mô tả Khác hoặc ghi chú thiếu phụ kiện / mất thiết bị.",
      ISSUE_REQUIRED_FIELDS:
        "Nhập đầy đủ ngày, kho xuất, người nhận, bộ phận, lý do và danh sách cấp phát.",
      ISSUE_REFERENCE_INVALID:
        "Kho, người nhận, bộ phận hoặc vị trí không hợp lệ hay đã ngừng hoạt động.",
      RECOVERY_ISSUE_REQUIRED:
        "Phiếu thu hồi phải tham chiếu đến phiếu cấp phát.",
      RECOVERY_ISSUE_INVALID:
        "Phiếu cấp phát không tồn tại hoặc chưa hoàn tất.",
      DESTINATION_WAREHOUSE_REQUIRED: "Kho tiếp nhận thu hồi là bắt buộc.",
      NOT_AN_ISSUE: "Phiếu được chọn không phải là phiếu cấp phát.",
      ISSUE_NOT_COMPLETED: "Phiếu cấp phát chưa hoàn tất, không thể thu hồi.",
      OPERATION_NOT_EDITABLE:
        "Phiếu thu hồi đã hoàn tất hoặc không còn được phép xóa.",
      DEVICE_NOT_RECOVERABLE:
        "Thiết bị đã được thu hồi hoặc trạng thái hiện tại đã thay đổi.",
      RECOVERY_QUANTITY_EXCEEDED:
        "Số lượng thu hồi vượt quá số lượng còn lại của phiếu cấp phát.",
      OPERATION_LINE_INVALID:
        "Kiểm tra danh sách cấp phát, số lượng và tình trạng bàn giao.",
      OPERATION_DEVICE_INVALID:
        "Thiết bị bị trùng hoặc thông tin dòng thiết bị không hợp lệ.",
      DEVICE_NOT_AVAILABLE:
        "Thiết bị không còn khả dụng trong kho. Hãy tải lại và chọn thiết bị khác.",
      INSUFFICIENT_STOCK: "Linh kiện không đủ tồn kho để cấp phát.",
      ISSUE_NOT_EDITABLE: "Chỉ được sửa hoặc xóa phiếu cấp phát chưa hoàn tất.",
      OPERATION_TYPE_IMMUTABLE: "Không được thay đổi loại phiếu cấp phát.",
      OPERATION_CONCURRENT_UPDATE:
        "Phiếu đã được cập nhật bởi yêu cầu khác. Hãy tải lại danh sách.",
      RESOURCE_NOT_FOUND: "Không tìm thấy phiếu hoặc dữ liệu đã bị xóa.",
      OPERATION_CODE_REQUIRED: "Mã phiếu là bắt buộc.",
      OPERATION_CODE_EXISTS: "Mã phiếu đã tồn tại. Hãy nhập một mã phiếu khác.",
      IDEMPOTENCY_KEY_CONFLICT:
        "Yêu cầu trùng khóa nhưng dữ liệu khác nhau. Hãy tải lại trang và thử lại.",
      RECEIPT_CODE_EXISTS:
        "Mã phiếu nhập đã tồn tại. Hãy dùng mã khác hoặc mở phiếu nháp hiện có.",
      RECEIPT_INVALID_STATUS:
        "Phiếu nhập đã được xử lý hoặc không còn ở trạng thái cho phép thao tác.",
      ASSET_CODE_OR_SERIAL_EXISTS:
        "Mã tài sản hoặc serial đã tồn tại trong hệ thống.",
      DEVICE_NOT_AVAILABLE_FOR_RECEIPT:
        "Thiết bị không còn khả dụng để nhập kho.",
      SERIAL_DUPLICATE_IN_RECEIPT: "Serial bị trùng trong cùng phiếu nhập.",
      PART_SERIAL_DUPLICATE_IN_RECEIPT:
        "Serial linh kiện bị trùng trong cùng phiếu nhập.",
      PART_LINE_REQUIRED: "Dòng linh kiện chưa có thông tin linh kiện.",
      REPAIR_TARGET_REQUIRED:
        "Hãy chọn đúng một thiết bị hoặc linh kiện serial cần sửa.",
      REPAIR_DEVICE_INVALID: "Thiết bị không tồn tại hoặc đã ngừng sử dụng.",
      REPAIR_PART_SERIAL_INVALID: "Linh kiện serial không hợp lệ.",
      REPAIR_DEVICE_NOT_ELIGIBLE:
        "Thiết bị không còn đủ điều kiện sửa chữa. Hãy tải lại danh sách.",
      REPAIR_ALREADY_ACTIVE: "Thiết bị đã có một phiếu sửa chữa chưa kết thúc.",
      REPAIR_NOT_EDITABLE:
        "Chỉ được sửa hoặc xóa phiếu sửa chữa ở trạng thái Nháp.",
      REPAIR_INVALID_STATUS:
        "Trạng thái phiếu không cho phép thực hiện thao tác này.",
      REPAIR_CONCURRENT_UPDATE:
        "Phiếu vừa được cập nhật bởi yêu cầu khác. Hãy tải lại dữ liệu.",
      REPAIR_PARTS_WAREHOUSE_REQUIRED: "Hãy chọn kho lấy linh kiện thay thế.",
      REPAIR_PART_SERIAL_REQUIRED:
        "Linh kiện quản lý theo serial phải chọn đúng một serial.",
      REPAIR_PART_SERIAL_DUPLICATE:
        "Một serial linh kiện không thể dùng nhiều lần trong cùng phiếu.",
      REPAIR_PART_SERIAL_UNAVAILABLE:
        "Serial linh kiện không còn trong kho đã chọn.",
      REPAIR_KEEPER_REQUIRED:
        "Thiết bị không có người hoặc bộ phận trước đó để bàn giao lại.",
      REPAIR_DEVICE_STATE_CHANGED:
        "Trạng thái thiết bị đã thay đổi. Hãy tải lại phiếu trước khi xử lý.",
      LOCATION_REFERENCE_INVALID:
        "Vị trí không thuộc kho đã chọn hoặc đã ngừng sử dụng.",
      LIQUIDATION_LINES_REQUIRED: "Phiếu thanh lý phải có ít nhất một tài sản.",
      LIQUIDATION_LINE_INVALID: "Dòng tài sản thanh lý không hợp lệ.",
      LIQUIDATION_LINE_DUPLICATE:
        "Một tài sản không thể xuất hiện nhiều lần trong phiếu.",
      LIQUIDATION_DEVICE_INVALID:
        "Thiết bị không còn trong kho hoặc đang thuộc một nghiệp vụ khác. Hãy thu hồi trước khi thanh lý.",
      LIQUIDATION_SERIAL_INVALID:
        "Serial linh kiện không còn trong kho đã chọn.",
      LIQUIDATION_REPAIR_INVALID:
        "Phiếu sửa chữa không có kết luận Không thể sửa hoặc không thuộc thiết bị này.",
      LIQUIDATION_NOT_EDITABLE:
        "Chỉ được sửa phiếu thanh lý ở trạng thái Nháp.",
      LIQUIDATION_INVALID_STATUS:
        "Trạng thái phiếu không cho phép thao tác này.",
      LIQUIDATION_CONCURRENT_UPDATE:
        "Phiếu vừa được xử lý bởi yêu cầu khác. Hãy tải lại dữ liệu.",
      LIQUIDATION_ASSET_ALREADY_PENDING:
        "Một tài sản trong phiếu đã thuộc đề nghị thanh lý khác chưa kết thúc.",
      COUNT_SCOPE_REFERENCE_REQUIRED:
        "Hãy chọn kho, bộ phận hoặc vị trí đúng với phạm vi kiểm kê.",
      COUNT_SCOPE_REFERENCE_INVALID:
        "Phạm vi kiểm kê không hợp lệ hoặc đã ngừng hoạt động.",
      COUNT_NOT_EDITABLE: "Chỉ được sửa phiếu kiểm kê ở trạng thái Nháp.",
      COUNT_INVALID_STATUS:
        "Trạng thái phiếu không cho phép thực hiện thao tác này.",
      COUNT_CONCURRENT_UPDATE:
        "Dòng kiểm kê vừa được người khác cập nhật. Hãy tải lại phiếu.",
      COUNT_ACTUAL_REFERENCE_INVALID:
        "Người giữ hoặc vị trí thực tế không hợp lệ.",
      COUNT_ITEMS_UNCHECKED:
        "Còn tài sản chưa kiểm, chưa thể chuyển sang đối chiếu.",
      COUNT_DISCREPANCY_NOT_OPEN: "Chênh lệch này đã được xử lý.",
      COUNT_DISCREPANCIES_OPEN:
        "Còn chênh lệch chưa xử lý, chưa thể hoàn tất kiểm kê.",
      COUNT_ASSET_ALREADY_EXPECTED:
        "Tài sản này đã có trong danh sách snapshot cần kiểm.",
      COUNT_UNEXPECTED_DUPLICATE:
        "Tài sản phát sinh này đã được ghi nhận trong phiếu.",
      EMPLOYEE_REFERENCE_INVALID:
        "Nhân viên không tồn tại, đã nghỉ việc hoặc ngừng sử dụng.",
      EMPLOYEE_ALREADY_HAS_ACCOUNT: "Nhân viên này đã có tài khoản.",
      EMPLOYEE_CODE_REQUIRED: "Nhân viên chưa có mã nhân viên.",
      ROLE_REFERENCE_INVALID: "Vai trò không tồn tại hoặc đã ngừng sử dụng.",
      USER_ALREADY_EXISTS: "Mã nhân viên hoặc email đã có tài khoản.",
      LAST_ADMIN_PROTECTED:
        "Không thể khóa hoặc đổi vai trò của quản trị viên hoạt động cuối cùng.",
      CANNOT_LOCK_SELF:
        "Bạn không thể tự khóa hoặc vô hiệu hóa tài khoản đang đăng nhập.",
      CANNOT_DELETE_SELF: "Bạn không thể tự xóa tài khoản đang đăng nhập.",
      USER_HAS_BUSINESS_HISTORY:
        "Tài khoản đã phát sinh dữ liệu và không thể xóa. Vui lòng vô hiệu hóa tài khoản.",
      USER_STATUS_TRANSITION_INVALID:
        "Trạng thái tài khoản đã thay đổi hoặc thao tác này không còn phù hợp.",
      ADMIN_CHANGE_IN_PROGRESS:
        "Một thay đổi tài khoản quản trị khác đang được xử lý. Hãy thử lại.",
      SYSTEM_ADMIN_ROLE_PROTECTED:
        "Không thể tắt hoặc thu hồi quyền của vai trò Quản trị viên.",
      CURRENT_PASSWORD_INVALID: "Mật khẩu hiện tại không đúng.",
      PERMISSION_DEPENDENCY_REQUIRED:
        "Cần cấp quyền Xem trước khi cấp các quyền thao tác trong cùng module.",
      PASSWORD_CHANGE_REQUIRED:
        "Bạn cần đổi mật khẩu trước khi sử dụng chức năng này.",
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
  init: RequestInit = {},
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
      init,
    );
    allRows.push(...result.data);
    totalPages = result.meta.totalPages;
    page += 1;
  } while (page <= totalPages);

  return allRows;
}
