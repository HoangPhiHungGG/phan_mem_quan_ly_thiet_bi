import { apiFetchAllPages } from "./api";

export type CatalogOption = {
  value: string;
  label: string;
  deviceTypeId?: string;
  componentTypeId?: string;
  warehouseId?: string;
  departmentId?: string;
};

/** Tải danh sách options cho select (chỉ danh mục đang hoạt động). */
export async function loadCatalogOptions(
  type: string,
  filters: {
    deviceTypeId?: string;
    componentTypeId?: string;
    warehouseId?: string;
    departmentId?: string;
    positionId?: string;
    status?: string;
  } = {},
): Promise<CatalogOption[]> {
  const params = new URLSearchParams({ isActive: "true", limit: "100" });
  if (filters.deviceTypeId) params.set("deviceTypeId", filters.deviceTypeId);
  if (filters.componentTypeId)
    params.set("componentTypeId", filters.componentTypeId);
  if (filters.warehouseId) params.set("warehouseId", filters.warehouseId);
  if (filters.departmentId) params.set("departmentId", filters.departmentId);
  if (filters.positionId) params.set("positionId", filters.positionId);
  if (filters.status) params.set("status", filters.status);
  const data = await apiFetchAllPages<Record<string, unknown>>(
    `/api/catalog/${type}`,
    params,
  );
  return data.map((item) => ({
    value: String(item._id),
    label:
      String(item.displayName ?? item.name ?? "") +
      (item.code ? ` (${String(item.code)})` : ""),
    deviceTypeId:
      item.deviceTypeId && typeof item.deviceTypeId === "object"
        ? String((item.deviceTypeId as { _id?: unknown })._id ?? "")
        : item.deviceTypeId
          ? String(item.deviceTypeId)
          : undefined,
    componentTypeId:
      item.componentTypeId && typeof item.componentTypeId === "object"
        ? String((item.componentTypeId as { _id?: unknown })._id ?? "")
        : item.componentTypeId
          ? String(item.componentTypeId)
          : undefined,
    warehouseId:
      item.warehouseId && typeof item.warehouseId === "object"
        ? String((item.warehouseId as { _id?: unknown })._id ?? "")
        : item.warehouseId
          ? String(item.warehouseId)
          : undefined,
    departmentId:
      item.departmentId && typeof item.departmentId === "object"
        ? String((item.departmentId as { _id?: unknown })._id ?? "")
        : item.departmentId
          ? String(item.departmentId)
          : undefined,
  }));
}

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  GOOD: "Tốt",
  DEGRADED: "Suy giảm",
  BROKEN: "Hỏng",
};

export const USAGE_STATUS_LABELS: Record<string, string> = {
  NOT_RECEIVED: "Chưa nhập kho",
  IN_STOCK: "Trong kho",
  IN_USE: "Đang sử dụng",
  REPAIRING: "Đang sửa chữa",
  LENT: "Đang cho mượn",
  LOST: "Mất thiết bị",
  DISPOSED: "Đã thanh lý",
};

export const PART_TRACKING_LABELS: Record<string, string> = {
  QUANTITY: "Theo số lượng",
  SERIAL: "Theo serial (từng chiếc)",
};

export const PART_SERIAL_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "Trong kho",
  RESERVED: "Đã đặt trước",
  ISSUED: "Đã cấp phát",
  REPAIRING: "Đang sửa chữa",
  BROKEN: "Hỏng",
  DISPOSED: "Đã thanh lý",
};

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("vi-VN");
}

export function formatMoney(value?: number | null): string {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}
